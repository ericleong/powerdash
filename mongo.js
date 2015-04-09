'use strict';

var getMongoUrl = function() {
	var mongourl;

	if (process.env.NODE_ENV == 'production') {
		if (process.env.MONGO_URL) {
			mongourl = process.env.MONGO_URL;
		} else {
			// last resort
			mongourl = generate_mongo_url();
		}
	} else {
		mongourl = generate_mongo_url();
	}

	return mongourl;
}

var generate_mongo_url = function(obj) {
	if (obj === undefined) {
		obj = {};
	}

	obj.hostname = (obj.hostname || 'localhost');
	obj.port = (obj.port || 27017);
	obj.db = (obj.db || 'energydata');
	if (obj.username && obj.password) {
		return 'mongodb://' + obj.username + ':' + obj.password + '@'
		+ obj.hostname + ':' + obj.port + '/' + obj.db;
	} else {
		return 'mongodb://' + obj.hostname + ':' + obj.port + '/' + obj.db;
	}
};

module.exports.getMongoUrl = getMongoUrl;