const secret = require('./../secret');
const Store = require('./../store');
const store = new Store('phrasio',{username: secret.DBadminLogin, password: secret.DBadminPassword});

//save view "phrase"
store.save('_design/foo',{
	 phrase: {
		 map: function (doc) {
			  {
				 emit(doc._id, doc);
			 }
		 }
	 },
	//http://localhost:5984/phrasio/_design/foo/_view/movie?group_level=1
	movie: {
		map: function (doc) {
			{
				emit(doc.info,1);
			}
		},
		reduce: function (keys, values) {
			{
				var sum = 0;
				for(var i = 0;i < values.length; i++) {
					sum += values[i];
				};
				return sum;
			}
		},
	}
 })

store.save('_design/bar',{
	views:{},
	"fulltext": {
		//http://localhost:5984/_fti/local/phrasio/_design/bar/m_t?q=t:*_know_it_*%20AND%20m:*futur*&include_docs=true
		"m_t": {
			'index': 'function(doc) { var ret=new Document(); ret.add(doc.searchText,{"field":"t"}); ret.add(doc.searchMovie,{"field":"m"}); return ret }'
		},
		"by_movie": {
			'index':'function(doc) { var ret=new Document(); ret.add(doc.searchMovie,{"field":"default"}); return ret }'
		},
		"by_text": {
			"index":'function(doc) { var ret=new Document(); ret.add(doc.searchText,{"field":"default"}); return ret }'
		}
	}
})

