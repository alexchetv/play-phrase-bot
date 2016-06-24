//CREATE AUDIO ATTACH FROM VIDEO ATTACH
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
	audio(result.limit);
});

let onErr = (err) => {
	console.log(err);
	return 1;
}

//itterate through phrases
let audio = (limit) => {
	store.view('telegram/phrase', {startkey: 'p:', endkey: 'p:\u9999'})
		.then((res) => {
			logger.s('view OK', res.length);
			let chain = Promise.resolve();
			let counter = 0;
			res.every((item)=> {
				let doc=item.value;
				let key=item.key
				//if not yet audio attachment
				if (!(doc._attachments.audio && doc._attachments.audio.stub && (doc._attachments.audio.length > 0))) {
					//add to chain
					chain = chain
						.then(() => {
							convertVideo(key, doc);
						});
					console.log(key);
					counter++;
					return counter < limit;
				}

			})
		})
		.catch((err) => {
			logger.e('view error', err)
		});
}

//convert video to audio and save as attachment
let convertVideo = (key, doc) => {
	if (doc && doc._attachments && doc._attachments.video && doc._attachments.video.stub && (doc._attachments.video.length > 0)) {
		return store.getAttach(key, 'video')
			.then(data => {
				return Temp.write(data)
			})
			.then(inFile => {
				return GoogleSpeech.convert(inFile, 'opus')
			})
			.then(outFile => {
				return Temp.read(outFile)
			})
			.then(data => {
				return store.saveAttach(key, 'audio', 'audio/ogg', data)
			})
			.catch(err => logger.e('convertVideo error', err));
	} else {
		return Promise.reject('No Video');
	}


}