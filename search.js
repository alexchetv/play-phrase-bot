"use strict";
const EventEmitter = require('events');
const Logger = require('./logger');
const logger = new Logger('[search]', 'e');
const rp = require('request-promise');
const bhttp = require("bhttp");
const Buffer = require('./buffer.js');
const Store = require('./store.js');
const Phrasio = require('./phrasio.js');
const Temp = require('./temp');
//const temp = new Temp('K:/');
const GoogleSpeech = require('./googlespeech.js');
const MIN_BUFFER = 10;
const Util = require('./util.js');
const ID_LENGTH = 16;

class Search extends EventEmitter {
	constructor(query, movie) {
		super();
		this.store = new Store('telegram');
		this.query = query;
		this.movie = movie;
		this.buffer = new Buffer();
		this.filling = false; //flag
		this.loading = false; //flag
		this.processing = false; //flag
		this.filteredCount = 0;
		this.skip = 0;
		this.lastPhrase = {}
		this.ended = false; //flag
		this.id = Util.gen(ID_LENGTH);
		//filter by movie title function
		this.filter = this.movie ? (item) => {
			return (item.video_info.info.split('/')[0].toLowerCase().includes(this.movie))
		} : null;
		this.on('add', () => {
			logger.l('on Add');
			if (!this.loading) this.startLoadVideo();
		});
	}

	init() {
		return new Promise((resolve, reject) => {
			rp.get({
				url: 'http://playphrase.me:9093/search',
				json: true,
				qs: {
					q: this.query,
					skip: 0
				}
			})
				.then((res)=> {
					if (res.result == 'OK') {
						this.rawCount = res.count;
						this.fillBuffer(res.phrases);
						resolve({
							count: res.count,
							suggestions: res.suggestions
						});
					} else {
						throw res;
					}

				})
				.catch((error)=> {
					logger.e('Search Init Request Error', error)
					reject(error);
				});
		})
	}

	//fillBuffer*****************************************************************************************
	fillBuffer(feed) {
		this.filling = true;
		if (feed && feed[0]) {
			Phrasio.save(feed);
			feed.forEach((item) => {
				if (!this.movie || this.filter(item)) {
					this.buffer.enqueue(
						{
							_id: item._id,
							skip: this.skip,
							caption: item.text,
							searchText: item.searchText,
							info: item.video_info.info,
							imdb: item.video_info.imdb,
							movie: item.movie,
							number: this.filteredCount,
							loaded: false
						}
					)
					this.filteredCount++;
					this.emit('add');
				}
				this.skip++;
			})
		}
		if (this.ended || (this.buffer.size > MIN_BUFFER)) {
			this.filling = false;
			return;
		}
		rp.get({
			url: 'http://playphrase.me:9093/search',
			json: true,
			qs: {
				q: this.query,
				skip: this.skip
			}
		})
			.then((res)=> {
				if (res.result == 'OK') {
					if (res.phrases.length == 0) {
						this.ended = true;
						this.emit('end');
					} else {
						this.fillBuffer(res.phrases);
					}
				} else {
					throw res;
				}
			})
			.catch((error)=> {
				this.filling = false;
				logger.e('Search Phrase Request Error', error)
			});
	}

	getProgress() {
		if (this.rawCount === undefined) return 0;
		if (this.rawCount === 0) return 100;
		return Math.floor(this.skip / this.rawCount * 100);
	}

	//getPhrase*****************************************************************************************
	getPhrase() {
		if (!this.filling) {
			this.fillBuffer();
		}
		logger.l('getPhrase');
		return new Promise((resolve, reject) => {
			if (this.buffer.size > 0 && this.buffer.peek().loaded) {
				logger.l('loaded');
				resolve(this.buffer.dequeue());
			} else {
				if (this.buffer.size == 0 && this.ended) {
					logger.l('size == 0 && ended');
					resolve(null);
				} else {
					this.once('ready', () => {
						logger.l('once ready');
						resolve(this.buffer.dequeue());
					});
					this.once('end', () => {
						if (this.buffer.size == 0) {
							logger.l('size == 0 && once end');
							resolve(null);
						}
					});
				}
			}
		})

	}

	//getNext*****************************************************************************************
	getNext() {

		return new Promise((resolve, reject) => {
			if (this.buffer.size > 0) {
				resolve(true);
			} else {
				if (this.ended) {
					resolve(false);
				} else { //wait
					this.once('add', () => {
						resolve(true);
					});
					this.once('end', () => {
						resolve(false);
					});
				}
			}
		})
	}

//startLoadVideo********************************************************************
	startLoadVideo() {
		logger.l('startLoadVideo');
		this.loading = true;
		for (let i = 0; i < this.buffer.size; i++) {
			let item = this.buffer.item(i);
			if (!item.loaded) {
				this.loadItemVideo(item)
					.then(() => {
						if (i == 0) this.emit('ready');
						this.startLoadVideo()
					});
				return;
			}
		}
		this.loading = false;
	}

//loadItemVideo********************************************************************
	loadItemVideo(item) {
		return new Promise((resolve, reject) => {
			let savedBody;
			logger.l('loadItemVideo', item.skip);
			this.store.get('p', item._id)
				.then((doc)=> {
					if (doc && doc._attachments && doc._attachments.video && doc._attachments.video.stub && (doc._attachments.video.length > 0)) {//video already saved in DB
						item.loaded = true;
						item.tfid = doc.tfid; //may be null
						resolve();
					} else {//not saved yet
						//save phrase
						this.store.save('p', item._id, {
							text: item.caption,
							searchText: item.searchText,
							info: item.info,
							imdb: item.imdb,
							movie: item.movie
						})
							.then((res) => {
								//download and save video as attachment
								bhttp.get('http://playphrase.me/video/phrase/' + item._id + '.mp4')
									.catch((err) => {
										logger.e('download Video Error', err);
									})
									.then((data) => {
										savedBody = data.body;
										logger.s('download Video OK');
										return this.store.saveAttach(res.id, 'video', 'video/mp4', savedBody)
									})
									.then(() => {
										logger.s('saveVideoAttachment OK',item._id);
										return Temp.write(savedBody)
									})
									.then(inFile => {
										return GoogleSpeech.convert(inFile, 'opus')
									})
									.then(outFile => {
										return Temp.read(outFile)
									})
									.then(data => {
										return this.store.saveAttach('p:'+item._id, 'audio', 'audio/ogg', data)
									})
									.then(() => {
										logger.s('saveAudioAttachment OK',item._id);
										item.loaded = true;
										resolve();
									})
									.catch((err) => {
										logger.e('error saveAttachment', err);
										reject(err);
									})
							})
							.catch((error)=> {
								logger.e('error Save PhraseToDB', error);
								reject(error);
							})
					}
				})
				.catch((error)=> {
					logger.e('[error get from DB]', error);
				})


		})
	}

}
module.exports = Search;