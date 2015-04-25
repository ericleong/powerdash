'use strict';


var async = require('async'),
	util = require('util'),
	moment = require('moment-timezone'),
	MongoClient = require('mongodb').MongoClient,
	mongo = require('./mongo.js'),
	ntlmRequest = require('ntlm-auth').ntlmRequest,
	parseString = require('xml2js').parseString,
	getLatest = require('./api.js').getLatest,
	cleanDGM = require('./utils.js').cleanDGM;

var mongourl = mongo.getMongoUrl();

/* Poll the power consumption website */

function convertItem(item, time) {
	// Convert item so that it can be consumed by rickshaw
	return {name: item.l/* + ' (' + item.un + ')'*/,
		data: [{
			x: time,
			y: parseInt(item.rv, 10)
		}]
};
}

function simplifyNtlmItems(items, time, desired) {
	// Simplify items to reduce bandwidth
	var chosen = [];
	
	for (var p in items) {
		var point = items[p]['$'];
		if (desired) {
			if (desired.indexOf(point.l) > -1) {
				chosen.push(convertItem(point, time));
			}
		} else {
			chosen.push(convertItem(point, time));
		}
	}
	
	return chosen;
}

function storeNtlmMeta(dgm, items) {
	// Store metadata (handle, units, etc)

	/* Connect to the DB and auth */
	MongoClient.connect(mongourl, function(err, db) {
		if(err) { return console.dir(err); }
		
		db.collection('meta_' + cleanDGM(dgm), function(err, collection) {
			
			collection.ensureIndex({h: 1, name: 1}, function() {
				
				async.each(items, function(item, callback) {
					var point = item['$'];

					/* Note the _id has been created */
					collection.findAndModify({
						h: point.h 
					}, [],
					{
						$set: {
							name: point.l,
							unit: point.un
						}
					},
					{
						upsert: true
					}, function(err, result) {
						if (err) {
							console.warn(err.message);  // returns error if no matching object found
						}

						callback(null);
					});
				}, function(err) {
					db.close();
				});
			});
		});
	});
}

function storeNtlmData(dgm, items, timestamp) {

	// Simplify items to reduce bandwidth
	var data = {
			// time is just a Date.parse()
			// but mongo can use date objects
			time: new Date(timestamp)
		};

	for (var p in items) {	
		var point = items[p]['$'];

		// skip if rv is not a number
		if (point.l.length > 0 && parseFloat(point.rv) != NaN) {
			data[point.l] = parseFloat(point.rv);
		}
	}
	
	// ensure that we have more than just the time
	if (Object.keys(data).length <= 1) {
		console.warn('No data in ' + dgm);
		return;
	}
	
	/* Connect to the DB and auth */
	MongoClient.connect(mongourl, function(err, db) {
		if(err) { return console.warn(err); }
		
		db.collection(cleanDGM(dgm), function(err, collection) {
			
			collection.ensureIndex('time', function() {
				/* Note the _id has been created */
				collection.insert(data, {
					safe : true
				}, function(err, result) {
					if (err) console.warn(err.message);

					db.close();
				});
			});
		});
	});
}

function pollNtlm(options, auth, type1_msg, io, dgm, node, desired) {

	var reqBody = "{'dgm':'" + dgm + "','id':'','node':'";
	if (node) {
		reqBody += node;
	}
	reqBody += "'}";
	
	try {
		ntlmRequest(true, options, reqBody, auth, type1_msg,
		function(resp) {
			resp.setEncoding('utf8');

			var body = '';

			resp.on('data', function (chunk) {
				body += chunk;
			});

			resp.on('end', function() {
				if (resp.statusCode == 200 && body.length > 0) {
					try {
						var obj = JSON.parse(body);
						
						if (obj && obj['d'] && obj['d'].length > 0) {
							parseString(obj['d'], function(err, result) {
								if (result.DiagramInput === undefined || err) {
									console.error('Error parsing data for: ' + dgm);
								} else {
									getLatest(dgm, function(err, latestItem) {
										if (err) {
											console.warn(err);
											return;
										}

										var lastSavedAt = result.DiagramInput['$'].savedAt;

										// retrieved times are in new york time
										// make sure to convert to milliseconds
										var lastSavedAtTimestamp = parseInt(moment.tz(lastSavedAt, 'America/New_York').format('X'), 10) * 1000;

										if (lastSavedAtTimestamp && (latestItem === undefined || lastSavedAtTimestamp > latestItem.time.getTime())) { // defensive
											// print time that the data was saved at
											console.log(dgm + ' @ ' + lastSavedAt);
											
											for (var i in result.DiagramInput.Items) {
												var item = result.DiagramInput.Items[i];
												if (item['$'].status == 'succeeded') {
													var lastItem = simplifyNtlmItems(item.Item, lastSavedAtTimestamp / 1000, desired);

													storeNtlmData(dgm, item.Item, lastSavedAtTimestamp);
													storeNtlmMeta(dgm, item.Item);

													if (io) {
														io.sockets.in(dgm).emit('update', lastItem);
													}
												}
											}
										}
										
									});
								}
							});
						} else {
							console.warn('Bad response: ' + util.inspect(obj));
						}
					} catch (err) {
						console.warn('parse error when polling: ' + dgm);
						console.warn(err.stack);
					}
				} else {
					if (resp && resp.statusCode) {
						console.warn('polling error! ' + resp.statusCode);
					} else {
						console.warn('polling error!');
					}
				}

				resp.destroy();
			});
		});
	} catch (err) {
		console.warn(err);
	}
}

/* Poll Modbus */

var modbus_interpret = require('./modbus.json');

// 'RIR' contains the "Function Code" that we are going to invoke on the remote device
var RIR = require('./modbus-stack/modbus-stack').FUNCTION_CODES.READ_HOLDING_REGISTERS;

function simplifyModbusItems(items, time, desired) {
	// Simplify items to reduce bandwidth
	var chosen = [];
	
	for (var i in items) {
		if (desired) {
			if (desired.indexOf(modbus_interpret.name[i]) > -1) {
				chosen.push(convertItem({l: modbus_interpret.name[i], rv: items[i],}, time));
			}
		} else {
			chosen.push(convertItem({l: modbus_interpret.name[i], rv: items[i],}, time));
		}
	}
	
	return chosen;
}

function storeModbusData(dgm, items, timestamp) {
	// Simplify items to reduce bandwidth
	var data = {
			// time is just a Date.parse()
			// but mongo can use date objects
			time: new Date(timestamp),
		};

	for (var i in items) {
		data[modbus_interpret.name[i]] = items[i];
	}

	// ensure that we have more than just the time
	if (Object.keys(data).length <= 1)
		return;
	
	/* Connect to the DB and auth */
	MongoClient.connect(mongourl, function(err, db) {
		if(err) { return console.dir(err); }
		
		db.collection(cleanDGM(dgm), function(err, collection) {
			
			collection.ensureIndex('time', function() {
				/* Note the _id has been created */
				collection.insert(data, {
					safe : true
				}, function(err, result) {
					if (err) {
						console.warn('error storing modbus data: ' + err.message);
					}
					db.close();
				});
			});
		});
	});
}

function storeModbusMeta(dgm, items) {
	// Store metadata (handle, units, etc)

	/* Connect to the DB and auth */
	MongoClient.connect(mongourl, function(err, db) {
		if(err) { return console.dir(err); }
		
		db.collection('meta_' + cleanDGM(dgm), function(err, collection) {
			
			collection.ensureIndex({h: 1, name: 1}, function() {

				var batch = collection.initializeUnorderedBulkOp();
				
				for (var i in items) {
					/* Note the _id has been created */

					batch.find({
						h: i,
					}).upsert().updateOne({
						$set: {
							h: i,
							name: modbus_interpret.name[i],
							unit: modbus_interpret.unit[i],
						}
					});
				}

				batch.execute(function(err, result) {
					if (err) {
						console.warn('error storing modbus metadata: ' + err.message);  // returns error if no matching object found
					}

					db.close();
				});
			});
		});
	});
}

function pollModbus(name, ip, io, desired) {
	try {
		// IP and port of the MODBUS slave, default port is 502
		var client = require('./modbus-stack/client').createClient(502, ip);
		
		// 'req' is an instance of the low-level `ModbusRequestStack` class
		var req = client.request(RIR, // Function Code: 3
								 0,    // Start at address
								 41);  // Read contiguous registers

		// 'response' is emitted after the entire contents of the response has been received.
		req.on('response', function(registers) {
			var data = [];
			
			// An Array of length 40 filled with Numbers of the current registers.
			for (var r in registers) {
				if (!isNaN(parseInt(r)) && isFinite(r)) {
					data.push(registers[r] * modbus_interpret.scale[r]);
				}
			}
			
			getLatest(name, function(err, latestItem) {
				if (err) {
					console.warn(err);
					return;
				}

				var currentTime = new Date();
				var currentTimestamp = currentTime.getTime();
				// make sure time doesn't go backwards
				if (latestItem && latestItem.time.getTime() >= currentTimestamp)
					return;
				
				// print time that the data was saved at
				console.log(name + ' @ ' + currentTime);
				
				var lastItem = simplifyModbusItems(data, currentTimestamp / 1000, desired);
				storeModbusData(name, data, currentTimestamp);
				storeModbusMeta(name, data);

				if (io) {
					io.sockets.in(name).emit('update', lastItem);
				}
			});
			
			client.end();
		});
		
		req.on('error', function(err) {
			console.warn('Error polling modbus: ' + name);
			console.warn(err);
		});
	} catch (err) {
		console.warn(err);
	}
}

module.exports.pollNtlm = pollNtlm;
module.exports.pollModbus = pollModbus;