const Store = require('./store.js');
const store = new Store('phrasio');
const Logger = require('./logger');
const logger = new Logger('[phrasio]', 'i');

class Phrasio {
	static save(feed) {
		feed.forEach((item) => {
			store.save('p', item._id,
				{
					text: item.text,
					searchText: item.searchText.toLowerCase().replace(/\s+/g,'_'),
					info: item.video_info.info,
					searchMovie: item.video_info.info.split('/')[0].toLowerCase().trim().replace(/\s+/g,'_'),
					imdb: item.video_info.imdb,
					movie: item.movie
				},
				false)
				.catch((error)=> {
					logger.e('error save', error);
				})
		})
	}
}

module.exports = Phrasio;