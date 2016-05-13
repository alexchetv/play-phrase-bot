const secret = require('./secret');
const fs = require('fs');
var tg = require('telegram-node-bot')(secret.token);
var cradle = require('cradle');
var db = new (cradle.Connection)().database('telegram');
var ellipsize = require('ellipsize');
var request = require('request');

class Queue {
	constructor(chat_id) {
		console.log('Queue',chat_id);
		this.chat_id = chat_id;
		this.content = [];
		this.enqueued = 0;
		this.busy = false;
	}

	enqueue(item) {
		this.content.push(item);
		this.enqueued++;
		this._work();
	}

	_sendVideoFromAttach(element,tfid) {
		console.log(element,tfid);
		var options = {
			caption: ellipsize(element.caption, 200, {ellipse: ' …'}),
			reply_markup: JSON.stringify({
				inline_keyboard: [[{
					text: element.info,
					url: element.imdb
				}]]
			})
		}
		if (tfid) {
			tg.sendVideo(this.chat_id, tfid, options, (body, err) => {
				if (err || !body || !body.ok) {
					console.error('error Send TFID', err ? err : body);
					db.merge('p:' + element._id, {tfid: null}, function (err, res) {
						if (err) {
							console.error('error Delete TFID', err);
						} else {
							this.busy = false;
							this._work();
						}
					});
				} else {
					this.busy = false;
					this._work();
				}
			})
		} else {
			var readFromAttachStream = db.getAttachment('p:' + element._id, 'video', function (err) {
				if (err) {
					console.error('error getAttachment', err);
				}
			});

			var fileName = 'temp/' + Math.random().toString(16) + '.mp4';
			var writeToFileStream = fs.createWriteStream(fileName);
			writeToFileStream.on('finish', () => {
				tg.sendVideo(this.chat_id, fs.createReadStream(fileName), options, (body, err) => {
					fs.unlink(fileName);
					if (err || !body || !body.ok) {
						console.error('error Send Video', err ? err : body);
					} else {
						if (body.result && body.result.video && body.result.video.file_id) {
							db.merge('p:' + element._id, {tfid: body.result.video.file_id}, function (err, res) {
								if (err) {
									console.error('error Merge TFID', err);
								}
							});
						}
						this.busy = false;
						this._work();
					}
				})
			})
			readFromAttachStream.pipe(writeToFileStream);
		}

	}

	_work() {
		if (this.busy) return;
		if (this.content[0]) {
			this.busy = true;
			this._showElement(this.content.shift());
		} else {
			this.busy = false;
		}
	}

		_showElement(element) {
			var self=this;
			if (element.type=='video') {
				db.get('p:' + element._id, function (err, doc) {
					if (doc && doc.text && doc.info && doc.imdb && doc._attachments && doc._attachments.video && doc._attachments.video.stub) {
						//phrase and video already saved in DB
						self._sendVideoFromAttach(element, doc.tfid);
					} else {
						//not saved yet
						var writeToAttachStream;
						//save phrase
						db.save('p:' + element._id, {
							text: element.caption,
							info: element.info,
							imdb: element.imdb,
							movie: element.movie
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
											self._sendVideoFromAttach(element);
										}
									}
								)
								request('http://playphrase.me/video/phrase/' + element._id + '.mp4').pipe(writeToAttachStream);
							}
						});
					}
				});


			} else {//type="button"
				tg.sendMessage(this.chat_id,element.text,
					{
						parse_mode: 'HTML',
						reply_markup:element.button
					}
				);
			}
		}
}

module.exports = Queue;