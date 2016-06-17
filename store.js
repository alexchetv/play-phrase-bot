var cradle = require('cradle');
const Logger = require('./logger');
const logger = new Logger('[store]', 'i');
class Store {
	constructor(db_name, auth) {
		if (auth && auth.username && auth.password) {
			logger.l('auth', {auth});
			this.db = new (cradle.Connection)('127.0.0.1', 5984, {auth}).database(db_name);
		} else {
			logger.l('guest');
			this.db = new (cradle.Connection)().database(db_name);
		}
		this.db.exists(function (err, exists) {
			logger.c(!err && exists, `database ${db_name} connected`, `database ${db_name} connection error`)
		});
	}

	get(pref, id) {
		if (pref) {
			pref += ':';
		}
		return new Promise((resolve, reject) => {
			this.db.get(`${pref}${id}`, function (err, doc) {
				if (err) {
					if (err.error == 'not_found') {
						resolve(null)
					} else {
						reject(err);
					}
				}
				else {
					resolve(doc)
				}
			})
		})
	}

	view(name, options) {
		return new Promise((resolve, reject) => {
			this.db.view(name, options, function (err, res) {
				if (err) {
					reject(err);
				} else {
					resolve(res);
				}
			});
		})
	}


	save(pref, id, obj) {
		let self = this;
		if (pref) {
			pref += ':';
		}
		return new Promise((resolve, reject) => {
			this.db.get(`${pref}${id}`, function (err, doc) {
				if (err) {
					if (err.error == 'not_found') {
						self.db.save(`${pref}${id}`, obj, function (err, res) {
							if (err) {
								reject(err);
							} else {
								resolve(res)
							}
						})
					} else {
						reject(err);
					}
				}
				else {
					self.db.save(`${pref}${id}`, doc._rev, obj, function (err, res) {
						if (err) {
							reject(err);
						} else {
							resolve(res)
						}
					})
				}
			})
		})
	}

	update(pref, id, obj) {
		let self = this;
		if (pref) {
			pref += ':';
		}
		return new Promise((resolve, reject) => {
			this.db.get(`${pref}${id}`, function (err, doc) {
				if (err) {
					if (err.error == 'not_found') {
						self.db.save(`${pref}${id}`, obj, function (err, res) {
							if (err) {
								reject(err);
							} else {
								resolve(res)
							}
						})
					} else {
						reject(err);
					}
				}
				else {
					Object.assign(doc, obj);
					self.db.save(`${pref}${id}`, doc._rev, doc, function (err, res) {
						if (err) {
							reject(err);
						} else {
							resolve(res)
						}
					})
				}
			})
		})
	}

	getAttach(id, name) {
		return new Promise((resolve, reject) => {
			this.db.getAttachment(id, name, (err, data) => {
				if (err) {
					logger.e('getAttach error',err);
					reject(err);
				}
				else {
					logger.s('getAttach Ok');
					resolve(data.body)
				}
			})
		})
	}

	saveAttach(id, rev, name, contentType, data) {
		return new Promise((resolve, reject) => {
			this.db.saveAttachment(
				{id,rev},
				{name, 'Content-Type':contentType, body:data},
				(err) => {
				if (err) {
					reject(err);
				}
				else {
					resolve()
				}
			})
		})
	}
}
module.exports = Store;