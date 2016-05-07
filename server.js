/**
 * Created by alexchetv on 02.05.2016.
 */
'use strict'

const fs = require('fs');
const secret = require('./secret');
var tg = require('telegram-node-bot')(secret.token);
var req = require('tiny_request');

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
	/*console.log('args', $.args);
	 console.log('message', $.message);
	 console.log('query', $.query);*/

	if ($.args) {
		//normalize query string
		var query_norm = $.args.replace('_', ' ').replace('/', '');
		$.sendMessage('Now seeking <b>' + query_norm + '</b> ...', {parse_mode: 'HTML'}, (answer, err) => {
			if (!err) {
				console.log('answer', answer);
				seekPhrase($, answer.result, query_norm);
			} else {
				console.error('error Send Message', err);
			}
		});
	} else {
		$.sendMessage('Nothing to seek!');
	}


})

tg.controller('VideoController', ($) => {
	tg.for('/video', () => {
		$.sendVideo(fs.createReadStream('video/truba.mp4'))
	})
})

tg.callbackQueries(($) => {
	console.log('callbackQueries', $);

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

var show = ($, url, caption)=> {
	console.log('show');
	var tempStream = fs.createWriteStream('temp.mp4');
	req.get({
			url: url,
			pipe: tempStream
		},
		function (body, response, err) {
			console.log('sendVideo');
			$.sendVideo(fs.createReadStream('temp/temp.mp4'), {caption: caption});
		});
}

var showVideos = ($, a, n)=> {
	n = n?n:0;
	if (n < a.length) {
		var fileName = 'video/' + a[n]._id + ".mp4";
		var wstream = fs.createWriteStream(fileName);
		var self = this;
		wstream.on('finish', () => {
			$.sendVideo(fs.createReadStream(fileName), {caption: a[n].caption}, (body, err) => {
				if (err) {
					console.error('error Send Video', err);
				} else {
					if (body && body.result && body.result.video && body.result.video.file_id) {
						savedVideo.push({
							file_id: body.result.video.file_id,
							url: a[n].url
						})
					}
					showVideos($, a, n+1);
				}
			})
		})

		req.get({
				url: a[n].url,
				pipe: wstream
			},
			function (body, response, err) {
				if (err) {
					console.error('error Load Video', err);
				}
			});
	}
}

var savedVideo = [];

var seekPhrase = ($, sent_message, q)=> {
	{
		req.get({
				url: 'http://playphrase.me/search',
				port: 9093,
				json: true,
				query: {
					q: q,
					skip: '0'
				}
			},
			function (body, response, err) {
				if (!err && response.statusCode == 200) {
					if (body.count) {
						$.sendMessage('Found: ' + body.count);
						var vidAray = [];

						body.phrases.forEach(function (item, i, arr) {
							vidAray.push({
								_id: item._id,
								caption: item.text,
								url: 'http://playphrase.me/video/phrase/' + item._id + '.mp4'
							})
							//console.log(item);
							/*buttonAray.push({
							 text:item.text,
							 callback: () => {
							 show($,'http://playphrase.me/video/phrase/'+item._id+'.mp4',item.text)
							 }
							 })*/
							//show($,'http://playphrase.me/video/phrase/'+item._id+'.mp4',item.text)
						});
						showVideos($, vidAray);
						//$.runInlineMenu('sendMessage', 'Select:', {}, buttonAray, 1)
					} else {
						var mes = 'Not Found.\n';
						if (body.suggestions && body.suggestions[0]) {
							mes += 'Did you mean:\n';
							console.log('suggestions', body.suggestions);

							body.suggestions.forEach(function (item, i, arr) {
								var prepared = item.text.replace(' ', '_');
								mes += '/_' + prepared + ' (' + item.count + ')\n';
							});
						}
						tg.editMessageText('Now seeking <b>' + q + '</b>.\n' + mes, {
							chat_id: sent_message.chat.id,
							message_id: sent_message.message_id,
							parse_mode: 'HTML'
						});
					}
				} else {
					$.sendMessage('error');
				}
			})
	}
};