const request = require("request");
const bhttp = require("bhttp");

const fs = require("fs");
const Util = require('./util.js');
const Logger = require('./logger');
const logger = new Logger('[googlespeech]', 'e');
const API_KEY = "AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw";
const UP_URL = 'https://www.google.com/speech-api/full-duplex/v1/up?';
const DOWN_URL = 'https://www.google.com/speech-api/full-duplex/v1/down?';
const POST_SAMPLE_RATE = 16000;//44100;
const ffmpeg = require('fluent-ffmpeg');
const Temp = require('./temp');
//const temp = new Temp('K:/');

let sendSound = (outFile, id) => {
	let params = Util.toUrl({
		'output': 'json',
		'lang': 'en-us',
		'pFilter': 0,//0- off, 1 - medium, 2 - strict
		'key': API_KEY,
		'client': 'chromium',
		'maxAlternatives': 1,
		'pair': id
	});
	Temp.read(outFile)
		.catch(err => logger.e('read', err))
		.then((data) => {
			return bhttp.post(UP_URL + params, data,
				{
					'headers': {
						'content-type': 'audio/x-flac; rate=' + POST_SAMPLE_RATE
					}
				});
		})
		.catch(err => logger.e('sendSound error', err))
		.then(() => logger.s('sendSound Ok'));


}

let getText = (id) => {
	logger.l('getText', id);
	let params = Util.toUrl({
		'pair': id
	});
	return new Promise((resolve, reject) => {
		logger.l('_getText2', id);
		//without {noDecode:true} error
		bhttp.get(DOWN_URL + params, {noDecode: true}, function (error, responce) {
			if (error) {
				logger.e("getReq error", error)
				reject(error);
			} else {
				logger.w('getText body', responce.body.toString());
				var results = responce.body.toString().split('\n');
				try {
					var last_result = JSON.parse(results[results.length - 2]);
					if (last_result.result[0] && last_result.result[0].alternative[0]) {
						resolve(last_result.result[0].alternative[0].transcript);
					} else {
						resolve('***********');
					}
				}
				catch (err) {
					logger.e("getReq catch", err)
					reject(err);
				}
			}

		});
	});
}

class GoogleSpeech {

	//convert inFile and delete it after that, return promise
	static convert(inFile, format) {
		let outFile = Temp.genName();
		return new Promise((resolve, reject) => {
			ffmpeg()
				.on('error', (err) => {
					Temp.remove(inFile);
					reject(err);
				})
				.on('end', () => {
					Temp.remove(inFile);
					resolve(outFile);
				})
				.input(inFile)
				.output(outFile)
				.audioFrequency(POST_SAMPLE_RATE)
				.audioChannels(1)
				.toFormat(format)
				.run();
		})
	}

	static recognize(inFile) {
		let id = Util.gen(16);
		return this.convert(inFile, 'flac')
			.then((outFile) => {
				sendSound(outFile, id);
				return getText(id);
			})
	}


}
module.exports = GoogleSpeech;
