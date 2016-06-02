'use strict';

const secret = require('./secret');
const cradle = require('cradle');
const ellipsize = require('ellipsize');
const Store = require('./store');
const logger = require('./logger');
const fs = require('fs');
var store = new Store('telegram');
const Search = require('./search.js');
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
bot.on(['/start', '/s','/help','/h'], msg => {
	bot.sendMessage(msg.from.id,
		`moviePhrase bot find and show short clips from movies.
It use database and API from <a href="http://playphrase.me/">playphrase.me</a>
Send any text to find containing it phrase.
To filter results by movie title send /movie (or /m)`,
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
			console.error('ERROR', err);
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

//callbackQuery************************************************************************
bot.on('callbackQuery', (msg) => {
	const chat_id = msg.from.id;
	const cmd = msg.data;
	const bot_msg = msg.message;

//suggestion button
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
						bot.sendMessage(chat_id, `\u{26A0}Now the filter by movie title is DISABLED`)
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
				//logger.warn('Processing');
				return;
			}
			//logger.log('Processing = true');
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
			return bot.sendMessage(chat_id, `\u{26A0}Now the filter by movie title is <b>${new_filter}</b>`, {parse})
		})
		.catch(err => {
			console.error('ERROR', err);
			bot.sendMessage(chat_id,
				`\u{2757}We have some problem. Please repeat.`, {parse})
		});
}

var startSearch = (chat_id, norm_text) => {
	//logger.log('startSearch',norm_text);
	let first_msg, movie, movieMes;
	if (searches[chat_id] && searches[chat_id].lastPhrase.message_id && searches[chat_id].lastPhrase.key) {
		//logger.log('Old lastPhrase',searches[chat_id].lastPhrase);
		let markup = bot.inlineKeyboard([[searches[chat_id].lastPhrase.key]]);
		bot.editMarkup({chatId: chat_id, messageId: searches[chat_id].lastPhrase.message_id}, {markup});
	} else {
		//logger.warn('no lastPhrase');
	}
	store.get('u', chat_id)
		.then((doc) => {//got movie filter
			movie = doc && doc.movie;
			//logger.log('got movie filter',movie);
			movieMes = movie ? ' in <b>*' + movie + '*</b>' : '';
			searches[chat_id] = new Search(norm_text, movie);
			return bot.sendMessage(chat_id, 'Now seeking <b>' + norm_text + '</b> ' + movieMes, {parse})
		})
		.then((result) => {//got shown first message
			//logger.log('got shown first message');
			first_msg = result.result;
			return searches[chat_id].init();
		})
		.then((res)=> {//got phrase count and suggestions if any
			//logger.log('searches.init()', res.count);
			if (res.count == 0) {
				//logger.warn('res.count == 0');
				var txt = `Now seeking <b>${norm_text}</b> ${movieMes}\nNot Found.`;
				var markup = null;
				if (res.suggestions && res.suggestions[0]) {
					//logger.log('suggestions');
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
					`Now seeking <b>${norm_text}</b> ${movieMes}\nFound ${res.count}${movie ? ' (without filter)' : ''}`,
					{parse}
				)
					.then(() => {//got edited first message
						//logger.log('processPhrase');
						processPhrase(chat_id, searches[chat_id].id);
					});
			}
		})
		.catch(err => {
			console.error('ERROR', err);
			bot.sendMessage(chat_id,
				`\u{2757}We have some problem. Please repeat.`, {parse})
		});
}
//processPhrase*****************************************************************************************
var processPhrase = (chat_id) => {
	//logger.log('START processPhrase');
	searches[chat_id].getPhrase()
		.then((phrase) => {
			if (phrase) {
				//logger.log('got Phrase', phrase._id, phrase.hasNext);
				if (phrase.hasNext) {
					//logger.log('showPhrase with next');
					showPhrase(chat_id, phrase)
					.then((res) =>{
							//logger.log('set lastPhrase-1', res.message_id,res.key);
							searches[chat_id].lastPhrase.message_id = res.message_id;
							searches[chat_id].lastPhrase.key = res.key;
							//logger.log('Processing = false 1');
							searches[chat_id].processing = false;
						});// that's all
				} else {
					//logger.log('Phrase without next');
					Promise.all([showPhrase(chat_id, phrase), searches[chat_id].getNext()])
						.then((values) => {
							//logger.log('Promise resolve all',values);
							//logger.log('set lastPhrase-2', values[0].message_id, values[0].key);
							searches[chat_id].lastPhrase.message_id = values[0].message_id;
							searches[chat_id].lastPhrase.key = values[0].key;
							//logger.log('Processing = false 2');
							searches[chat_id].processing = false;
							if (values[1]) { //hasNext == true
								//logger.log('addButton',values[0].message_id);
								addButton(chat_id, values[0].message_id);
							} else {//hasNext == false
								//logger.log('search was completed');
								bot.sendMessage(chat_id,
									`\u{26A0}The search was completed. No more phrases.`, {parse})
							}
						})
						.catch((error)=> {
							//logger.err('promise.all error', error);
						});
				}
			} else {
				//logger.warn('No phrases after that');
				bot.sendMessage(chat_id,
					`\u{26A0}The filter was applied. No phrases after that.`, {parse})
			}
		})
		.catch((error) => {
			//logger.err('searches ERROR', error);
		});

}

//showPhrase****************************************************************
var showPhrase = (chat_id, phrase) => {
	//logger.log('showPhrase start');
	return new Promise((resolve, reject) => {

		let imdb_key = bot.inlineButton(phrase.info, {url: phrase.imdb});
		let keyboard = [[imdb_key]];
		//logger.log('phrase.hasNext=', phrase.hasNext);
		if (phrase.hasNext) {
			//logger.log('showPhrase with hasNext');
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
			//logger.log('sendVideo with tfid', phrase.tfid);
			bot.sendVideo(chat_id, phrase.tfid, {caption, markup})
				.then((res)=> {
					//logger.log('video sended with tfid');
					if (!res || !res.ok) {
						throw error('error Send TFID');
					} else {
						//logger.log('resolve video sended with tfid');
						resolve({message_id:res.result.message_id, key:imdb_key});
					}
				})
				.catch((error)=> {
					//logger.err('error video sended with tfid',error);
					phrase.tfid = null;
					//logger.log('showPhrase repeat');
					showPhrase(chat_id, phrase)
						.then((res)=> {
							//logger.log('showPhrase repeat resolve');
							resolve(res)
						});
				})
		} else {
			//logger.log('showPhrase without tfid');
			var readFromAttachStream = store.db.getAttachment('p:' + phrase._id, 'video', function (error) {
				if (error) {
					//logger.err('error getAttachment', error);
					reject(error);
				}
			});
			var fileName = 'temp/' + Math.random().toString(16) + '.mp4';
			var writeToFileStream = fs.createWriteStream(fileName);
			writeToFileStream.on('finish', () => {
				//logger.log('sendVideo from stream');
				bot.sendVideo(chat_id, fs.createReadStream(fileName), {caption, markup})
					.then((res)=> {
						if (!res || !res.ok) {
							//logger.log('Not OK sendVideo from stream');
							throw error('error Send Video');
						} else {
							//logger.log('OK sendVideo from stream');
							fs.unlink(fileName);
							if (res.result && res.result.video && res.result.video.file_id) {
								store.update('p', phrase._id, {tfid: res.result.video.file_id})
									.catch((error)=> {
										//logger.err('error Merge TFID', error);
									});
							}
							resolve({message_id:res.result.message_id,key:imdb_key});
						}
					})
					.catch((error)=> {
						//logger.err('Error sendVideo from stream',error);
						fs.unlink(fileName);
						reject(error);
					})
			})
			readFromAttachStream.pipe(writeToFileStream);
		}
	})
}

var addButton = (chat_id, message_id) => {
	//logger.log('start addButton',searches[chat_id].lastPhrase.key);
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

