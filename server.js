'use strict'

const secret = require('./secret');
var tg = require('telegram-node-bot')(secret.token);
var req = require('tiny_request');
var cradle = require('cradle');
var db = new (cradle.Connection)().database('telegram');
const Queue = require('./queue.js');

var Filter = null;

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
					console.log(info);
				}
			}
		)
	} else {
		console.error('Database does not exists.');
	}
});

tg.router.
	when(['/start', '/Start'], 'StartController').
	when(['/filter','/Filter','/f','/F'], 'FilterController').
	when(['/_'], 'WordsController').
	otherwise('WordsController')

tg.controller('StartController', ($) => {
	console.log('/start');
	$.sendMessage('Send me any text to find phrase from movie.\nTo filter results by movie name send /filter <b>name start from</b>\nTo take filter off just send /filter',{parse_mode: 'HTML'});
})

tg.controller('FilterController', ($) => {
	console.log('filter',$.args);
	var filter =null;
	if ($.args) {
		$.sendMessage('Filter <b>' + $.args + '</b>', {parse_mode: 'HTML'});
		filter = '(item)=>{return(item.video_info.info.startsWith(\''+$.args+'\'));}'
		db.save('c:' + $.chatId, {
			filter: filter
		}, function (err, res) {
			if (err) {
				console.error('error Save Chat', err);
			} else {
				console.log('OK Save Chat', res);
			}
		})
	} else {
		$.sendMessage('Filter Off');
		db.save('c:' + $.chatId, {
			filter: filter
		}, function (err, res) {
			if (err) {
				console.error('error Save Chat', err);
			} else {
				console.log('OK Save Chat', res);
			}
		})
	}
})




tg.controller('WordsController', ($) => {
	if ($.args) {
		//normalize query string
		var query_norm = $.args.replace('_', ' ').replace('/', '');
		$.sendMessage('Now seeking <b>' + query_norm + '</b> …', {parse_mode: 'HTML'}, (answer, err) => {
			if (!err) {
				console.log('answer', answer);
				startSearch($.chatId, answer.result, query_norm);
			} else {
				console.error('error Send Message', err);
			}
		});
	} else {
		$.sendMessage('Nothing to seek!');
	}
})

tg.callbackQueries((callback_data) => {
	console.log(callback_data);
	console.log('**********',callback_data.message.entities)
	var chat_id = callback_data.message.chat.id;
	//normalize query string
	var query_norm = callback_data.data.replace('_', ' ').replace('/', '');
	tg.sendMessage(chat_id, 'Now seeking <b>' + query_norm + '</b> ...', {parse_mode: 'HTML'}, (answer, err) => {
		if (!err) {
			//console.log('answer', answer);
			startSearch(chat_id, answer.result, query_norm);
		} else {
			console.error('error Send Message', err);
		}
	});

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

var startSearch = (chat_id, sent_message, queryString)=> {
	//console.log(filter);
	//var filtered = [];
	var queue = new Queue(chat_id);
	var filter = null;
	db.get('c:' + chat_id, function (err, doc) {
		if (doc) {
			console.log('doc.filter',doc.filter);
			filter = eval(doc.filter);
			console.log('typeof filter',typeof filter);
			console.log('filter',filter);
		}
	})
	seekPhrase(chat_id, sent_message, queryString, 0, 5, queue, filter);
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
var seekPhrase = (chat_id, sent_message, queryString, skip, need, queue, filter)=> {
	var processed = skip;
	//console.log('skip',skip);
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
					body.phrases.forEach(function (item, i, arr) {
						processed += 1;
						if (!filter || filter(item)) {
							//enqueue video
							if (queue.enqueued < need) {
								queue.enqueue({
									type: 'video',
									_id: item._id,
									caption: item.text,
									info: item.video_info.info,
									imdb: item.video_info.imdb,
									movie: item.movie,
									position: processed
								});
							} else {
								//enqueue button and finish
								queue.enqueue({
									type: 'button',
									position: processed,
									text:'Search <b>'+queryString+'</b> paused',
									button_text:'Continue to get more',
									data:'' + (processed-1)
								});
								return;
							}
						}
					});
					//continue search
					seekPhrase(chat_id, sent_message, queryString, processed, need, queue, filter);
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
							tg.editMessageText('Now seeking <b>' + queryString + '</b> …\n' + mes, options);
						}
					}
				}
			} else {
				console.log('API error' + (response ? response.statusCode : '') + '\n' + err);
			}
		})
};