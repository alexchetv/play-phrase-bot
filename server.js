'use strict';
/*
 **Windows users**: most probably ffmpeg and ffprobe will _not_ be in your `%PATH`, so you _must_ set `%FFMPEG_PATH` and `%FFPROBE_PATH`.
 */
const secret = require('./secret');
const Temp = require('./temp');
const temp = new Temp('K:/');
const bhttp = require("bhttp");
const ellipsize = require('ellipsize');
const Store = require('./store');
const store = new Store('telegram');
const Logger = require('./logger');
const logger = new Logger('[server]', 'i');
const fs = require('fs');
const Util = require('./util.js');

const Search = require('./search.js');
const GoogleSpeech = require('./googlespeech.js');
const TeleBot = require('telebot');
const bot = new TeleBot({
	token: secret.token,
	pooling: {
		interval: 10,
		timeout: 20,
		retryTimeout: 10000
	}
});
bot.username = secret.username;
const parse = 'HTML';
var searches = {};
//start command *******************************************************************
bot.on(['/start', '/s', '/help', '/h'], msg => {
	bot.sendMessage(msg.from.id,
		`moviePhrase bot find and show short clips from movies.
It use database and API from <a href="http://playphrase.me/">playphrase.me</a>
Send any text to find containing it phrase.
To filter results by movie title send /movie (or /m)
To repeat one of recent searches send /recent (or /r)`,
		{parse});
});

//set movie filter *******************************************************************
bot.on(['/movie', '/m'], msg => {
	store.get('u', msg.from.id)
		.then(doc => {
			let txt = '';
			let keyboard = [[
				bot.inlineButton(
					`\u{2795} add new`,
					{callback: `movie:new`}
				)
			]];
			let startFrom = 1;
			if (!doc || !doc.movie) {

				txt = 'Currently the filter by movie title is DISABLED';
				startFrom = 0;
			} else {
				txt = `Currently the filter by movie title is <b>${doc.movie}</b>`;
				keyboard[0].push(bot.inlineButton(
					`\u{274C} no filter`,
					{callback: `movie:off`}
				))
			}
			if (doc && doc.recent && (doc.recent.length > startFrom)) {
				for (let i = startFrom; i < doc.recent.length; i++) {
					keyboard.push([
						bot.inlineButton(
							doc.recent[i],
							{callback: `movie:${i}`}
						)
					])
				}
			}
			let markup = bot.inlineKeyboard(keyboard);
			bot.sendMessage(msg.from.id, txt, {parse, markup});
		})
		.catch(err => {
			logger.e('set movie filter', err);
			bot.sendMessage(msg.from.id,
				`\u{2757}We have some problem. Please repeat.`, {parse})
		})

});

//show recent buttons *******************************************************************
bot.on(['/recent', '/r'], msg => {

	store.get('u', msg.from.id)
		.then(doc => {
			if (doc && doc.searches && doc.searches[0]) {

				let txt = 'Choose from recent:';
				let keyboard = [[]];
				doc.searches.forEach((item) => {
					logger.l('recent', item);
					keyboard.push([bot.inlineButton(
						item,
						{callback: `/_${item}`}
					)]);
				});
				let markup = bot.inlineKeyboard(keyboard);
				bot.sendMessage(msg.from.id, txt, {markup, parse});
			}
		})
		.catch(err => {
			logger.e('set movie filter', err);
			bot.sendMessage(msg.from.id,
				`\u{2757}We have some problem. Please repeat.`, {parse})
		})

});

//begin search *******************************************************************
bot.on(['text'], (user_msg) => {
	let chat_id = user_msg.from.id;
	var norm_text = user_msg.text.toLowerCase();
	if (user_msg.text.startsWith('/')) {
		return;
	}
	if (user_msg.reply_to_message && user_msg.reply_to_message.from.username == bot.username) {
		setMovieFilter(chat_id, norm_text);
		return;
	}

	startSearch(chat_id, norm_text);

});

bot.on(['voice'], (user_msg) => {
	//logger.l('voice', user_msg);
	bot.getFile(user_msg.voice.file_id)
		.catch((err)=> {
			logger.e('getFile Error', err);
		})
		.then((res)=> {
			//logger.l('getFile', res);
			let link = `https://api.telegram.org/file/bot${secret.token}/${res.result.file_path}`;
			logger.l('link', link);
			return bhttp.get(link)
		})
		.catch((err) => {
			logger.e('download File Error', err);
		})
		.then((data) => {
			logger.l('download File OK');
			return temp.write(data.body)
		})
		.then((fileName)=> {
			logger.l('file save OK', fileName);
			return GoogleSpeech.recognize(fileName)
		})
		.then((text) => {
			logger.s("Final transcript is", text);
			bot.sendMessage(user_msg.from.id,
				`You say: <b>${text}</b>`, {parse})
		})
		.catch((err) => {
			logger.e("recognize error", err);
			bot.sendMessage(user_msg.from.id,
				`\u{2757}We have some problem. Please repeat.`, {parse})
		});
})

//callbackQuery************************************************************************
bot.on('callbackQuery', (msg) => {
	const chat_id = msg.from.id;
	const cmd = msg.data;
	const bot_msg = msg.message;

//suggestion or recent searches button
	if (cmd.startsWith('/_')) {
		bot.answerCallback(msg.id);
		bot.editText({
			chatId: chat_id,
			messageId: bot_msg.message_id
		}, bot_msg.text.replace(' Did you mean:', ''), {markup: null});
		startSearch(chat_id, cmd.substring(2));
		return;
	}

//movie filter button
	if (cmd.startsWith('movie:')) {
		bot.answerCallback(msg.id);
		bot.editMarkup({chatId: chat_id, messageId: bot_msg.message_id}, {markup: null});
		let choice = cmd.substring(6);
		switch (choice) {
			case 'off':
			{
				store.update('u', chat_id, {movie: null})
					.then(() => {
						searches[chat_id] = null;//the search was destroyed
						bot.sendMessage(chat_id, `\u{26A0}The filter by movie title is DISABLED from now`)
					})
			}
				break;
			case 'new':
			{
				let markup = 'reply';
				bot.sendMessage(chat_id, 'Type part of movie title', {parse, markup});
			}
				break;
			default://select from recent
			{
				setMovieFilter(chat_id, Number(choice));
			}

		}
		return;
	}

//Next Phrase button
	if (cmd.startsWith('phrase:next')) {
		bot.answerCallback(msg.id);
		let search_id = cmd.split(':')[2];
		let markup;
		//is the search exist and still actual?
		if (searches[chat_id] && searches[chat_id].id == search_id) {
			if (searches[chat_id].processing) {
				logger.w('Processing');
				return;
			}
			logger.l('Processing = true');
			searches[chat_id].processing = true;
			markup = bot.inlineKeyboard([[searches[chat_id].lastPhrase.key]]);
			processPhrase(chat_id);
		} else {
			markup = bot.inlineKeyboard([[
				bot.inlineButton(
					`\u{26A0}This search was terminated`,
					{callback: 'nothing to do'})
			]]);
		}
		bot.editMarkup({chatId: chat_id, messageId: bot_msg.message_id}, {markup});
		return;
	}
	bot.answerCallback(msg.id);
});

bot.connect();

var saveSearch = (chat_id, text) => {


	store.get('u', chat_id)
		.then((doc) => {
			let searches = doc && doc.searches || [];
			searches.unshift(text);
			for (let i = 1; i < searches.length; i++) {
				if (searches[i] == text) {
					searches.splice(i, 1);
				}
			}
			if (searches.length > 5) {
				searches.length = 5;
			}
			return store.update('u', chat_id, {searches: searches});
		})
		.catch(err => {
			logger.e('saveSearch', err);
		});


}

var setMovieFilter = (chat_id, new_filter) => {
	store.get('u', chat_id)
		.then((doc) => {
			if (typeof new_filter == 'number') {
				new_filter = doc.recent[new_filter];
			}
			let new_recent = doc && doc.recent || [];
			new_recent.unshift(new_filter);
			for (let i = 1; i < new_recent.length; i++) {
				if (new_recent[i] == new_filter) {
					new_recent.splice(i, 1);
				}
			}
			if (new_recent.length > 5) {
				new_recent.length = 5;
			}
			return store.update('u', chat_id, {movie: new_filter, recent: new_recent});
		})
		.then(()=> {
			searches[chat_id] = null;//the search was destroyed
			return bot.sendMessage(chat_id, `\u{26A0}The filter by movie title is <b>${new_filter}</b> from now`, {parse})
		})
		.catch(err => {
			logger.e('setMovieFilter', err);
			bot.sendMessage(chat_id,
				`\u{2757}We have some problem. Please repeat.`, {parse})
		});
}

var startSearch = (chat_id, norm_text) => {
	logger.l('startSearch', norm_text);
	let first_msg, movie, movieMes;
	let playphrase_link = `<a href="http://playphrase.me/en/search?q=${encodeURI(norm_text)}">${norm_text}</a>`;
	if (searches[chat_id] && searches[chat_id].lastPhrase.message_id && searches[chat_id].lastPhrase.key) {
		logger.l('Old lastPhrase', searches[chat_id].lastPhrase);
		let markup = bot.inlineKeyboard([[searches[chat_id].lastPhrase.key]]);
		bot.editMarkup({chatId: chat_id, messageId: searches[chat_id].lastPhrase.message_id}, {markup});
	} else {
		logger.w('no lastPhrase');
	}
	store.get('u', chat_id)
		.then((doc) => {//got movie filter
			movie = doc && doc.movie;
			logger.l('got movie filter', movie);
			movieMes = movie ? ' in <b>*' + movie + '*</b>' : '';
			searches[chat_id] = new Search(norm_text, movie);
			return bot.sendMessage(chat_id, `${playphrase_link} ${movieMes} is seeking …`, {parse})
		})
		.then((result) => {//got shown first message
			logger.l('got shown first message');
			first_msg = result.result;
			return searches[chat_id].init();
		})
		.then((res)=> {//got phrase count and suggestions if any
			logger.l('searches.init()', res.count);
			if (res.count == 0) {
				logger.w('res.count == 0');
				var txt = `<b>${norm_text}</b> not found.`;
				var markup = null;
				if (res.suggestions && res.suggestions[0]) {
					logger.l('suggestions');
					txt += ' Did you mean:';
					var keyboard = [[]];
					res.suggestions.forEach((item) => {
						keyboard[0].push(bot.inlineButton(
							item.text,
							{callback: `/_${item.text}`}
						));
					});
					markup = bot.inlineKeyboard(keyboard);
				}
				return bot.editText(
					{chatId: chat_id, messageId: first_msg.message_id},
					txt,
					{markup, parse}
				);
			} else {
				return bot.editText(
					{chatId: chat_id, messageId: first_msg.message_id},
					`${playphrase_link} ${movieMes}\nFound ${res.count}${movie ? ' (without filter)' : ''}`,
					{parse}
				)
					.then(() => {//got edited first message
						logger.l('processPhrase');
						processPhrase(chat_id, searches[chat_id].id);
					})
					.then(() => {
						saveSearch(chat_id, norm_text);
					});
			}
		})
		.catch(err => {
			logger.e('startSearch', err);
			bot.sendMessage(chat_id,
				`\u{2757}We have some problem. Please repeat.`, {parse})
		});
}
//processPhrase*****************************************************************************************
var processPhrase = (chat_id) => {
	logger.l('START processPhrase');
	searches[chat_id].getPhrase()
		.then((phrase) => {
			if (phrase) {
				logger.l('got Phrase', phrase._id, phrase.hasNext);
				if (phrase.hasNext) {
					logger.l('showPhrase with next');
					showPhrase(chat_id, phrase)
						.then((res) => {
							logger.l('set lastPhrase-1', res.message_id, res.key);
							searches[chat_id].lastPhrase.message_id = res.message_id;
							searches[chat_id].lastPhrase.key = res.key;
							logger.l('Processing = false 1');
							searches[chat_id].processing = false;
						});// that's all
				} else {
					logger.l('Phrase without next');
					Promise.all([showPhrase(chat_id, phrase), searches[chat_id].getNext()])
						.then((values) => {
							logger.l('Promise resolve all', values);
							logger.l('set lastPhrase-2', values[0].message_id, values[0].key);
							searches[chat_id].lastPhrase.message_id = values[0].message_id;
							searches[chat_id].lastPhrase.key = values[0].key;
							logger.l('Processing = false 2');
							searches[chat_id].processing = false;
							if (values[1]) { //hasNext == true
								logger.l('addButton', values[0].message_id);
								addButton(chat_id, values[0].message_id);
							} else {//hasNext == false
								logger.l('search completed');
								bot.sendMessage(chat_id,
									`\u{26A0}The search completed. No more phrases.`, {parse})
							}
						})
						.catch((error)=> {
							logger.e('promise.all error', error);
						});
				}
			} else {
				logger.w('No phrases after that');
				bot.sendMessage(chat_id,
					`\u{26A0}The filter applied. No phrases after that.`, {parse})
			}
		})
		.catch((error) => {
			logger.e('searches ERROR', error);
		});

}

//showPhrase****************************************************************
var showPhrase = (chat_id, phrase) => {
	logger.l('showPhrase start');
	return new Promise((resolve, reject) => {

		let imdb_key = bot.inlineButton(phrase.info, {url: phrase.imdb});
		let keyboard = [[imdb_key]];
		logger.l('phrase.hasNext=', phrase.hasNext);
		if (phrase.hasNext) {
			logger.l('showPhrase with hasNext');
			keyboard.push([
				bot.inlineButton(
					`\u{2795} Get Next Phrase`,
					{callback: `phrase:next:${searches[chat_id].id}`}
				)
			]);
		}
		let markup = bot.inlineKeyboard(keyboard);
		let caption = ellipsize(phrase.caption, 190, {ellipse: ' …'});
		//firstly try to use video from telegram cache
		if (phrase.tfid) {
			logger.l('sendVideo with tfid', phrase.tfid);
			bot.sendVideo(chat_id, phrase.tfid, {caption, markup})
				.then((res)=> {
					logger.l('video sended with tfid');
					if (!res || !res.ok) {
						throw error('error Send TFID');
					} else {
						logger.l('resolve video sended with tfid');
						resolve({message_id: res.result.message_id, key: imdb_key});
					}
				})
				.catch((error)=> {
					logger.e('error video sended with tfid', error);
					phrase.tfid = null;
					logger.l('showPhrase repeat');
					showPhrase(chat_id, phrase)
						.then((res)=> {
							logger.l('showPhrase repeat resolve');
							resolve(res)
						});
				})
		} else {
			/*			logger.l('showPhrase without tfid');
			 var readFromAttachStream = store.db.getAttachment('p:' + phrase._id, 'video', function (error) {
			 if (error) {
			 logger.e('error getAttachment', error);
			 reject(error);
			 }
			 });
			 var fileName = 'temp/' + Util.gen(16) + '.mp4';
			 var writeToFileStream = fs.createWriteStream(fileName);
			 writeToFileStream.on('finish', () => {
			 logger.l('sendVideo from stream');

			 bot.sendVideo(chat_id, fs.createReadStream(fileName), {caption, markup})
			 .then((res)=> {
			 if (!res || !res.ok) {
			 logger.l('Not OK sendVideo from stream');
			 throw error('error Send Video');
			 } else {
			 logger.l('OK sendVideo from stream');
			 fs.unlink(fileName);
			 if (res.result && res.result.video && res.result.video.file_id) {
			 store.update('p', phrase._id, {tfid: res.result.video.file_id})
			 .catch((error)=> {
			 logger.e('error Merge TFID', error);
			 });
			 }
			 resolve({message_id: res.result.message_id, key: imdb_key});
			 }
			 })
			 .catch((error)=> {
			 logger.e('Error sendVideo from stream', error);
			 fs.unlink(fileName);
			 reject(error);
			 })

			 })
			 readFromAttachStream.pipe(writeToFileStream);*/
			logger.l('showPhrase without tfid');
			store.getAttach('p:' + phrase._id, 'video')
				.then(data => {
					return bot.sendVideo(chat_id, data, {caption, markup})
				})
				.then((res)=> {
					if (!res || !res.ok) {
						logger.l('Not OK sendVideo from stream');
						throw error('error Send Video');
					} else {
						logger.l('OK sendVideo from stream');
						if (res.result && res.result.video && res.result.video.file_id) {
							store.update('p', phrase._id, {tfid: res.result.video.file_id})
								.catch((error)=> {
									logger.e('error Merge TFID', error);
								});
						}
						resolve({message_id: res.result.message_id, key: imdb_key});
					}
				})
				.catch((error)=> {
					logger.e('Error sendVideo from stream', error);
					reject(error);
				})


		}
	})
}

var addButton = (chat_id, message_id) => {
	logger.l('start addButton', searches[chat_id].lastPhrase.key);
	let keyboard = [[searches[chat_id].lastPhrase.key]];
	keyboard.push([
		bot.inlineButton(
			`\u{2795} Get Next Phrase`,
			{callback: `phrase:next:${searches[chat_id].id}`}
		)
	]);
	let markup = bot.inlineKeyboard(keyboard);
	bot.editMarkup({chatId: chat_id, messageId: message_id}, {parse, markup})
		.then(() => {
			return phrase.hasNext
		});
}

