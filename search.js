"use strict";
const EventEmitter = require('events');
const rp = require('request-promise');
const Buffer = require('./buffer.js');
const MIN_BUFFER = 10;

class Search extends EventEmitter {
	constructor(query, movie) {
		super();
		this.query = query;
		this.movie = movie;
		this.buffer = new Buffer();
		this.filling = false; //flag
		this.total = 0;
		this.skip = 0;
		this.ended = false;
		const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
		const ID_LENGTH = 16;
		let generate = () => {
			let rtn = '';
			for (let i = 0; i < ID_LENGTH; i++) {
				rtn += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
			}
			return rtn;
		}
		this.id = generate();
		this.filter = this.movie ? (item) => {
			return (item.video_info.info.split('/')[0].toLowerCase().includes(this.movie))
		} : null
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
					//console.log(res);
					if (res.result == 'OK') {
						this.fillBuffer(res.phrases);
						//console.log('buffer+++++++++++++++++++++',this.buffer);
						resolve({
							count: res.count,
							suggestions: res.suggestions,
							id: this.id
						});
					} else {
						throw res;
					}

				})
				.catch((err)=> {
					console.error('Search Init Request Error', err)
					reject(err);
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
							number: this.total
						}
					)
					this.total++;
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
				//console.log(res);
				if (res.result == 'OK') {
					if (res.phrases.length == 0) {
						this.ended = true;
						this.emit('end');
						console.log('ended--------------------------------------');
					} else {
						this.fillBuffer(res.phrases);
						//console.log('buffer**********************************',this.buffer);
					}
				} else {
					throw res;
				}
			})
			.catch((err)=> {
				this.filling = false;
				console.error('Search Phrase Request Error', err)
			});


	}

	//getPhrase*****************************************************************************************
	getPhrase() {
		if (!this.filling) this.fillBuffer();
		return new Promise((resolve, reject) => {
			if (this.buffer.size > 0) {
				resolve(this.buffer.dequeue());
			} else {
				this.once('add', () => {
					console.log('add************************************');
					resolve(this.buffer.dequeue());
				});
				this.once('end', () => {
					console.log('end************************************');
					resolve(null);
				});
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
						console.log('add++++++++++++++++++++++++++++++++');
						resolve(true);
					});
					this.once('end', () => {
						console.log('end++++++++++++++++++++++++++++++++');
						resolve(false);
					});
				}
			}
		})
	}
}
module.exports = Search;