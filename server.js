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
	when(['/s', '/S',], 'StopController').
	when(['/p', '/P','/Pause','/pause'], 'PauseController').
	otherwise('WordsController')

tg.controller('StartController', ($) => {
	$.sendMessage('Send me any text to find containing it phrase from movie.\nTo filter results by movie name send /movie <b>part of the name</b>\nTo take this filter off just send /all', {parse_mode: 'HTML'});
})

tg.controller('StopController', ($) => {
	$.sendMessage('StopController');
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


tg.controller('WordsController', ($) => {
	if ($.args) {
		var query = $.args;
		var movie = null;
		db.get('c:' + $.chatId, function (err, doc) {
			if (doc && doc.movie) {
				movie = doc.movie
			}
			db.save('c:' + $.chatId, {
				query: query,
				movie: movie//,
				//skip: 0
			}, function (err, res) {
				if (err) {
					console.error('error Save Chat', err);
				} else {
					var mes = movie ? '\nIn <b>*' + movie + '*</b>' : '';
					$.sendMessage('Now seeking <b>' + query + '</b> …' + mes, {parse_mode: 'HTML'}, (answer, err) => {
						if (!err) {
							startSearch($.chatId, answer.result, 0, 0);//start search from beginning if query was changed
						} else {
							console.error('error Send Message', err);
						}
					});
				}
			})
		})
	} else {
		$.sendMessage('Nothing to seek!');
	}
})

tg.callbackQueries((callback_data) => {
	var chat_id = callback_data.message.chat.id;
	var skip = 0;
	var count = 0;
	var verb = 'Continue';
	var query = null;
	var data = callback_data.data;
	if (data.startsWith('/skip:')) {
		skip = +data.split(':')[1]
		count = +data.split(':')[2]
	} else {
		query = callback_data.data;
		verb = 'Now';
	}
	var movie = null;
	db.get('c:' + chat_id, function (err, doc) {
		if (doc && doc.movie) {
			movie = doc.movie
		}
		if (!query && doc && doc.query) {
			query = doc.query
		}
		if (query) {
			db.save('c:' + chat_id, {
				query: query,
				movie: movie//,
				//skip: skip
			}, function (err, res) {
				if (err) {
					console.error('error Save Chat', err);
				} else {
					var mes = movie ? '\nIn <b>*' + movie + '*</b>' : '';
					tg.sendMessage(chat_id, verb + ' seeking <b>' + query + '</b> …' + mes, {parse_mode: 'HTML'}, (answer, err) => {
						if (!err) {
							startSearch(chat_id, answer.result, skip, count);
						} else {
							console.error('error Send Message', err);
						}
					});
				}
			})
		} else {
			console.error('No Query');
		}
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

var startSearch = (chat_id, sent_message, skip, count)=> {
	db.get('c:' + chat_id, function (err, doc) {
		if (doc) {
			var queue = new Queue(chat_id);
			var queryString = doc.query;
			var filter = doc.movie ? (item)=> {
				return (item.video_info.info.split('/')[0].toLowerCase().includes(doc.movie))
			} : null;
			//var skip = doc.skip ? doc.skip : 0;
			seekPhrase(chat_id, sent_message, queryString, skip, 5, queue, count, filter, doc.movie);
		} else {
			console.error('error Find Chat in DB', err);
		}
	})
};

/**
 *
 * @param chat_id
 * @param sent_message
 * @param queryString string to seek
 * @param filter function(phrase) If true include phrase in output
 * @param skip
 * @param need length of  resulting filtered array enough to stop seeking
 */
var seekPhrase = (chat_id, sent_message, queryString, skip, need, queue, count, filter, movie)=> {
	var processed = skip;
	console.log('+++++++++++++++++++++++++++++seekPhrase+', queryString, skip, need);
	//query server
	req.get({
			url: 'http://playphrase.me/search',
			port: 9093,
			json: true,
			query: {
				q: queryString,
				skip: skip
			}
		},
		function (body, response, err) {
			if (!err && response.statusCode == 200) {
				if (body.phrases && body.phrases[0]) {
					var options = {
						chat_id: sent_message.chat.id,
						message_id: sent_message.message_id,
						parse_mode: 'HTML'
					}
					var mes = 'Now seeking <b>' + queryString + '</b> …';
					if (filter) {
						mes += '\nIn <b>*' + movie + '*</b>\nFound ' + body.count + ' (without filter)'
					} else {
						mes += '\nFound ' + body.count;
					}
					tg.editMessageText(mes, options);
					body.phrases.some(function (item, i, arr) {
						console.log('------------------------------', item.text, item.video_info.info);
						processed += 1;
						if (!filter || filter(item)) {
							//enqueue video
							if (queue.enqueued < need) {
								count++;
								queue.enqueue({
									type: 'video',
									_id: item._id,
									caption: item.text,
									info: item.video_info.info,
									imdb: item.video_info.imdb,
									movie: item.movie,
									position: processed
								});
								return false;//continue
							} else {
								//enqueue button and finish
								queue.enqueue({
									type: 'button',
									options: {
										parse_mode: 'HTML',
										reply_markup: JSON.stringify({
											inline_keyboard: [[{
												text: 'Get more',
												callback_data: '/skip:' + (processed - 1) + ':' + count
											}]]
										})
									},
									position: processed,
									text: 'Search <b>' + queryString + '</b> paused after ' + count + ' results'
								});
								return true;//break
							}
						}
					});
					//continue search
					if (queue.enqueued <= need) {
						seekPhrase(chat_id, sent_message, queryString, processed, need, queue, count, filter, movie);
					}
				} else {
					console.log('//no more phrases');
					if (skip == 0) {
						//nothing at all
						//show Message "Not Found"
						var options = {
							chat_id: sent_message.chat.id,
							message_id: sent_message.message_id,
							parse_mode: 'HTML'
						}
						var mes = 'Not Found.\n';
						var keyboard = [[]];
						if (body.suggestions && body.suggestions[0]) {
							mes += 'Did you mean:';
							body.suggestions.forEach(function (item, i, arr) {
								keyboard[0].push({
									text: item.text,
									callback_data: item.text
								});
							});
							options.reply_markup = JSON.stringify({inline_keyboard: keyboard});
						}
						tg.editMessageText('Now seeking <b>' + queryString + '</b> …\n' + mes, options);
					} else {
						queue.enqueue({
							type: 'message',
							text: 'Search <b>' + queryString + '</b> finished with ' + count + ' results',
							options: {
								parse_mode: 'HTML'
							},
						});
					}
				}
			} else {
				console.error('API error' + (response ? response.statusCode : '') + '\n' + err);
			}
		})
};