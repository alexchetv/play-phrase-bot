const secret = require('./../secret');
const Store = require('./../store');
const store = new Store('phrasio',{username: secret.DBadminLogin, password: secret.DBadminPassword});

store.db.compact();

