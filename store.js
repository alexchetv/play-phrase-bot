var cradle = require('cradle');
const Logger = require('./logger');
const logger = new Logger('[store]','e','./my.log');
class Store {
	constructor(db_name) {
		this.db = new (cradle.Connection)().database(db_name);
		this.db.exists(function (err, exists) {
			logger.c(!err && exists,`database ${db_name} connected`,`[store.error] database ${db_name} connection error`,false)
		});
	}

	get(pref, id) {
		return new Promise((resolve, reject) => {
			this.db.get(`${pref}:${id}`, function (err, doc) {
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


	save(pref, id, obj) {
		let self = this;
		return new Promise((resolve, reject) => {
			this.db.get(`${pref}:${id}`, function (err, doc) {
				if (err) {
					if (err.error == 'not_found') {
						self.db.save(`${pref}:${id}`, obj, function (err, res) {
							if (err) {
								reject(err);
							}	else {
								resolve(res)
							}
						})
					} else {
						reject(err);
					}
				}
				else {
					self.db.save(`${pref}:${id}`, doc._rev, obj, function (err, res) {
						if (err) {
							reject(err);
						}	else {
							resolve(res)
						}
					})
				}
			})
		})
	}

	update(pref, id, obj) {
		let self = this;
		return new Promise((resolve, reject) => {
			this.db.get(`${pref}:${id}`, function (err, doc) {
				if (err) {
					if (err.error == 'not_found') {
						self.db.save(`${pref}:${id}`, obj, function (err, res) {
							if (err) {
								reject(err);
							}	else {
								resolve(res)
							}
						})
					} else {
						reject(err);
					}
				}
				else {
					Object.assign(doc, obj);
					self.db.save(`${pref}:${id}`, doc._rev, doc, function (err, res) {
						if (err) {
							reject(err);
						}	else {
							resolve(res)
						}
					})
				}
			})
		})
	}
}
module.exports = Store;