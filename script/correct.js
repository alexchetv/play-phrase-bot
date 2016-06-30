//CREATE AUDIO ATTACH FROM VIDEO ATTACH
const Store = require('./../store');
const store = new Store('phrasio');
const Logger = require('./../logger');
const logger = new Logger('[correct]', 'i');


//itterate through phrases
	store.view('foo/phrase', {startkey: 'p:', endkey: 'p:\u9999'})
		.then((res) => {
			res.forEach((key,doc)=> {
				let n = {};
				if (!doc.searchText.startsWith('_')) {
					n.searchText = '_' + doc.searchText + '_';
				}
				if (!doc.searchMovie.startsWith('_')) {
					n.searchMovie = '_' + doc.searchMovie + '_';
				}
				if (n) {
					store.update(key,n);
				}

			})
		})
		.catch((err) => {
			logger.e('view error', err)
		});
