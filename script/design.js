const secret = require('./../secret');
const Store = require('./../store');
const store = new Store('telegram',{username: secret.DBadminLogin, password: secret.DBadminPassword});

//save view "phrase"
store.save('','_design/telegram',{
	 phrase: {
		 map: function (doc) {
			  {
				 emit(doc._id, doc);
			 }
		 }
	 }
 })

store.save('','_design/foo',{
	"fulltext": {
		"by_movie": {
			'index':'function(doc) { var ret=new Document(); ret.add(doc.info,{"field":"default"}); return ret }'
		},
		"by_text": {
			"index":'function(doc) { var ret=new Document(); ret.add(doc.text,{"field":"default"}); return ret }'
		},
		"by_searchText": {
			"index":'function(doc) { var ret=new Document(); ret.add(doc.searchText,{"field":"default"}); return ret }'
		}
	}
})

