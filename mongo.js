'use strict';

var getMongoDbName = function() {
  if (process.env.NODE_ENV == 'production') {
    if (process.env.MONGODB_ATLAS_DB) {
      return process.env.MONGODB_ATLAS_DB;
    }
  }
  return 'powerdash';
}

var getMongoUrl = function() {
  var mongourl;

  if (process.env.NODE_ENV == 'production') {
    if (process.env.MONGODB_ATLAS_URI) {
      return process.env.MONGODB_ATLAS_URI;
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

  obj.hostname = (obj.hostname || '127.0.0.1');
  obj.port = (obj.port || 27017);
  obj.db = (obj.db || getMongoDbName());
  if (obj.username && obj.password) {
    return 'mongodb://' + obj.username + ':' + obj.password + '@'
    + obj.hostname + ':' + obj.port + '/' + obj.db;
  } else {
    return 'mongodb://' + obj.hostname + ':' + obj.port + '/' + obj.db;
  }
};

module.exports.getMongoUrl = getMongoUrl;
module.exports.getMongoDbName = getMongoDbName;