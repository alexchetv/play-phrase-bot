/**
 * Created by alexchetv on 02.05.2016.
 */
'use strict'

const fs = require('fs');
const secret = require('./secret');
var tg = require('telegram-node-bot')(secret.token);
var req = require('tiny_request');
var request = require('request');
var cradle = require('cradle');
var db = new (cradle.Connection)().database('telegram');

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
	when(['/settings'], 'SettingsController').
	when(['/_'], 'WordsController').
	otherwise('WordsController')

tg.controller('StartController', ($) => {
	console.log('/start');
	$.sendMessage('Send me any text to find phrase from movie.');
})

tg.controller('SettingsController', ($) => {
	console.log('/settings');
	$.sendMessage('Settings will be here.');
})

tg.controller('WordsController', ($) => {
	if ($.args) {
		//normalize query string
		var query_norm = $.args.replace('_', ' ').replace('/', '');
		$.sendMessage('Now seeking <b>' + query_norm + '</b> ...', {parse_mode: 'HTML'}, (answer, err) => {
			if (!err) {
				//console.log('answer', answer);
				seekPhrase($.chatId, answer.result, query_norm);
			} else {
				console.error('error Send Message', err);
			}
		});
	} else {
		$.sendMessage('Nothing to seek!');
	}
})

tg.callbackQueries((callback_data) => {
	var chat_id = callback_data.message.chat.id;
	//normalize query string
	var query_norm = callback_data.data.replace('_', ' ').replace('/', '');
	tg.sendMessage(chat_id,'Now seeking <b>' + query_norm + '</b> ...', {parse_mode: 'HTML'}, (answer, err) => {
		if (!err) {
			//console.log('answer', answer);
			seekPhrase(chat_id, answer.result, query_norm);
		} else {
			console.error('error Send Message', err);
		}
	});

})

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

var sendVideoFromAttach = (chat_id, a, n, tfid) => {
	var options = {
		caption: a[n].caption,
		reply_markup: JSON.stringify({
			inline_keyboard:[[{
				text:a[n].info,
				url: a[n].imdb
			}]]
		})
	}
	if (tfid) {
		tg.sendVideo(chat_id,tfid, options, (body, err) => {
			if (err || !body || !body.ok) {
				console.error('error Send TFID', err ? err : body);
				db.merge('p:' + a[n]._id, {tfid: null}, function (err, res) {
					if (err) {
						console.error('error Delete TFID', err);
					} else {
						showVideo(chat_id, a, n);
					}
				});
			} else {
				showVideo(chat_id, a, n + 1);
			}
		})
	} else {
		var readFromAttachStream = db.getAttachment('p:' + a[n]._id, 'video', function (err) {
			if (err) {
				console.error('error getAttachment', err);
			}
		});

		var fileName = 'temp/' + Math.random().toString(16) + '.mp4';
		var writeToFileStream = fs.createWriteStream(fileName);
		writeToFileStream.on('finish', () => {

			tg.sendVideo(chat_id,fs.createReadStream(fileName), options, (body, err) => {
				fs.unlink(fileName);
				if (err || !body || !body.ok) {
					console.error('error Send Video', err ? err : body);
				} else {
					if (body.result && body.result.video && body.result.video.file_id) {
						db.merge('p:' + a[n]._id, {tfid: body.result.video.file_id}, function (err, res) {
							if (err) {
								console.error('error Merge TFID', err);
							}
						});
					}
					showVideo(chat_id, a, n + 1);
				}
			})
		})
		readFromAttachStream.pipe(writeToFileStream);
	}
}
/**
 * show videos for phrase array
 * @param chat_id
 * @param a phrase array
 * @param n start from (default = 0)
 */
var showVideo = (chat_id, a, n)=> {
	n = n ? n : 0;
	if (n < a.length) {
		db.get('p:' + a[n]._id, function (err, doc) {
			if (doc && doc.text && doc.info && doc.imdb && doc._attachments && doc._attachments.video && doc._attachments.video.stub) {
				//phrase and video already saved in DB
				sendVideoFromAttach(chat_id, a, n, doc.tfid);
			} else {
				//not saved yet
				var writeToAttachStream;
				//save phrase
				db.save('p:' + a[n]._id, {
					text: a[n].caption,
					info: a[n].info,
					imdb: a[n].imdb,
					movie: a[n].movie
				}, function (err, res) {
					if (err) {
						console.error('error Save PhraseToDB', err);
					} else {
						//and save video as attachment
						var attachmentData = {
							name: 'video',
							'Content-Type': 'video/mp4'
						}
						writeToAttachStream = db.saveAttachment({id: res.id, rev: res.rev}, attachmentData,
							function (err, res) {
								if (err) {
									console.error('error saveAttachment', err);
								} else {
									sendVideoFromAttach(chat_id, a, n);
								}
							}
						)
						request(videoUrl(a[n]._id)).pipe(writeToAttachStream);
					}
				});
			}
		});
	}
}

var videoUrl = (id) => {
	return 'http://playphrase.me/video/phrase/' + id + '.mp4';
}

var seekPhrase = (chat_id, sent_message, queryString)=> {
	{
		req.get({
				url: 'http://playphrase.me/search',
				port: 9093,
				json: true,
				query: {
					q: queryString,
					skip: '0'
				}
			},
			function (body, response, err) {
				if (!err && response.statusCode == 200) {
					var mes;
					var options = {
						chat_id: sent_message.chat.id,
						message_id: sent_message.message_id,
						parse_mode: 'HTML'
					}
					if (body.count) {
						mes = 'Found: ' + body.count;
						var phraseAray = [];

						body.phrases.forEach(function (item, i, arr) {
							phraseAray.push({
								_id: item._id,
								caption: item.text,
								info: item.video_info.info,
								imdb: item.video_info.imdb,
								movie: item.movie
							})
						});
						showVideo(chat_id, phraseAray);
					} else {
						mes = 'Not Found.\n';
						var keyboard=[[]];
						if (body.suggestions && body.suggestions[0]) {
							mes += 'Did you mean:';
							body.suggestions.forEach(function (item, i, arr) {
								keyboard[0].push({text:item.text,
									callback_data: item.text});
							});
							options.reply_markup = JSON.stringify({inline_keyboard:keyboard});
						}
					}
					tg.editMessageText('Now seeking <b>' + queryString + '</b> ...\n' + mes, options);
				} else {
					tg.sendMessage(chat_id,'error');
				}
			})
	}
};