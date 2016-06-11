"use strict";
const EventEmitter = require('events');
const Logger = require('./logger');
const logger = new Logger('[search]','e','./my.log');
const rp = require('request-promise');
const request = require('request');
const Buffer = require('./buffer.js');
const Store = require('./store.js');
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
			feed.forEach((item) => {
				if (!this.movie || this.filter(item)) {
					this.buffer.enqueue(
						{
							_id: item._id,
							skip: this.skip,
							caption: item.text,
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
		return Math.floor(this.skip/this.rawCount*100);
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
		for(let i=0;i< this.buffer.size;i++){
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
loadItemVideo(item)	{
	return new Promise((resolve, reject) => {
		logger.l('loadItemVideo', item.skip);
			this.store.get('p', item._id)
				.then((doc)=> {
					if (doc && doc._attachments && doc._attachments.video && doc._attachments.video.stub && (doc._attachments.video.length > 0)) {//video already saved in DB
						item.loaded = true;
						item.tfid = doc.tfid; //may be null
						resolve();
					} else {//not saved yet
						var writeToAttachStream;
						//save phrase
						this.store.save('p', item._id, {
							text: item.caption,
							info: item.info,
							imdb: item.imdb,
							movie: item.movie
						})
							.then((res) => {
								//and save video as attachment
								var attachmentData = {
									name: 'video',
									'Content-Type': 'video/mp4'
								}
								var self = this;
								writeToAttachStream = self.store.db.saveAttachment({id: res.id, rev: res.rev}, attachmentData,
									function (error, res) {
										if (error) {
											logger.e('error saveAttachment', error);
											reject(error);
										} else {
											item.loaded = true;
											resolve();
										}
									}
								)
								request('http://playphrase.me/video/phrase/' + item._id + '.mp4').pipe(writeToAttachStream);
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

//_load********************************************************************
	_load(i) {
		logger.l('_load(i)', i);
		if (i >= this.buffer.size) {
			logger.l('i >= this.buffer.size', this.buffer.size);
			this.loading = false;
		} else {
			let item = this.buffer.item(i);
			logger.l('item', item.skip ,item.loaded);
			if (item.loaded) {
				logger.l('item.loaded');
				this._load(++i);//go to next
			} else {
				this.store.get('p', item._id)
					.then((doc)=> {
						if (doc && doc._attachments && doc._attachments.video && doc._attachments.video.stub && (doc._attachments.video.length > 0)) {//video already saved in DB
							item.loaded = true;
							item.tfid = doc.tfid; //may be null
							if (i == 0) this.emit('ready');
							this._load(0);//restart from begining
						} else {//not saved yet


							var writeToAttachStream;
							//save phrase
							this.store.save('p', item._id, {
								text: item.caption,
								info: item.info,
								imdb: item.imdb,
								movie: item.movie
							})
								.then((res) => {
									//and save video as attachment
									var attachmentData = {
										name: 'video',
										'Content-Type': 'video/mp4'
									}
									var self = this;
									writeToAttachStream = self.store.db.saveAttachment({id: res.id, rev: res.rev}, attachmentData,
										function (error, res) {
											if (error) {
												logger.e('error saveAttachment', error);
											} else {
												item.loaded = true;
												if (i == 0) self.emit('ready');
												self._load(0);//restart from begining
											}
										}
									)
									request('http://playphrase.me/video/phrase/' + item._id + '.mp4').pipe(writeToAttachStream);
								})
								.catch((error)=> {
									logger.e('error Save PhraseToDB', error);
								})
						}
					})
					.catch((error)=> {
						logger.e('[error get from DB]', error);
					})
			}
		}
	}

}
module.exports = Search;