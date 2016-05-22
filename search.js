"use strict";

var rp = require('request-promise');

class Search {
	constructor(query, movie) {
		this.query = query;
		this.movie = movie;
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
					if (res.result =='OK') {
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
					console.error('Search Init Request Error',err)
					reject(err);
				});
		})
	}
}

module.exports = Search;