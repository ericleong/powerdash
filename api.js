var async = require('async'),
mongo = require('./mongo.js'),
cleanDGM = require('./utils.js').cleanDGM,
moment = require('moment-timezone'),
MongoClient = require('mongodb').MongoClient;

var mongourl = mongo.getMongoUrl();

var humanize = require('./humanize.json');

var toRickshaw = function(db, cursor, units, cb) {
	// map database to dictionary
	
	async.waterfall([function(callback) {
		// get document count
		cursor.count(function(err, count) {
			callback(null, count);
		});
	}],
	function(err, count) {
		// build a map of columns to data
		var map = {};
		
		var lastTime = undefined;
		var row = {};
		var num = 0;

		var offset = new Date().getTimezoneOffset() * 60 * 1000;
		
		cursor.each(function(err, doc) {
			if (err) {
				console.error('error converting to rickshaw');
				console.dir(err);

				cb('error converting to rickshaw');
			}
			
			if (doc == null) {
				db.close();
				
				// convert map into list
				var list = [];
				
				for (var key in map) {
					list.push({
						name : humanize[key] ? humanize[key] : key,
						raw : key,
						id : key,
						unit: units[key], 
						data : map[key]
					});
				}
				cb(null, list);
				
				return;
			}
			
			if (count <= 60*24) { // less than one day at 1 sample/min
				for (var col in doc) {
					if (col == 'time' || col == '_id')
						continue;
					
					if (map[col]) {
						map[col].push({
							x : parseInt(moment(doc.time).format('X'), 10),
							y : doc[col]
						});
					} else {
						map[col] = [ {
							x : parseInt(moment(doc.time).format('X'), 10),
							y : doc[col]
						} ];
					}
				}
			} else if (count <= 60*24*7) {
				// minute by minute intervals
				
				if (lastTime) {
					// new minute
					if (doc.time.getMinutes() != lastTime.getMinutes()) {
						lastTime.setSeconds(0);
						lastTime.setMilliseconds(0);
						
						// save previous minute
						for (var col in row) {
							if (map[col]) {
								if (row[col] && num) {
									map[col].push({
										x: parseInt(moment(lastTime).format('X'), 10),
										y: row[col] / num
									});
								} else {
									console.warn(lastTime + ': ' + row[col] + ' ' + num);
								}
							} else {
								map[col] = [ {
									x: parseInt(moment(lastTime).format('X'), 10),
									y: row[col] / num
								} ];
							}
						}
						
						for (var col in row) {
							row[col] = doc[col];
						}
						
						// switch to new minute
						lastTime = doc.time;
						num = 1;
					} else { // same minute
						for (var col in row) {
							if (typeof doc[col] == 'number') {
								row[col] += doc[col];
							} else {
								console.warn(doc.time + ': ' + col + ' == ' + doc[col]);
							}
						}
						num++;
					}
				} else {
					lastTime = doc.time;
					lastTime.setSeconds(0);
					lastTime.setMilliseconds(0);
					num = 1;
					
					for (var col in doc) {
						if (col == 'time' || col == '_id')
							continue;
						
						row[col] = doc[col];
					}
				}
			} else {
				// hour-by-hour intervals

				if (lastTime) {
					// new hour
					if (doc.time.getHours() != lastTime.getHours()) {
						lastTime.setMinutes(0);
						lastTime.setSeconds(0);
						lastTime.setMilliseconds(0);
						
						// save previous hour
						for (var col in row) {
							if (map[col]) {
								if (row[col] && num) {
									map[col].push({
										x: parseInt(moment(lastTime).format('X'), 10),
										y: row[col] / num
									});
								} else {
									console.warn(lastTime + ': ' + row[col] + ' ' + num);
								}
							} else {
								map[col] = [ {
									x: parseInt(moment(lastTime).format('X'), 10),
									y: row[col] / num
								} ];
							}
						}
						
						for (var col in row) {
							row[col] = doc[col];
						}
						
						// switch to new hour
						lastTime = doc.time;
						num = 1;
					} else { // same hour
						for (var col in row) {
							if (typeof doc[col] == 'number') {
								row[col] += doc[col];
							} else {
								console.warn(doc.time + ': ' + col + ' == ' + doc[col]);
							}
						}
						num++;
					}
				} else {
					lastTime = doc.time;
					lastTime.setMinutes(0);
					lastTime.setSeconds(0);
					lastTime.setMilliseconds(0);
					num = 1;
					
					for (var col in doc) {
						if (col == 'time' || col == '_id')
							continue;
						
						row[col] = doc[col];
					}
				}
			}
		});
	});
};

var toCSV = function(db, cursor, units, callback) {
	// creates a csv file
	
	var csv = '';
	var header = [];
	
	cursor.each(function(err, doc) {
		if (err) {
			console.log('error ')
			console.dir(err);

			callback(null);
			return;
		}
		
		if (doc == null) {
			db.close();
			callback(null, csv);
			return;
		}
		
		if (header.length == 0) {
			header.push('time');
			
			for (var col in doc) {
				if (col == 'time' || col == '_id')
					continue;
				header.push(col);
			}
			
			csv += header.toString();
		}
		
		var row = [];
		
		for (var h in header) {
			if (header[h] == 'time') {
				row.push(moment(doc[header[h]]).tz('America/New_York').format('DD-MMM-YY HH:mm:ss'));
			} else {
				row.push(doc[header[h]]);
			}
		}
		
		if (row) {
			csv += '\n' + row.toString();
		}
	});
};

var diff = function(db, cursor, units, callback) {
	var first, last;

	cursor.each(function(err, doc) {

		if (err) {
			res.send(500, 'Error retrieving water data.')
		}

		if (doc == null) {
			db.close()

			var diff = {};

			for (var col in last) {
				if (col != '_id') {
					diff[col] = last[col] - first[col];
				}
			}

			callback(null, diff);
			return;
		}

		if (first === undefined) {
			first = doc;
		}

		last = doc;
	});
};

var toArray = function(db, cursor, units, callback) {
	// creates a map

	cursor.toArray(function(err, results) {
		db.close();
		callback(null, results);
	});
};

var buildProjection = function(desired) {
	var projection;
	if (desired && desired.length > 0) {
		projection = {time: true};
		for (var d in desired) {
			projection[desired[d]] = true;
		}
	}
	
	return projection;
};

var getLatest = function(dgm, callback) {
	// Gets the last set of data from the database
	
	/* Connect to the DB and auth */
	MongoClient.connect(mongourl, function(err, db) {
		if(err) { return console.dir(err); }
		
		var collection = db.collection(cleanDGM(dgm));
		
		// get the time of the newest datapoint in the database
		collection.find().sort({time: -1}).limit(1).nextObject(function(err, item) {
			if (!err && item) {
				db.close();
				callback(item);
			} else {
				db.close();

				console.warn('error getting newest datapoint for: ' + dgm);
				if (err) {
					console.warn(err.stack);
				}
				callback();
			}
		});
	});
};

var getProjectionAndUnits = function(db, dgm, desired, callback) {

	if (desired == 'all') {
		// get units
		db.collection('meta_' + cleanDGM(dgm)).find().toArray(function(err, variables) {
			if (!err && variables) {
				var unit = {};

				for (var i in variables) {
					if (variables[i].name && variables[i].name.indexOf('@') < 0) {
						unit[variables[i].name] = variables[i].unit;
					}
				}

				callback(null, null, unit);
			} else {
				console.warn('error getting all fields from ' + dgm);
				console.warn(err.stack);
				callback(err);
			}
		});
	} else {
		// Pick variables to retrieve
		var projection = buildProjection(desired);

		if (projection) {
			// get units
			db.collection('meta_' + cleanDGM(dgm)).find({name: { $in: desired }}, {name: true, unit: true}).toArray(function(err, variables) {
				if (!err && variables) {
					var unit = {};

					for (var i in variables) {
						if (variables[i].name) {
							unit[variables[i].name] = variables[i].unit;
						}
					}

					callback(null, projection, unit);
				} else {
					console.warn('error getting units from ' + dgm);
					console.warn(err.stack);
					callback(err);
				}
			});
		} else {
			// get the variables that have kW
			db.collection('meta_' + cleanDGM(dgm)).find({unit: 'kW'}, {name: true}).toArray(function(err, variables) {
				if (!err && variables) {
					var projection = {time: true};
					var unit = {};

					for (var i in variables) {
						if (variables[i].name && variables[i].name.indexOf('@') < 0) {
							projection[variables[i].name] = true;
							unit[variables[i].name] = 'kW';
						}
					}

					callback(null, projection, unit);
				} else {
					console.warn('error getting variables from ' + dgm);
					console.warn(err.stack);
					callback(err);
				}
			});
		}
	}
};

var getRecent = function(dgm, elapsed, desired, processor, cb) {
	// Gets a recent set of data from the database
	
	desired = (desired === undefined) ? [] : desired;
	
	/* Connect to the DB and auth */
	MongoClient.connect(mongourl, function(err, db) {
		if (err) { 
			console.error('error connecting to mongodb!');
			console.error(err.stack); 
			cb();

			return;
		}
		
		var collection = db.collection(cleanDGM(dgm));

		async.waterfall([ function(callback) {
			getProjectionAndUnits(db, dgm, desired, callback);
		}, function(projection, units, callback) {
			// get the time of the newest datapoint in the database
			collection.find().sort({time: -1}).limit(1).nextObject(function(err, item) {
				if (!err && item) {
					callback(null, item.time, projection, units);
				} else {
					console.warn('error getting newest datapoint from ' + dgm);
					if (err) {
						console.warn(err.stack);
						callback(err);
					} else {
						callback('error getting newest datapoint!');
					}
				}
			});
		}, function(latest, projection, units, callback) {
			// query for events newer than latest - elapsed
			var cursor;
			
			if (projection)
				cursor = collection.find({ time: { $gt: new Date(latest - elapsed) }}, projection);
			else
				cursor = collection.find({ time: { $gt: new Date(latest - elapsed) }});
			
			cursor.sort({time: 1});
			
			callback(null, db, cursor, units);
		}, processor
		],
		function(err, processed) {
			if (!err) {
				cb(processed);
			} else {
				cb();
			}
		});
});
};

var getRange = function(dgm, start, end, desired, processor, cb) {
	// Gets data between two times from the database
	
	desired = (desired === undefined) ? [] : desired;
	
	/* Connect to the DB and auth */
	MongoClient.connect(mongourl, function(err, db) {
		if(err) { return console.dir(err); }
		
		var collection = db.collection(cleanDGM(dgm));

		async.waterfall([
			function(callback) {
				getProjectionAndUnits(db, dgm, desired, callback);
			},
			function(projection, units, callback) {
				// query for events between start and end
				var cursor;

				if (projection)
					cursor = collection.find({ time: { $lt: end, $gt: start }}, projection);
				else
					cursor = collection.find({ time: { $lt: end, $gt: start }});
				
				cursor.sort({time: 1});
				
				callback(null, db, cursor, units);
			}, processor
		],
		function(err, processed) {
			cb(processed);
		});
	});
};

var generateCSV = function(dgms, variables, method, cb) {
	if (dgms.length > 1) {
		var genArray = function(dgm, callback) {
			method(dgm, variables, toArray, callback);
		};

		var results = {};

		async.map(dgms, genArray, function(err, results) {

			var csv = '';
			var header = [];
			var humanHeader = [];

			header.push('time');
			humanHeader.push('time');

			// headers
			var tracker = {};

			for (var r in results) {
				tracker[r] = 0;

				if (results[r]) {
					for (var col in results[r][0]) {
						if (col == 'time' || col == '_id')
							continue;

						header.push(col);

						if (col in humanize) {
							humanHeader.push(humanize[col]);
						} else {
							humanHeader.push(col);
						}
					}
				}
			}

			// error out if there are no columns
			if (header.length == 1) {
				cb('Could not retrieve data (no columns).');

				return;
			}

			if (variables != 'all') {
				csv += humanHeader.toString();
			} else {
				csv += header.toString();
			}

			do {
				var finished = true;

				// find the earliest time
				var minTime = undefined;

				for (var r in results) {
					if (results[r] && 
						tracker[r] < results[r].length && 
						results[r][tracker[r]].time) {

						if (minTime === undefined || results[r][tracker[r]].time < minTime) {
							minTime = results[r][tracker[r]].time;
						}
					}
				}

				minTimeStr = moment(minTime).tz('America/New_York').format('DD-MMM-YY HH:mm:ss');

				// build the row for this time
				var row = {};

				for (var r in results) {
					if (results[r] && tracker[r] < results[r].length && 
						moment(results[r][tracker[r]].time).tz('America/New_York').format('DD-MMM-YY HH:mm:ss') == minTimeStr) {
						for (var h in header) {
							if (header[h] != 'time' && header[h] in results[r][tracker[r]]) {
								row[header[h]] = results[r][tracker[r]][header[h]];
							}
						}

						tracker[r]++;
						finished = false;
					}
				}

				// add blanks where appropriate
				var line = [];

				for (var h in header) {
					if (header[h] == 'time') {
						line.push(minTimeStr);
					} else if (header[h] in row) {
						line.push(row[header[h]]);
					} else {
						line.push('');
					}
				}

				if (!finished) {
					csv += '\n' + line.toString();
				}
			} while (!finished);

			cb(null, csv)
		});	
	} else {
		method(dgms[0], variables, toCSV, function(err, data) {
			if (data) {
				cb(null, data)
			} else {
				cb('Could not retrieve data.');
			}
		});
	}
};

module.exports.getRange = getRange;
module.exports.getLatest = getLatest;
module.exports.getRecent = getRecent;
module.exports.toRickshaw = toRickshaw;
module.exports.toCSV = toCSV;
module.exports.toArray = toArray;
module.exports.diff = diff;
module.exports.generateCSV = generateCSV;
