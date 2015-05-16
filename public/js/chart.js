/* global min */
/* global disable */
/* global unit */
/* global points */
/* global elapsed */
/* global host */
/* global io */
/* global moment */
/* global Rickshaw */
/// <reference path="../../typings/d3/d3.d.ts"/>
/// <reference path="../../typings/jquery/jquery.d.ts"/>
'use strict';

var socket = io.connect(host);

var graph;
var series;
var palette = new Rickshaw.Color.Palette();

/* UI */

$('#offset-form input[type=radio]').change(function() {
	if ($(this).val() == 'two-hours') {
		$('#pause').prop('disabled', false);
		setElapsed(2*60*60*1000);
		loadPoints();
	} else if ($(this).val() == 'six-hours') {
		$('#pause').prop('disabled', false);
		setElapsed(6*60*60*1000);
		loadPoints();
	} else if ($(this).val() == 'twentyfour-hours') {
		setElapsed(24*60*60*1000);
		setPaused(true);
		loadPoints();
		$('#pause').prop('disabled', true);
	} else if ($(this).val() == 'two-weeks') {
		setElapsed(2*7*24*60*60*1000);
		setPaused(true);
		loadPoints();
		$('#pause').prop('disabled', true);
	} else if ($(this).val() == 'two-months') {
		setElapsed(2*4*7*24*60*60*1000); // 2x28 days
		setPaused(true);
		loadPoints();
		$('#pause').prop('disabled', true);
	} else if ($(this).val() == 'one-year') {
		setElapsed(365*24*60*60*1000); // 365 days
		setPaused(true);
		loadPoints();
		$('#pause').prop('disabled', true);
	}
});

function setPaused(paused) {
	if (paused) {
		$('#pause').val('resume');
		$('#pause').data('paused', true);

		emitStream('pause');
	} else {
		$('#pause').val('pause');
		$('#pause').data('paused', false);

		loadPoints();
	}
}

function setElapsed(duration) {
	elapsed = duration;
	for (var i in points) {
		points[i].elapsed = duration;
	}
}

function emitStream(command) {
	for (var i in points) {
		socket.emit(command, points[i].dgm);
	}	
}

$('#pause').click(function() {
	if ($('#pause').data('paused') == true) {
		setPaused(false);
	} else {
		setPaused(true);
	}
});

$('#download').click(function() {
	var disabled = [];
	
	if (graph && graph.series) {
		graph.series.forEach(function(s) { 
			if (s.disabled && s.id) {
				disabled.push(s.id);
			}
		});
	}

	var dgms = '';
	var variablesList = [];
	var all = false;

	if (points) {
		points.forEach(function(point) {
			var includeDgm = false;
			
			if (point.variables && point.variables.length > 0) {
				point.variables.forEach(function(variable) {
					if (disabled.indexOf(variable) < 0) {
						variablesList.push(variable);
						includeDgm = true;
					}
				});
			} else {
				all = true;
				includeDgm = true;
			}
			
			if (includeDgm) {
				if (dgms.length > 0) {
					dgms += ',';
				}
				
				dgms += encodeURIComponent(point.dgm);
			}
		});
	}
	
	var variables;
	
	if (all || variablesList.length == 0) {
		variables = 'variables=all&';
	} else {
		variables = '';
		
		variablesList.forEach(function(variable) {
			if (variables.length > 0) {
				variables += ',';
			}
			
			variables += encodeURIComponent(variable);
		});
		
		variables = 'variables=' + variables + '&';
	}

	if (!$('#pause').data('paused')) {

		window.location.href = '/recent?format=csv&' + variables + 'dgm=' + dgms + '&elapsed=' + elapsed;
	} else if (series.length > 0) {
		
		var start;
		series.forEach(function(s) {
			var x = s.data[0].x * 1000;
			if (start == null || x < start) {
				start = x;
			}
		});
		
		var end;
		series.forEach(function(s) {
			var x = s.data[s.data.length-1].x * 1000;
			if (end == null || x > end) {
				end = x;
			}
		});

		window.location.href = '/range?format=csv&' + variables + 'dgm=' + dgms + '&start=' + start + '&end=' + end;
	}
});

$(window).resize(function() {
	if (graph) {
		graph.configure(graphSize()); 
	}
});

function loadPoints() {
	$('#chart').addClass('loading');

	for (var p in points) {
		loadSeries(points[p].dgm, points[p].variables);
	}
}

function loadSeries(dgm, variables) {
	socket.emit('load', {
		dgm: dgm,
		variables: variables,
		elapsed: elapsed
	});
	if (!$('#pause').data('paused')) {
		socket.emit('update', dgm);
	}
}

function graphSize() {
	var width;

	if ($(window).width() < 1200 && $(window).width() > 800) {

		width = $('#chart-container').width() - $('#y-axis').width() - $('#side').width() - 24;
		
	} else {
		width = $('#chart-container').width() - $('#y-axis').width() - 24;

		if (width > 1024) {
			width = 1024;
		}
	}

	var height = width / 1.75;
	
	return {width: width, height: height};
}

var prepareSeries = function(s) {
	// assumes series has a name

	s.color = palette.color();
	s.display = $('<div/>').addClass('display');
	$('<div/>').addClass('name').text(s.name).appendTo(s.display);
	s.value = $('<div/>').addClass('value').appendTo(s.display);

	if (s.unit) {
		s.value.text(s.data[s.data.length - 1].y + ' ' + s.unit);
	} else if (unit) {
		s.value.text(s.data[s.data.length - 1].y + ' ' + unit);
	} else {
		s.value.text(s.data[s.data.length - 1].y);
	}

	return s;
};

var buildLegend = function() {
	$('#legend').empty();

	var legend = new Rickshaw.Graph.Legend({
		element : document.getElementById('legend'),
		graph : graph
	});

	new Rickshaw.Graph.Behavior.Series.Toggle({
		graph : graph,
		legend : legend
	});
};

var checkEnabled = function() {
	if (disable) {
		for (var i in series) {
			if (disable.length && disable.indexOf(series[i].id) > -1) {
				series[i].disable();
			} else if (disable == series[i].id) {
				series[i].disable();
			}
		}
	}
};

/* GRAPH */
function createGraph(dataset) {
	series = dataset;

	series.sort(function(a, b) {
		return b.name.localeCompare(a.name);
	});

	var date;

	for (var i in series) {
		prepareSeries(series[i]);

		var d = new Date(series[i].data[series[i].data.length - 1].x * 1000);
		if (date === undefined || d > date) {
			date = d;
		}

		$('#current-data').prepend(series[i].display);
	}

	if (date) {
		$('#last-date').text(moment(date).format('l'));
		$('#last-time').text(moment(date).format('hh:mm:ss a'));
	}
	
	var size = graphSize();
	
	// instantiate our graph!
	graph = new Rickshaw.Graph({
		element : document.getElementById('chart'),
		width : size.width,
		height : size.height,
		renderer : 'line',
		interpolation : 'linear',
		min: min ? 'auto': min,
		series : series
	});

	graph.render();

	new Rickshaw.Graph.HoverDetail({
		graph: graph,
		xFormatter: function(x) {
			var d = moment(x * 1000);
			return d.format('MMM DD hh:mm:ss a');
		},
		yFormatter: function(y) {
			if (y % 1 === 0) {
				return y;
			}
			return y.toFixed(2);
		},
		formatter: function(series, x, y, formattedX, formattedY, d) {
			var top;

			if (series.unit) {
				top = series.name + ':&nbsp;' + formattedY + '&nbsp;' + series.unit;
			} else if (unit) {
				top = series.name + ':&nbsp;' + formattedY + '&nbsp;' + unit;
			} else {
				top = series.name + ':&nbsp;' + formattedY;
			}

			return top + '</br>' + formattedX;
		},
	});

	var timeFixture = new Rickshaw.Fixtures.Time();
	timeFixture.formatTime = function(d) {
		return moment(d).format('ddd hh:mm a');
	};
	timeFixture.units = [
		{
			name: 'decade',
			seconds: 86400 * 365.25 * 10,
			formatter: function(d) { return (Math.floor(d.getUTCFullYear() / 10) * 10); }
		}, {
			name: 'year',
			seconds: 86400 * 365.25,
			formatter: function(d) { return d.getUTCFullYear(); }
		}, {
			name: 'month',
			seconds: 86400 * 30.5,
			formatter: function(d) { return timeFixture.months[d.getUTCMonth()]; }
		}, {
			name: 'week',
			seconds: 86400 * 7,
			formatter: function(d) { return timeFixture.formatDate(d); }
		}, {
			name: 'day',
			seconds: 86400,
			formatter: function(d) { return moment(d).format('ddd M/D');}
		}, {
			name: '6 hour',
			seconds: 3600 * 6,
			formatter: function(d) { return timeFixture.formatTime(d); }
		}, {
			name: 'hour',
			seconds: 3600,
			formatter: function(d) { return timeFixture.formatTime(d); }
		}, {
			name: '15 minute',
			seconds: 60 * 15,
			formatter: function(d) { return timeFixture.formatTime(d); }
		}, {
			name: 'minute',
			seconds: 60,
			formatter: function(d) { return d3.time.format('%I:%M %p')(d); }
		}, {
			name: '15 second',
			seconds: 15,
			formatter: function(d) { return d3.time.format('%I:%M:%S %p')(d); }
		}, {
			name: 'second',
			seconds: 1,
			formatter: function(d) { return d.getUTCSeconds() + 's'; }
		}, {
			name: 'decisecond',
			seconds: 1/10,
			formatter: function(d) { return d.getUTCMilliseconds() + 'ms'; }
		}, {
			name: 'centisecond',
			seconds: 1/100,
			formatter: function(d) { return d.getUTCMilliseconds() + 'ms'; }
		}
	];

	var x_axis = new Rickshaw.Graph.Axis.Time({
		graph : graph,
		timeFixture: timeFixture
	});
	x_axis.render();

	var y_axis = new Rickshaw.Graph.Axis.Y({
		graph : graph,
		orientation : 'left',
		tickFormat : function(y) {
			if (unit) {
				return Rickshaw.Fixtures.Number.formatKMBT(y) + ' ' + unit;
			} else {
				return Rickshaw.Fixtures.Number.formatKMBT(y);
			}
		},
		element : document.getElementById('y-axis'),
	});
	y_axis.render();

	buildLegend();
	checkEnabled();
}

/* SOCKET */

socket.on('connect', function() {
	if (points) {
		loadPoints();
	}
});

socket.on('update', function(dataset) {
	if (graph && dataset) {

		// latest date
		var date = undefined;

		for (var i in dataset) {
			for (var j in series) {
				if (series[j] && series[j].id == dataset[i].name) {
					series[j].data = series[j].data.concat(dataset[i].data); // append new data

					if (series[j].unit) {
						series[j].value.text(series[j].data[series[j].data.length - 1].y + ' ' + series[j].unit); // display number
					} else if (unit) {
						series[j].value.text(series[j].data[series[j].data.length - 1].y + ' ' + unit); // display default unit
					} else {
						series[j].value.text(series[j].data[series[j].data.length - 1].y);
					}

					var d = new Date(series[j].data[series[j].data.length - 1].x * 1000);
					if (date === undefined || d > date) {
						date = d;
					}

					// remove data if we have more data than the amount of time elapsed
					if (series[j].data[series[j].data.length-1].x - series[j].data[0].x > elapsed) {
						series[j].data.splice(0, dataset[i].data.length);
					}

					break;
				}
			}
		}
		
		$('#last-date').text(moment(date).format('l'));
		$('#last-time').text(moment(date).format('hh:mm:ss a'));
		
		graph.update();
	} else {
		createGraph(dataset);
	}
});

var seriesSort = function(a, b) {
	return b.name.localeCompare(a.name);
};

socket.on('dataset', function(dataset) {
	if (graph === undefined) {
		$('#chart').removeClass('loading');

		createGraph(dataset);
	} else if (dataset) {
		for (var i in dataset) {
			var added = false;

			for (var j in series) {
				if (series[j].name == dataset[i].name) {
					series[j].data = dataset[i].data;
					added = true;
				}
			}

			if (!added) {
				series.push(prepareSeries(dataset[i]));

				series.sort(seriesSort);

				$('#current-data').empty();
				for (var i in series) {
					$('#current-data').prepend(series[i].display);
				}

				buildLegend();
				checkEnabled();
			}
		}

		// disable out of range series
		var latest = -1;

		for (var i in series) {
			if (series[i].data && series[i].data.length > 0) {
				var time = series[i].data[series[i].data.length - 1].x;

				if (time > latest) {
					latest = time;
				}
			}
		}

		if (latest > 0) {
			var earliest = latest * 1000 - elapsed;

			for (var i in series) {
				if (series[i].data && series[i].data.length > 0) {
					var lastTime = series[i].data[series[i].data.length - 1].x;

					// disable series if we have old data
					if (earliest > lastTime * 1000) {
						series[i].disable();
					}
				}
			}
		}

		// loading done?
		for (var i in dataset) {
			for (var j in series) {
				if (!series[j].disabled && series[j].name == dataset[i].name) {
					$('#chart').removeClass('loading');
					break;
				}
			}

			if (!$('#chart').hasClass('loading')) {
				break;
			}
		}

		graph.update();

		if (series.length != dataset.length) {
			buildLegend();
		}
	}
});