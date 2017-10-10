var moment = require('moment-timezone'),
	async = require('async'),
	MongoClient = require('mongodb').MongoClient,
	mongo = require('./mongo.js'),
	cleanDGM = require('./utils.js').cleanDGM,
	ObjectId = require('mongodb').ObjectId;


var mongourl = mongo.getMongoUrl();

var scrapeList = require('./scrape.json');

if (scrapeList && scrapeList.length) {

	async.filter(scrapeList, 
		function(item, callback) {
			callback(item.type == 'ntlm');
		},
		function(results) {
			async.eachSeries(results, 
				function(item, callback) {
					cleanup(item.dgm, callback);
				},
				function(err) {
					console.log('Done!');
				});
		});
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

function cleanup(dgm, callback) {
	// Gets a recent set of data from the database
	
	if (dgm == null || dgm.length == 0) {
		callback(null);
		return;
	}
	
	/* Connect to the DB and auth */
	MongoClient.connect(mongourl, function(err, db) {
		if (err) {
			console.error(err);
			callback(null);
			return;
		}

		var collection = db.collection(cleanDGM(dgm));

		// build a map of columns to data
		var ids = [];

		var batch = collection.initializeOrderedBulkOp();
		var batches = [];
		var batchCounter = 0;
		var done = false;
		var lastTime = undefined;
		var row = {};
		var num = 0;
		
		var dt = 1;
		var count = 0;

		var start = new Date(2014, 00, 01);
		var end = new Date(2017, 07, 01);

		var cursor = collection.find({ time: { $gte: start, $lt: end }});
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

					if (count >= 60) {
						batchCounter++;

						var batchId = batchCounter;
						batches.push(batchId);

						batch.execute(function(err, result) {
							var index = batches.indexOf(batchId);
							batches.splice(index, 1);

							if (err) {
								console.error(err);
							} else {
								console.log(dgm + ":" + batchId + ": " + result.nInserted + ", " + result.nRemoved);
							}

							if (batches.length <= 0 && done) {
								db.close();
								console.log("Finished " + dgm);
								callback(null);
							}
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

			done = true;

			if (err) {
				console.error(err);
				callback(err);
				return;
			}

			if (lastTime) {
				condense(batch, ids, row, lastTime, num, dt);

				batchCounter++;

				var batchId = batchCounter;
				batches.push(batchId);

				batch.execute(function(err, result) {
					var index = batches.indexOf(batchId);
					batches.splice(index, 1);

					if (err) {
						console.error(err);
					} else {
						console.log(dgm + ":" + batchId + ": " + result.nInserted + ", " + result.nRemoved);
					}

					if (batches.length <= 0 && done) {
						db.close();
						console.log("Finished " + dgm);
						callback(null);
					}
				});
			} else {
				console.error('Missing lastTime for ' + dgm);
				if (batches.length <= 0) {
					db.close();
					callback('Missing lastTime.');
				}
			}
		});
	});
}