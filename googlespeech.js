const request = require("request");
const bhttp = require("bhttp");

const fs = require("fs");
const Util = require('./util.js');
const Logger = require('./logger');
const logger = new Logger('[googlespeech]', 'i');
const API_KEY = "AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw";
const UP_URL = 'https://www.google.com/speech-api/full-duplex/v1/up?';
const DOWN_URL = 'https://www.google.com/speech-api/full-duplex/v1/down?';
const POST_SAMPLE_RATE = 16000;//44100;
const ffmpeg = require('fluent-ffmpeg');
const Temp = require('./temp');
const temp = new Temp('K:/');

let _sendSound = (outFile, id) => {
	return new Promise((resolve, reject) => {
		let source = fs.createReadStream(outFile);
		source.on('error', (err) => {
			logger.e('_sendSound error', err);
			temp.remove(outFile);
			reject(err);
		});
		let params = Util.toUrl({
			'output': 'json',
			'lang': 'en-us',
			'pFilter': 0,//0- off, 1 - medium, 2 - strict
			'key': API_KEY,
			'client': 'chromium',
			'maxAlternatives': 1,
			'pair': id
		});
		logger.l('postReq', UP_URL + params);
		let postReq = request.post(
			{
				'url': UP_URL + params,
				'headers': {
					'content-type': 'audio/x-flac; rate=' + POST_SAMPLE_RATE
				}
			},
			(error, res, body) => {
				temp.remove(outFile);
				if (error) {
					reject(error);
				} else {
					resolve()
				}
			});
		source.pipe(postReq);
	})
}

let new_sendSound = (outFile, id) => {
	let params = Util.toUrl({
		'output': 'json',
		'lang': 'en-us',
		'pFilter': 0,//0- off, 1 - medium, 2 - strict
		'key': API_KEY,
		'client': 'chromium',
		'maxAlternatives': 1,
		'pair': id
	});
	temp.read(outFile)
		.catch(err => logger.e('read', err))
		.then((data) => {
			logger.l('data', data);
			return bhttp.post(UP_URL + params, data,
				{
					'headers': {
						'content-type': 'audio/x-flac; rate=' + POST_SAMPLE_RATE
					}
				});
		})
		.catch(err => logger.e('new_sendSound error', err))
		.then(() => logger.s('new_sendSound Ok'));


}

let _getText = (id) => {
	logger.l('_getText', id);
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
				logger.w('_getText body', responce.body.toString());
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
	static convert(inFile, format, audioFrequency) {
		let outFile = temp.genName();
		return new Promise((resolve, reject) => {
			ffmpeg()
				.on('error', (err) => {
					temp.remove(inFile);
					reject(err);
				})
				.on('end', () => {
					temp.remove(inFile);
					resolve(outFile);
				})
				.input(inFile)
				.output(outFile)
				.audioFrequency(audioFrequency)
				.audioChannels(1)
				.toFormat(format)
				.run();
		})
	}

	static recognize(inFile) {
		let id = Util.gen(16);
		return this.convert(inFile, 'flac', POST_SAMPLE_RATE)
			.then((outFile) => {
				new_sendSound(outFile, id);
				return _getText(id);
			})
	}


}
module.exports = GoogleSpeech;
