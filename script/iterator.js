//CREATE AUDIO ATTACH FROM VIDEO ATTACH
const iterator = require('couchdb-iterator');
const Store = require('./../store');
const store = new Store('phrasio');
const Logger = require('./../logger');
const logger = new Logger('[correct]', 'i');


//itterate through phrases

iterator('http://localhost:5984/phrasio'/*,'foo/phrase'*/,(doc)=>{
	//logger.i('ok',doc);
	if (doc.id.startsWith('p:')) {
		let n = {};
		/*if (!doc.doc.searchText.startsWith('_')) {
			n.searchText = '_' + doc.doc.searchText + '_';
		}
		if (!doc.doc.searchMovie.startsWith('_')) {
			n.searchMovie = '_' + doc.doc.searchMovie + '_';
		}*/
		if (doc.doc.searchText.includes('"')){
			n.searchText = doc.doc.searchText.replace(/"/g,'');
		}
		if (doc.doc.searchMovie.includes('"')){
			n.searchMovie = doc.doc.searchMovie.replace(/"/g,'');
		}
		if (n) {
			store.update('',doc.id,n);
		}
	}
},{concurrency:5,include_docs:true})
		.then((count) => {
			logger.s('ok',count);
		})
		.catch((err) => {
			logger.e('iterator error', err);
		});
