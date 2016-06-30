"use strict";
const EventEmitter = require('events');
const Logger = require('./logger');
const logger = new Logger('[lucene-search]', 'e');
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

class LuceneSearch extends EventEmitter {
	constructor(query, movie) {
		super();
logger.s('lucene',query, movie);
		this.type = 'lucene';
		this.store = new Store('telegram');
		this.query = `t:*_${query.replace(/\s+/g,'_')}_*`;
		if (movie) {
			this.query += ` AND m:*${movie.replace(/\s+/g,'_')}*`;
		}
		logger.s('lucene2',this.query);
		this.buffer = new Buffer();
		this.filling = false; //flag
		this.loading = false; //flag
		this.processing = false; //flag
		this.filteredCount = 0;
		this.skip = 0;
		this.lastPhrase = {}
		this.ended = false; //flag
		this.id = Util.gen(ID_LENGTH);


		this.on('add', () => {
			logger.l('on Add');
			if (!this.loading) this.startLoadVideo();
		});
	}
//http://localhost:5984/_fti/local/phrasio/_design/bar/m_t?q=t:*_know_it_*%20AND%20m:*futur*&include_docs=true
	init() {
		return new Promise((resolve, reject) => {
			rp.get({
				url: 'http://localhost:5984/_fti/local/phrasio/_design/bar/m_t',
				json: true,
				qs: {
					q: this.query,
					include_docs: true,
					skip: 0
				}
			})
				.then((res)=> {
					logger.s('Search Init OK', res.rows[0]);
						this.rawCount = res.count;
						this.fillBuffer(res.rows);
						resolve({
							count: res.total_rows
						});
				})
				.catch((error)=> {
					logger.e('Search Init Request Error', error);
					reject(error);
				});
		})
	}

	//fillBuffer*****************************************************************************************
	fillBuffer(feed) {
		this.filling = true;
		if (feed && feed[0]) {
			feed.forEach((item) => {
					let doc = item.doc;
					this.buffer.enqueue(
						{
							_id: doc._id,
							skip: this.skip,
							caption: doc.text,
							searchText: doc.searchText,
							info: doc.info,
							imdb: doc.imdb,
							movie: doc.movie,
							number: this.filteredCount,
							loaded: false
						}
					)
					this.filteredCount++;
					this.emit('add');
				this.skip++;
			})
		}
		if (this.ended || (this.buffer.size > MIN_BUFFER)) {
			this.filling = false;
			return;
		}
		rp.get({
			url: 'http://localhost:5984/_fti/local/phrasio/_design/bar/m_t',
			json: true,
			qs: {
				q: this.query,
				include_docs: true,
				skip: this.skip
			}
		})
			.then((res)=> {
					if (res.rows.length == 0) {
						this.ended = true;
						this.emit('end');
					} else {
						this.fillBuffer(res.rows);
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
			logger.l('loadItemVideo', item.skip, item._id);
			this.store.get(item._id)
				.then((doc)=> {
					logger.s('get doc',item._id);
					if (doc && doc._attachments && doc._attachments.video && doc._attachments.video.stub && (doc._attachments.video.length > 100)) {//video already saved in DB
						item.loaded = true;
						item.tfid = doc.tfid; //may be null
						resolve();
					} else {//not saved yet
						//save phrase
						this.store.save(item._id, {
							text: item.caption,
							searchText: item.searchText,
							info: item.info,
							imdb: item.imdb,
							movie: item.movie
						})
							.then((res) => {
								//download and save video as attachment
								bhttp.get('http://playphrase.me/video/phrase/' + item._id.substring(2) + '.mp4')
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
										return this.store.saveAttach(item._id, 'audio', 'audio/ogg', data)
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
module.exports = LuceneSearch;