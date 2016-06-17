const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const Logger = require('./logger');
const logger = new Logger('[util]', 'e');
const stream = require('stream');
class Util {

	//create random alfanumeric string
	static gen(length) {
		let rtn = '';
		for (let i = 0; i < length; i++) {
			rtn += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
		}
		return rtn;
	}

	//put object properties into url query parameters
	static toUrl(obj) {
		let str = [];
		for (let p in obj)
			if (obj.hasOwnProperty(p)) {
				if (obj[p] === true) {
					str.push(encodeURIComponent(p));
				} else {
					str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
				}
			}
		return str.join("&");
	}
}
module.exports = Util;