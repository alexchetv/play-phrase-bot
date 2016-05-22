'use strict';

const secret = require('./secret');
const cradle = require('cradle');
const Store = require('./store');
var store = new Store('telegram');
const Queue = require('./queue.js');
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
bot.on(['/start', '/s'], msg => {
	bot.sendMessage(msg.from.id,
		`Send me any text to find containing it phrase from movie.
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
					`\u{2716} no filter`,
					{callback: `movie:off`}
				))
			}
			//console.log('ggggggggggg',doc);
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
			console.log('ERROR', err);
			bot.sendMessage(msg.from.id,
				'We have some problem. Please repeat.')
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

bot.on('callbackQuery', (msg) => {
	console.log('callback=============================', msg);
	const chat_id = msg.from.id;
	const cmd = msg.data;
	const bot_msg = msg.message;
	if (cmd.startsWith('/_')) {
		bot.answerCallback(msg.id);
		bot.editText({
			chatId: chat_id,
			messageId: bot_msg.message_id
		}, bot_msg.text.replace(' Did you mean:', ''), {markup: null});
		startSearch(chat_id, cmd.substring(2));
	}
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
						bot.sendMessage(chat_id, `Now the filter by movie title is DISABLED`)
					})
			}
				break;
			case 'new':
			{
				let markup = 'reply';
				bot.sendMessage(chat_id, 'Type part of movie title', {parse, markup});
			}
				break;
			default:
			{
				let n = Number(choice);
				if (n) {setMovieFilter(chat_id,n);

				}
			}

		}
	}
});

bot.on('*', (msg) => {
	console.log('message=============================', msg.from.id);
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
			return bot.sendMessage(chat_id, `Now the filter by movie title is <b>${new_filter}</b>`, {parse})
		})
		.catch(err => {
			console.log('ERROR', err);
			bot.sendMessage(chat_id,
				'We have some problem. Please repeat.')
		});
}

var startSearch = (chat_id, norm_text) => {
	let first_msg, movie, movieMes;
	store.get('u', chat_id)
		.then((doc) => {
			movie = doc && doc.movie;
			movieMes = movie ? ' in <b>*' + movie + '*</b>' : '';
			searches[chat_id] = new Search(norm_text, movie);
			return bot.sendMessage(chat_id, 'Now seeking <b>' + norm_text + '</b> ' + movieMes, {parse})
		})
		.then((result) => {
			first_msg = result.result;
			return searches[chat_id].init();
		})
		.then((res)=> {
			console.log(res.id);
			if (res.count == 0) {
				var txt = `Now seeking <b>${norm_text}</b> ${movieMes}\nNot Found.`;
				var markup = null;
				if (res.suggestions && res.suggestions[0]) {
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
				bot.editText(
					{chatId: chat_id, messageId: first_msg.message_id},
					txt,
					{markup, parse}
				);
			} else {
				bot.editText(
					{chatId: chat_id, messageId: first_msg.message_id},
					`Now seeking <b>${norm_text}</b> ${movieMes}\nFound ${res.count}${movie ? ' (without filter)' : ''}`,
					{parse}
				);

			}
		}).catch(err => {
			console.log('ERROR', err);
			bot.sendMessage(chat_id,
				'We have some problem. Please repeat.')
		});
}