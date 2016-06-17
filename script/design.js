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
