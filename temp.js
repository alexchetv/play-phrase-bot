const secret = require('./secret');
const fs = require('fs');
const Util = require('./util.js');
const Logger = require('./logger');
const logger = new Logger('[temp]', 'e');

class Temp {

	static write (data) {
		let name = Util.gen(16);
		return new Promise((resolve, reject) => {
			fs.writeFile(this.BASE+'/'+name, data, (err) => {
				if (err) {
					reject(err);
				}
				logger.s('write',name);
				resolve(this.BASE+'/'+name);
			})
		})
	}

	static genName () {
		return this.BASE+'/'+Util.gen(16);
	}

	static read (name) {
		return new Promise((resolve, reject) => {
			fs.readFile(name, (err, data) => {
				fs.unlink(name);
				if (err) reject(err);
				resolve(data);
			})
		})
	}

	static remove (name) {
		return new Promise((resolve, reject) => {
			fs.unlink(name, (err) => {
				if (err) reject(err);
				resolve();
			})
		})
	}
}

Temp.BASE = secret.ramDisk;

module.exports = Temp;