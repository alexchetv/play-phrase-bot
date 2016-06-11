const request = require("request");
const fs = require("fs");
const ffmpeg = require('fluent-ffmpeg');
const Util = require('./util.js');
const Logger = require('./logger');
const logger = new Logger('[googlespeech]','e','./my.log');

const API_KEY = "AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw";
const UP_URL = 'https://www.google.com/speech-api/full-duplex/v1/up?';
const DOWN_URL = 'https://www.google.com/speech-api/full-duplex/v1/down?';
const POST_SAMPLE_RATE = 16000;//44100;

let _convert = (inFile) => {
	let id = Util.gen(16);
	let outFile = `./temp/${id}.flac`;
	return new Promise((resolve, reject) => {
		ffmpeg()
			.on('error', (err) => {
				reject(err);
			})
			.on('end', () => {
				resolve([outFile,id]);
			})
			.input(inFile)
			.output(outFile)
			.audioFrequency(POST_SAMPLE_RATE)
			.audioChannels(1)
			.toFormat('flac')
			.run();
	})
}

let _sendSound = (result) => {
	logger.l('_sendSound', result);
	let file = result[0];
	let id = result[1];
	return new Promise((resolve, reject) => {
		let source = fs.createReadStream(file);
		source.on('error', (err) => {
			logger.e('_sendSound error', err);
			fs.unlink(file);
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
				if (error) {
					fs.unlink(file);
					reject(error);
				} else {
					fs.unlink(file);
					resolve(id)
				}
			});
		source.pipe(postReq);
	})
}



let _getText = (id) => {
	logger.l('_getText', id);
	let params = Util.toUrl({
		'pair': id
	});
	return new Promise((resolve, reject) => {
		request.get(DOWN_URL + params, function (error, res, body) {
			if (error) {
				logger.e("getReq error", error)
				reject(error);
			}
			logger.l('body', body);
			var results = body.split('\n');
			try{
				var last_result = JSON.parse(results[results.length - 2]);
				if(last_result.result[0] && last_result.result[0].alternative[0]){
					resolve(last_result.result[0].alternative[0].transcript);
				} else {
					resolve('');
				}
			}
			catch (err) {
				reject(err);
			}
		});
	});
}

class GoogleSpeech {

	static recognize(file) {
		return _convert(file)
			.then((result) => {
				_sendSound(result);
				return _getText(result[1]);
			})
	}

}

module.exports = GoogleSpeech;
