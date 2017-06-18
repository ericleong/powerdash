var moment = require('moment-timezone'),
	MongoClient = require('mongodb').MongoClient,
	mongo = require('./mongo.js'),
	cleanDGM = require('./utils.js').cleanDGM,
	ObjectId = require('mongodb').ObjectId;


var mongourl = mongo.getMongoUrl();

var scrapeList = require('./scrape.json');

if (scrapeList && scrapeList.length) {
	for (var i = 0; i < scrapeList.length; i++) {
		if (scrapeList[i].type == 'ntlm') {
			cleanup(scrapeList[i].dgm);
		}
	}
}

// Saves a block (chunk) of data
// Used by rickshaw aggregation
var condense = function(batch, ids, row, lastTime, num, dt) {
	var new_row = {};

	for (var col in row) {
		new_row[col] = row[col] / num * dt;
	}

	new_row['time'] = lastTime.toDate();

	batch.find({_id: {$in: ids}}).remove();
	batch.insert(new_row);
};

function cleanup(dgm) {
	// Gets a recent set of data from the database
	
	if (dgm == null || dgm.length == 0) {
		return;
	}
	
	/* Connect to the DB and auth */
	MongoClient.connect(mongourl, function(err, db) {
		if (err) {
			console.error(err);
			return;
		}

		var collection = db.collection(cleanDGM(dgm));

		// build a map of columns to data
		var ids = [];

		var batch = collection.initializeOrderedBulkOp();
		var lastTime = undefined;
		var row = {};
		var num = 0;
		
		var dt = 1;
		var count = 0;

		var cursor = collection.find({ time: { $gte: new Date(2017, 05, 28), $lt: new Date(2017, 06, 16) }});
		cursor.sort({time: 1});

		cursor.forEach(function(doc) {
		
			var time;
		
			if (doc.time) {
				time = moment.tz(doc.time, 'America/New_York');
			} else {
				console.error('Missing time in document in ' + dgm);
				return;
			}

			time.set('millisecond', 0);
			time.set('second', 0);

			if (lastTime) {
				// new block
				if (!time.isSame(lastTime)) {

					condense(batch, ids, row, lastTime, num, dt);

					count++;

					if (count > 60) {
						batch.execute(function(err, result) {
							if (err) {
								console.error(err);
								return;
							}

							console.log(result.nInserted + ", " + result.nRemoved);
						});

						count = 0;
						batch = collection.initializeOrderedBulkOp();
					}

					// new block
					
					for (var col in row) {
						row[col] = doc[col];
					}

					ids.push(doc['_id']);
					
					// switch to new block
					lastTime = time;
					num = 1;
				} else { // same block
					var bad = '';
					for (var col in row) {
						if (typeof doc[col] == 'number' && isFinite(doc[col])) {
							row[col] += doc[col];
						} else if (doc[col]) {
							bad += ' ' + col + ' == ' + doc[col];
						}
					}
					if (bad.length > 0) {
						console.warn(time + ':' + bad);
					}
					num++;
					ids.push(doc['_id']);
				}
			} else {
				lastTime = time;
				num = 1;
				
				for (var col in doc) {
					if (col == 'time' || col == '_id')
						continue;
					
					row[col] = doc[col];
				}

				ids.push(doc['_id']);
			}

		}, function(err) {

			if (err) {
				console.error(err);
				return;
			}

			if (lastTime) {
				condense(batch, ids, row, lastTime, num, dt);

				batch.execute(function(err, result) {
					db.close();

					if (err) {
						console.error(err);
						return;
					}
				});
			} else {
				db.close();
				console.error('Missing lastTime.');
			}
		});
	});
}