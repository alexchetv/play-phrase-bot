/**
 * Created by alexchetv on 16.05.2016.
 */
'use strict'

const secret = require('./secret');
//var req = require('tiny_request');
var cradle = require('cradle');
var db = new (cradle.Connection)().database('telegram');
const Queue = require('./queue.js');
var telegram = require('telegram-bot-api');

var api = new telegram({
	token: secret.token,
	updates: {
		enabled: true
	}
});

api.on('message', function (message) {
	// Received text message
	console.log(message);
	if (message.text == '/start') {
		api.sendMessage({
			chat_id: message.chat.id,
			text: 'Send me any text to find containing it phrase from movie.\nTo filter results by movie title send /movie (or /m) <b>part of the title</b>\nTo take this filter off just send /all',
			parse_mode: 'HTML'
		})
	}
	
});