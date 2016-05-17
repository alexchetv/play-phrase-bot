"use strict";
var Promise = require('promise');
var rp = require('request-promise');

class Search {
    constructor(query, filter) {
        this.query = query;
        this.filter = filter;
    }

    init() {
        return
        rp.get({
            url: 'http://playphrase.me:9093/search',
            json: true,
            qs: {
                q: this.query,
                skip: 0
            }
        })
            .then((res)=> {
                console.log(res);
                //return Promise.resolve(res);
            })
            .catch((err)=> {
                console.log('erroooorrrr', err);
                //return Promise.reject(err);
            });
    }
}

module.exports = Search;