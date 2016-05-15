'use strict'

const secret = require('./secret');
var tg = require('telegram-node-bot')(secret.token);
var req = require('tiny_request');
var cradle = require('cradle');
var db = new (cradle.Connection)().database('telegram');
const Queue = require('./queue.js');

db.exists(function (err, exists) {
	if (err) {
		console.error('Database Error', err);
	} else if (exists) {
		console.log('Database Connected.');
		db.info(
			function (err, info) {
				if (err) {
					console.error('Database Info Error', err);
				} else {
					//console.log(info);
				}
			}
		)
	} else {
		console.error('Database does not exists.');
	}
});

tg.router.
	when(['/start', '/Start'], 'StartController').
	when(['/movie', '/Movie', '/m', '/M'], 'FilterController').
	when(['/all', '/All'], 'AllController').
	when(['\u25B6',], 'ResumeController').
	when(['\u23F8'], 'PauseController').
	otherwise('WordsController')

tg.controller('StartController', ($) => {
	$.sendMessage('Send me any text to find containing it phrase from movie.\nTo filter results by movie name send /movie <b>part of the name</b>\nTo take this filter off just send /all', {parse_mode: 'HTML'});
})

tg.controller('ResumeController', ($) => {
	$.sendMessage('ResumeController');
})

tg.controller('PauseController', ($) => {
	$.sendMessage('PauseController');
})

tg.controller('AllController', ($) => {
	var query = null;
	db.get('c:' + $.chatId, function (err, doc) {
		if (doc && doc.query) query = doc.query;
		db.save('c:' + $.chatId, {
			query: query,
			movie: null,
			skip: 0
		}, function (err, res) {
			if (err) {
				console.error('error Save Chat', err);
			} else {
				$.sendMessage('Search all movies');
			}
		})
	})
})

tg.controller('FilterController', ($) => {
	//console.log('*'+$.args+'*');
	var movie = null;
	var query = null;
	db.get('c:' + $.chatId, function (err, doc) {
		if (doc && doc.query) {
			query = doc.query;
			movie = doc.movie;
		}
		if ($.args) {
			movie = $.args.toLowerCase();
			db.save('c:' + $.chatId, {
				query: query,
				movie: movie,
				skip: 0 //start search from beginning if filter was changed
			}, function (err, res) {
				if (err) {
					console.error('error Save Chat', err);
				} else {
					$.sendMessage('Only movie containing <b>' + movie + '</b>', {parse_mode: 'HTML'});
				}
			})
		} else {
			if (movie) {
				$.sendMessage('Only movie containing <b>' + movie + '</b>', {parse_mode: 'HTML'});
			} else {
				$.sendMessage('Search all movies');
			}
		}
	})
})

//default controller
tg.controller('WordsController', ($) => {
	if ($.args) {
		var query = $.args; //query string
		var movie = null; //movie title filter
		db.get('c:' + $.chatId, function (err, doc) {
			if (doc && doc.movie) {
				movie = doc.movie //maybe have stored filter
			}
			db.save('c:' + $.chatId, { //save all
				query: query,
				movie: movie,
				skip: 0, //nothing yet processed
				count: 0 //results count also = 0
			}, function (err, res) {
				if (err) {
					console.error('error Save search condition', err);
				} else {
					startSearch($.chatId);
				}
			})
		})
	} else {
		$.sendMessage('Nothing to seek!');
	}
})

tg.callbackQueries((callback_data) => {
	var chat_id = callback_data.message.chat.id;
	var query = callback_data.data;
	var movie = null; //movie title filter
	db.get('c:' + chat_id, function (err, doc) {
		if (doc && doc.movie) {
			movie = doc.movie //maybe have stored filter
		}
		db.save('c:' + chat_id, { //save all
			query: query,
			movie: movie,
			skip: 0, //nothing yet processed
			count: 0 //results count also = 0
		}, function (err, res) {
			if (err) {
				console.error('error Save search condition', err);
			} else {
				startSearch(chat_id);
			}
		})
	})
})
//inlineMode
/*tg.inlineMode(($) => {
 console.log('ttttttttttttt');
 tg.answerInlineQuery($.id, [{
 type: 'video',
 video_url: 'http://playphrase.me/video/phrase/5448547209bd000ab7589fc6.mp4',
 mime_type: 'video/mp4',
 thumb_url: 'http://www.phrases.org.uk/images/under-the-thumb.jpg',
 title: 'example'
 }])
 })*/

var startSearch = (chat_id)=> {
	db.get('c:' + chat_id, function (err, doc) { //get search condition from DB
		if (doc) {
			var queue = new Queue(chat_id);
			var query = doc.query;
			var movie = doc.movie;
			var skip = doc.skip;
			var count = doc.count;
			var filter = movie ? (item)=> {
				return (item.video_info.info.split('/')[0].toLowerCase().includes(movie))
			} : null;
			searchLoop(chat_id, 'start', query, skip, 10, queue, count, filter, movie);
		} else {
			console.error('error Get search condition from DB', err);
		}
	})
};

var searchLoop = (chat_id, mode, query, skip, need, queue, count, filter, movie)=> {
	var processed = skip;
	var mes;
	var options = {
		parse_mode: 'HTML',
		reply_markup: JSON.stringify({
			resize_keyboard: true,
			selective: true,
			keyboard: [[{
				text: '\u23F8 Pause' //callback_data: '/skip:' + (processed - 1) + ':' + count
			}]]
		})
	};
	var modeMes = (mode == 'start') ? 'Now ' : 'Continue ';
	var movieMes = movie ? ' In <b>*' + movie + '*</b>' : '';
	console.log('++++++++', mode, query, movieMes, skip, count, queue.enqueuedResults);
	//query resuts from playphrase.me API
	req.get({
			url: 'http://playphrase.me/search',
			port: 9093,
			json: true,
			query: {
				q: query,
				skip: skip
			}
		},
		function (body, response, err) {
			if (!err && response.statusCode == 200) {
				if (body.phrases && body.phrases[0]) {
					if (mode != 'loop') {//if not loop search display message
						mes = modeMes + 'seeking <b>' + query + '</b> …' + movieMes;
						if (mode == 'start') { //if first search display quantity of results
							mes += '\nFound ' + body.count + (movie ? ' (without filter)' : '')
						}
						queue.enqueue({
							type: 'message',
							text: mes,
							options: options
						});
					}
					body.phrases.every(function (item, i, arr) {
						//console.log('-------', item.text, item.video_info.info);
						processed += 1;
						if (!filter || filter(item)) {//enqueue result
							count++;
							queue.enqueue({
								type: 'result',
								_id: item._id,
								caption: item.text,
								info: item.video_info.info,
								imdb: item.video_info.imdb,
								movie: item.movie,
								position: processed
							});
						}
						return queue.enqueuedResults < need; //break if enqueuedResults = need
					});
					if (queue.enqueuedResults < need) {
						searchLoop(chat_id, 'loop', query, processed, need, queue, count, filter, movie);//continue search
					} else {
						queue.enqueue({  //enqueue message and stop
							type: 'message',
							options: {
								parse_mode: 'HTML',
								reply_markup: JSON.stringify({
									resize_keyboard: true,
									selective: true,
									keyboard: [[{
										text: '\u25B6 Resume'
									}]]
								})
							},
							position: processed,
							text: 'Search <b>' + query + '</b> paused after ' + count + ' results'
						});
					}
				} else {
					console.log('//no more phrases');
					if (mode == 'start') { //nothing at all! so show Message "Not Found"
						mes = modeMes + 'seeking <b>' + query + '</b> …' + movieMes + '\nNot Found.';
						var keyboard = [[]];
						if (body.suggestions && body.suggestions[0]) {
							mes += '\nDid you mean:';
							body.suggestions.forEach(function (item, i, arr) {
								keyboard[0].push({
									text: item.text,
									callback_data: item.text
								});
							});
							options = {
								parse_mode: 'HTML',
								reply_markup: JSON.stringify({inline_keyboard: keyboard})
							}
						}
					} else {
						mes = 'Search <b>' + query + '</b> finished with ' + count + ' results';
						options = {
							parse_mode: 'HTML',
							reply_markup: JSON.stringify({hide_keyboard: true, selective: true})//hide button Pause
						}
					}
					queue.enqueue({
						type: 'message',
						text: mes,
						options: options
					});
				}
			} else {
				console.error('playphrase.me API error' + (response ? response.statusCode : '') + '\n' + err);
			}
		})
};