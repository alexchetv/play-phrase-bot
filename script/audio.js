const Store = require('./../store');
const Logger = require('./../logger');
const logger = new Logger('[dbscripts]', 'e');
const Temp = require('./../temp');
//const temp = new Temp('K:/');
const store = new Store('telegram');
const GoogleSpeech = require('./../googlespeech.js');

//itterate through phrases
store.view('telegram/phrase', {startkey: 'p:', endkey: 'p:\u9999'})
	.then((res) => {
		logger.s('view OK', res.length);
		let chain = Promise.resolve();
		res.forEach((key, doc)=> {
			//if not yet audio attachment
			if (!(doc && doc._attachments && doc._attachments.audio && doc._attachments.audio.stub && (doc._attachments.audio.length > 0))){
				//add to chain
				chain = chain
					.then(() => {
						convertVideo(key, doc);
					})
			}

		})
	})
	.catch((err) => {
		logger.e('view error', err)
	});

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