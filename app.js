'use strict';

var express = require('express'),
	http = require('http'),
	sio = require('socket.io'),
	fs = require('fs'),
	moment = require('moment-timezone'),
	async = require('async'),
	readline = require('readline'),
	MongoClient = require('mongodb').MongoClient,
	scrape = require('./scrape.js'),
	mongo = require('./mongo.js'),
	api = require('./api.js'),
	cleanDGM = require('./utils.js').cleanDGM;

var app = express();
var server = http.createServer(app);

/* APP */
var host = 'localhost:8080';

if (app.get('env') == 'production') {
	if (process.env.DOMAIN) {
		host = process.env.DOMAIN;
	}
}

app.use(express.static(__dirname + '/public'));

app.set('views', __dirname + '/templates');
app.set('view engine', 'jade');

// history uploading
app.use(express.bodyParser({ keepExtensions: true, uploadDir: __dirname + '/history' }));

/* SERVER */
process.on('uncaughtException', function (err) {
	console.error('Uncaught exception: ' + err.message);
	console.error(err.stack);
});

server.listen(process.env.PORT || 8080);
var io = sio.listen(server);

/* SOCKET IO */

io.configure('production', function() {
	io.enable('browser client minification');  // send minified client
	io.enable('browser client etag');          // apply etag caching logic based on version number
	io.enable('browser client gzip');          // gzip the file
	io.set('log level', 1);                    // reduce logging
	
	io.set('transports', ['websocket', 'xhr-polling']);
});

io.configure('development', function() {
	io.set('transports', ['websocket']);
});

app.get('/', function(req, res) {
	res.render('index', {
		points: JSON.stringify([
		{
			dgm: 'x-pml:/diagrams/ud/41cooper.dgm',
			variables: ['SRV1PKW', 'SV2PKW', 'Total KW']
		},
		// {
		// 	dgm: 'cogen',
		// 	variables: ['kW Production']
		// }
		]),
		unit: 'kW',
		min: 0,
		elapsed: 2 * 60 * 60 * 1000,
		setname: 'Electricity Consumption',
		description: 'The utility electricity usage.',
		message: ''
	});
});

app.get('/upload', function(req, res) {
	res.render('upload');
});

app.post('/upload', function(req, res) {
	var dgm = req.body.collection;

	if (dgm === undefined || dgm.length <= 0) {
		res.render('upload', {error: 'No collection provided.'});
		return;
	}

	console.log('Reading data into ' + dgm);

	/* Connect to the DB and auth */
	MongoClient.connect(mongo.getMongoUrl(), function(err, db) {

		if (err) {
			res.render('upload', {error: err});
			return console.dir(err);
		}

		db.collection(cleanDGM(dgm), function(err, collection) {

			if (err) {
				if (err.message) {
					console.log(err.message);
				} else {
					console.log('error getting collection ' + dgm);
				}
				return;
			}

			var close = false;
			var count = 0;

			var rd = readline.createInterface({
				input: fs.createReadStream(req.files.csv.path, {
					encoding: 'ascii'
				}),
				output: process.stdout,
				terminal: false
			});

			var header = [];

			rd.on('close', function() {
				close = true;

				res.render('upload', {
					file: req.files.csv.name,
					dgm: dgm
				});
			});

			rd.on('line', function(line) {
				if (header.length == 0) {
					// assume first row is header
					header = line.split(',');
				} else {
					var row = line.split(',');

					if (row === undefined || row.length <= 0) {
						console.log('No data on this line!');
						return;
					}

					// assume first column is time
					var time = moment.tz(row[0], 'America/New_York').toDate();

					var data = {};

					for (var i in header) {
						if (i > 0) {
							var val = parseInt(row[i], 10);

							if (!isNaN(val)) {
								data[header[i]] = val;
							} else {
								data[header[i]] = row[i];
							}
						}
					}

					if (Object.keys(data).length == 0) {
						console.log('No data found in: ' + line);
					}

					// keep track of how many lines we've gone through
					count++;

					collection.update({time: time}, 
						{
							$set: data
						},
						{
							safe: true,
							upsert: true
						},
						function(err, result) {
							count--;

							if (err) {
								if (err.message) {
									console.log(err.message);
								} else {
									console.log('error saving data @ ' + row[0]);
								}
							}

							if (close && count == 0) {
								db.close();
							}
						}
					);
				}
			});
		});
	});
});

app.get('/water', function(req, res) {
	res.render('index', {
		points: JSON.stringify([
		{
			dgm: 'x-pml:/diagrams/ud/41cooper/greywater.dgm',
			variables: ['ART9 Result 1']
		}
		]),
		min: 'auto',
		elapsed: 2 * 60 * 60 * 1000,
		setname: 'Rainwater Collection',
		description: 'Water saved since Fall 2009.',
		unit: 'gl'
	});
});

app.get('/watersaved', function(req, res) {
	var dgm = 'x-pml:/diagrams/ud/41cooper/greywater.dgm';
	var variable = 'ART9 Result 1';
	var variables = [variable];
	var elapsed = 24 * 60 * 60 * 1000;

	async.parallel({
		latest: function(callback) {
			api.getLatest(dgm, function(data) {
				callback(null, data);
			});
		},
		amount: function(callback) {
			api.getRecent(dgm, elapsed, variables, api.diff, function(data) {
				callback(null, data);
			});
		}
	}, function(err, results) {
		res.render('save', {
			dgm: dgm,
			variables: variables,
			elapsed: elapsed,
			setname: 'Water Saved',
			amount: results.amount[variable],
			latest: results.latest[variable]
		});
	});
});

app.get('/gas', function(req, res) {
	res.render('index', {
		points: JSON.stringify([
		{
			dgm: 'x-pml:/diagrams/ud/41cooper.dgm',
			variables: ['SRV1GS_CCF', 'SRV2GS_CCF']
		}
		]),
		unit: 'CCF',
		min: 'auto',
		elapsed: 2 * 60 * 60 * 1000,
		setname: 'Gas Consumption',
		description: 'The utility gas usage.',
		message: ''
	});
});

app.get('/breakdown', function(req, res) {
	res.render('index', {
		points: JSON.stringify([
		{	
			dgm: 'x-pml:/diagrams/ud/41cooper.dgm',
			variables: ['Total KW']
		},
		// retail
		{dgm: 'x-pml:/diagrams/ud/41cooper/41 rt.dgm'},
		// 3rd floor lighting and plugs
		{dgm: 'x-pml:/diagrams/ud/41cooper/413tl.dgm'},
		// 4th floor lighting and plugs
		{dgm: 'x-pml:/diagrams/ud/41cooper/414tl.dgm'},
		// 6th floor lighting and plugs
		{dgm: 'x-pml:/diagrams/ud/41cooper/416fltl.dgm'},
		// 7th floor lighting and plugs
		{dgm: 'x-pml:/diagrams/ud/41cooper/417fltl.dgm'},
		// roof mechanical
		{dgm: 'x-pml:/diagrams/ud/41cooper/41 rdhm.dgm'},
		// sub-cellar power and lighting
		{dgm: 'x-pml:/diagrams/ud/41cooper/41 5-dh.dgm'},
		// cellar power and lighting
		{dgm: 'x-pml:/diagrams/ud/41cooper/41 cdh.dgm'},
		// 4th floor mechanical 2nd,3rd,5th lighting and plugs
		{dgm: 'x-pml:/diagrams/ud/41cooper/41 4-dh.dgm'},
		// 7th floor mechanical, 8th and 9th lighting and plugs
		{dgm: 'x-pml:/diagrams/ud/41cooper/41 7-dh.dgm'},
		// elevators
		{dgm: 'x-pml:/diagrams/ud/41cooper/41elevator.dgm'}
		]),
		unit: 'kW',
		min: 'auto',
		elapsed: 2 * 60 * 60 * 1000,
		setname: 'Electricity Consumption Breakdown',
		description: 'Usage broken down by location.',
		message: 'Negative Roof & Mechanical is due to cogeneration.',
		all: false,
		disable: JSON.stringify(['Total KW', ])
	});
});

app.get('/js/settings.js', function(req, res) {
	res.type('application/javascript');
	res.send('var host = "//' + host + '";');
});

app.get('/recent', function(req, res) {
	var elapsed = req.query['elapsed'] ? req.query['elapsed'] : 60*60*1000;

	var variables;
	if (req.query['variables']) {
		if (req.query['variables'] == 'all') {
			variables = 'all';
		} else {
			variables = req.query['variables'].split(',');
		}
	}

	var dgm = req.query['dgm'] ? req.query['dgm'] : 'x-pml:/diagrams/ud/41cooper.dgm';

	if (req.query['format'] == 'csv') {
		api.generateCSV(dgm.split(','), variables, 
			function(dgm, variables, method, callback) {
				api.getRecent(dgm, elapsed, variables, method, function(data) {
					callback(null, data);
				});
			}, 
			function(err, data) {
				if (err) {
					res.send(500, err);
				} else {
					res.attachment(moment().format('YYYY-MM-DD-HH-mm-ss') + '.csv');
					res.send(data);
				}
			}
		);
	} else {
		api.getRecent(dgm, elapsed, variables, api.toRickshaw, function(list) {
			res.json(list);
		});
	}
});

var getDateRange = function(req) {
	var start;
	if (parseInt(req.query['start'], 10) != NaN) {
		start = new Date(parseInt(req.query['start'], 10));
	} else {
		start = new Date(req.query['start']);
	}

	var end;
	if (req.query['end']) {
		if (parseInt(req.query['end'], 10) != NaN) {
			end = new Date(parseInt(req.query['end'], 10));
		} else {
			end = new Date(req.query['end']);
		}
	} else {
		end = new Date();
	}

	return {start: start, end: end};
};

app.get('/range', function(req, res) {
	if (!req.query['start']) {
		res.send(400, 'Need start time!');
		return;
	}

	var variables = undefined;
	if (req.query['variables']) {
		if (req.query['variables'] == 'all') {
			variables = 'all';
		} else {
			variables = req.query['variables'].split(',');
		}
	}

	var dgm = req.query['dgm'] ? req.query['dgm'] : 'x-pml:/diagrams/ud/41cooper.dgm';
	
	var range = getDateRange(req);

	if (range.start >= range.end) {
		res.send(400, 'Need valid range!');
		return;
	}

	if (req.query['format'] == 'csv') {
		var formatString = 'YYYY-MM-DD-HH-mm-ss';

		api.generateCSV(dgm.split(','), variables, 
			function(dgm, variables, method, callback) {
				api.getRange(dgm, range.start, range.end, variables, method, function(data) {
					callback(null, data);
				});
			}, function(err, data) {
				if (err) {
					res.send(500, err);
				} else {
					res.attachment(moment(range.start).format(formatString) + '_' + moment(range.end).format(formatString) + '.csv');
					res.send(data);
				}
			}
		);
	} else {
		api.getRange(dgm, range.start, range.end, variables, api.toRickshaw, function(list) {
			res.json(list);
		});
	}
});

app.get('/recent/diff', function(req, res) {
	var elapsed = req.query['elapsed'] ? req.query['elapsed'] : 24*60*60*1000;

	var variables = 'all';
	if (req.query['variables']) {
		if (req.query['variables'] != 'all') {
			variables = req.query['variables'].split(',');
		}
	}

	var dgm = req.query['dgm'] ? req.query['dgm'] : 'x-pml:/diagrams/ud/41cooper/greywater.dgm'; 
	
	api.getRecent(dgm, elapsed,
		variables, api.diff, function(data) {
			res.json(data);
		});
});

/* SOCKET CONNECTION */

io.sockets.on('connection', function(socket) {

	socket.on('load', function(query) {
		query.dgm = query.dgm ? query.dgm : 'x-pml:/diagrams/ud/41cooper.dgm';  
		api.getRecent(query.dgm, query.elapsed, 
			query.variables, api.toRickshaw, function(list) {
				if (list && list.length > 0) {
					socket.emit('dataset', list);
				} else {
					console.warn('could not load data for ' + query.dgm + ' @ ' + query.elapsed + ' & ' + query.variables);
				}
			});
	});

	socket.on('update', function(dgm) {
		dgm = dgm ? dgm : 'x-pml:/diagrams/ud/41cooper.dgm';
		socket.join(dgm);
	});

	socket.on('pause', function(dgm) {
		dgm = dgm ? dgm : 'x-pml:/diagrams/ud/41cooper.dgm';
		socket.leave(dgm);
	});
});

var auth;
if (app.get('env') == 'production' && process.env.AUTH) {
	auth = JSON.parse(process.env.AUTH);
} else {
	auth = require('./auth.json');
}

var scrapeList = require('./scrape.json');

if (auth) {
	for (var i = 0; i < 1; i++) {
		if (scrapeList[i].type == 'ntlm') {
			setInterval(scrape.pollNtlm, scrapeList[i].delay * 1000, auth.ntlm.request, auth.ntlm.auth, auth.ntlm.type1_msg, io, scrapeList[i].dgm, scrapeList[i].node, scrapeList[i].desired);
		} else if (scrapeList[i].type == 'modbus') {
			setInterval(scrape.pollModbus, scrapeList[i].delay * 1000, auth.modbus.name, auth.modbus.ip, io);
		}
	}
} else {
	console.error('Could not find auth.json or AUTH environment variable.')
}