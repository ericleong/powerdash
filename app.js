/// <reference path="typings/node/node.d.ts"/>
'use strict';

var express = require('express'),
	http = require('http'),
	fs = require('fs'),
	moment = require('moment-timezone'),
	async = require('async'),
	multipart = require('connect-multiparty'),
	scrape = require('./scrape.js'),
	mongo = require('./mongo.js'),
	api = require('./api.js'),
	cleanDGM = require('./utils.js').cleanDGM;

var app = express();
var server = http.createServer(app);
var io = require('socket.io')(server);

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

/* SERVER */

server.listen(process.env.PORT || 8080);

app.get('/', function(req, res) {
	res.render('index', {
		points: JSON.stringify([
		{
			dgm: 'x-pml:/diagrams/ud/41cooper.dgm',
			variables: ['SRV1PKW', 'SV2PKW', 'Total KW']
		},
		{
			dgm: 'cogen',
			variables: ['kW Production']
		}
		]),
		unit: 'kW',
		min: 0,
		elapsed: 2 * 60 * 60 * 1000,
		setname: 'Electricity Consumption',
		description: 'The utility electricity usage.'
	});
});

app.get('/upload', function(req, res) {
	res.render('upload', {
		setname: 'upload'
	});
});

try {
	fs.mkdirSync(__dirname + '/history');
} catch (err) {
	if (err && err.code != 'EEXIST') {
		console.error(err); // error creating directory
	}
}

var multipartMiddleware = multipart({uploadDir: __dirname + '/history' });

app.post('/upload', multipartMiddleware, function(req, res) {
	var dgm = req.body.collection;

	if (dgm === undefined || dgm.length <= 0) {
		res.render('upload', {
			setname: 'upload',
			error: 'No collection provided.'
		});
		return;
	}

	if (!req.files || !req.files.csv || req.files.csv.size == 0 || !req.files.csv.path || req.files.csv.path.length == 0) {
		res.render('upload', {
			setname: 'upload',
			error: 'No file provided.'
		});

		return;
	}

	api.upload(dgm, req.files.csv.path, function(err, results) {

		if (err) {
			res.render('upload', {
				setname: 'upload',
				error: err
			});
		} else if (results && results.errors) {
			res.render('upload', {
				setname: 'upload',
				error: results.errors.join('<br>'),
				file: req.files.csv.name,
				dgm: dgm
			});
		} else if (results && results.lines) {
			res.render('upload', {
				setname: 'upload',
				file: req.files.csv.name,
				dgm: dgm,
				lines: results.lines
			});
		}
	});
});

app.get('/water', function(req, res) {
	var dgm = 'x-pml:/diagrams/ud/41cooper/greywater.dgm';
	var variable = 'ART9 Result 1';
	var variables = [variable];

	api.getLatest(dgm, function(err, results) {
		if (err) {
			res.render(500, err);
		} else {
			res.render('save', {
				dgm: dgm,
				setname: 'Water Saved',
				variables: variables,
				latest: results[variable]
			});
		}
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
		message: 'This page is under construction.',
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
		
		res.attachment(moment().format('YYYY-MM-DD-HH-mm-ss') + '.csv');
		
		api.generateCSV(dgm.split(','), variables, 
			function(dgm, variables, method, callback, res) {
				api.getRecent(dgm, elapsed, variables, method, callback, res);
			},
			res,
			function(err, data) {
				if (err) {
					res.status(500).send(err);
				} else if (data) {
					res.send(data);
				} else {
					res.end();
				}
			}
		);
	} else {
		api.getRecent(dgm, elapsed, variables, api.toRickshaw, function(err, list) {
			if (err) {
				res.status(500).send(err);
			} else {
				res.json(list);
			}
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
		res.status(400).send('Need start time!');
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
		res.status(400).send('Need valid range!');
		return;
	}

	if (req.query['format'] == 'csv') {
		var formatString = 'YYYY-MM-DD-HH-mm-ss';
		
		res.attachment(moment(range.start).format(formatString) + '_' + moment(range.end).format(formatString) + '.csv');

		api.generateCSV(dgm.split(','), variables, 
			function(dgm, variables, method, callback, res) {
				api.getRange(dgm, range.start, range.end, variables, method, callback, res);
			}, 
			res, function(err, data) {
				if (err) {
					res.status(500).send(err);
				} else if (data) {
					res.send(data);
				} else {
					res.end();
				}
			}
		);
	} else {
		api.getRange(dgm, range.start, range.end, variables, api.toRickshaw, function(err, list) {
			if (err) {
				res.status(500).send(err);
			} else {
				res.json(list);
			}
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
		variables, api.diff, function(err, data) {
			if (err) {
				res.status(500).send(err);
			} else {
				res.json(data);
			}
		});
});

/* SOCKET CONNECTION */

io.sockets.on('connection', function(socket) {

	socket.on('load', function(query) {
		query.dgm = query.dgm ? query.dgm : 'x-pml:/diagrams/ud/41cooper.dgm';
		
		var respond = function(err, list) {
			if (list && list.length > 0) {
				socket.emit('dataset', list);
			} else {
				console.warn('could not load data for ' + query.dgm + ' @ ' + query.elapsed + ' & ' + query.variables);
				if (err) {
					console.warn(err);
				}
			}
		};
		  
		if (query.elapsed) {
			api.getRecent(query.dgm, query.elapsed, 
				query.variables, api.toRickshaw, respond);
		} else if (query.start && query.end) {
			api.getRange(query.dgm, new Date(parseInt(query.start, 10)), new Date(parseInt(query.end, 10)), 
				query.variables, api.toRickshaw, respond);
		}
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

if (auth && scrapeList && scrapeList.length) {
	for (var i = 0; i < scrapeList.length; i++) {
		if (scrapeList[i].type == 'ntlm') {
			setInterval(scrape.pollNtlm, scrapeList[i].delay * 1000, auth.ntlm.request, auth.ntlm.auth, auth.ntlm.type1_msg, io, scrapeList[i].dgm, scrapeList[i].node, scrapeList[i].desired);
		} else if (scrapeList[i].type == 'modbus') {
			setInterval(scrape.pollModbus, scrapeList[i].delay * 1000, auth.modbus.name, auth.modbus.ip, io);
		}
	}
} else {
	console.error('Could not find auth.json or AUTH environment variable.');
}