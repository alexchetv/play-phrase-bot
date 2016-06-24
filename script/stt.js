const Store = require('./../store');
const Logger = require('./../logger');
const logger = new Logger('[dbscripts]', 'e');
const Temp = require('./../temp');
var prompt = require('prompt');
prompt.message = '';
prompt.delimiter = '';
const store = new Store('telegram');
const GoogleSpeech = require('./../googlespeech.js');


prompt.start();
let properties = {
	limit: {
		description: 'How many phrases to process?',
		name: 'limit',
		default: 10,
		type: 'number'
	}
}
prompt.get({properties}, (err, result) => {
	if (err) {
		return onErr(err);
	}
	if (isNaN(result.limit)) {
		result.limit = 10;
	} else {
		result.limit = Math.round(result.limit);
	}
	console.log(result.limit);
	stt(result.limit);
});

let onErr = (err) => {
	console.log(err);
	return 1;
}

//itterate through phrases
let stt = (limit) => {
	store.view('telegram/phrase', {startkey: 'p:', endkey: 'p:\u9999'})
		.then((res) => {
			logger.s('view OK', res.length);
			let chain = Promise.resolve();
			let counter = 0;
			res.every((item)=> {
				let doc=item.value;
				let key=item.key
				//if not yet speech-to-text
				if (!doc.stt) {
					//add to chain
					chain = chain
						.then(() => {
							sttVideo(key, doc);
						});
					console.log(key);
					counter++;
				}
				return counter < limit;
			})
			console.log('found:',counter);
		})
		.catch((err) => {
			logger.e('view error', err)
		});
}

//recognize and save
let sttVideo = (key, doc) => {
	console.log('stt');
	if (doc && doc._attachments && doc._attachments.video && doc._attachments.video.stub && (doc._attachments.video.length > 0)) {
		console.log('video');
		return store.getAttach(key, 'video')
			.then(data => {
				return Temp.write(data)
			})
			.then(inFile => {
				return GoogleSpeech.recognize(inFile)
			})
			.catch(err => logger.e('sttVideo error', key, err))
			.then(text => {
				return store.update('', key, {stt:text})
			})
			.catch(err => logger.e('update stt error', key, err));
	} else {
		return Promise.reject('No Video');
	}


}