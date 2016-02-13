/* global io */
/* global moment */
/* global Rickshaw */
/// <reference path="../../typings/d3/d3.d.ts"/>
/// <reference path="../../typings/jquery/jquery.d.ts"/>
'use strict';

var dashChart = function(host, points, elapsed, disable, unit, min) {
	this.socket = io.connect(host);
	this.palette = new Rickshaw.Color.Palette();
	this.points = points;
	this.elapsed = elapsed;
	this.disable = disable;
	this.unit = unit;
	this.min = min;
	
	/* SOCKET */
	
	var chart = this;

	this.socket.on('connect', function() {
		if (points) {
			chart.loadPoints();
		}
	});
	
	this.socket.on('update', function(dataset) {
		if (chart.graph && dataset) {
	
			// latest date
			var date = undefined;
	
			for (var i in dataset) {
				for (var j in chart.series) {
					if (chart.series[j] && chart.series[j].id == dataset[i].name) {
						chart.series[j].data = chart.series[j].data.concat(dataset[i].data); // append new data
	
						if (chart.series[j].unit) {
							chart.series[j].value.text(chart.series[j].data[chart.series[j].data.length - 1].y + ' ' + chart.series[j].unit); // display number
						} else if (unit) {
							chart.series[j].value.text(chart.series[j].data[chart.series[j].data.length - 1].y + ' ' + unit); // display default unit
						} else {
							chart.series[j].value.text(chart.series[j].data[chart.series[j].data.length - 1].y);
						}
	
						var d = new Date(chart.series[j].data[chart.series[j].data.length - 1].x * 1000);
						if (date === undefined || d > date) {
							date = d;
						}
	
						// remove data if we have more data than the amount of time elapsed
						if (chart.series[j].data[chart.series[j].data.length-1].x - chart.series[j].data[0].x > elapsed) {
							chart.series[j].data.splice(0, dataset[i].data.length);
						}
	
						break;
					}
				}
			}
			
			$('#last-date').text(moment(date).format('l'));
			$('#last-time').text(moment(date).format('hh:mm:ss a'));
			
			chart.graph.update();
		} else {
			chart.createGraph(dataset);
		}
	});
	
	var seriesSort = function(a, b) {
		return b.name.localeCompare(a.name);
	};
	
	this.socket.on('dataset', function(dataset) {
		if (chart.graph === undefined) {
			$('#chart').removeClass('loading');
	
			chart.createGraph(dataset);
		} else if (dataset) {
			for (var i in dataset) {
				var added = false;
	
				// Check to see if we have added this series
				for (var j in chart.series) {
					if (chart.series[j].name == dataset[i].name) {
						chart.series[j].data = dataset[i].data;
						if (dataset[i].unit) { // update the unit
							chart.series[j].unit = dataset[i].unit;
						}
						added = true;
					}
				}
	
				if (!added) {
					chart.series.push(chart.prepareSeries(dataset[i], true));
	
					chart.series.sort(seriesSort);
	
					$('#current-data').empty();
					for (var i in chart.series) {
						$('#current-data').prepend(chart.series[i].display);
					}
	
					chart.createLegend();
					chart.disableSeries(disable);
				}
			}
			
			if (chart.renderer == 'bar') {
				Rickshaw.Series.fill(chart.series, 0);
			}
	
			// disable out of range series
			var latest = -1;

			// find the latest timestamp
			for (var i in chart.series) {
				if (chart.series[i].data && chart.series[i].data.length > 0) {
					var time = chart.series[i].data[chart.series[i].data.length - 1].x;
	
					if (time > latest) {
						latest = time;
					}
				}
			}
	
			if (latest > 0) {
				var earliest = latest * 1000 - elapsed;
	
				for (var i in chart.series) {
					if (chart.series[i].data && chart.series[i].data.length > 0) {
						var lastTime = chart.series[i].data[chart.series[i].data.length - 1].x;
	
						// disable series if we have old data
						if (earliest > lastTime * 1000) {
							chart.series[i].disable();
						}
						
						// disable last update if older than 5 minutes
						if (latest - 5*60 >= lastTime) {
							chart.series[i].value.text('N/A');
						}
					}
				}
			}
	
			// loading done?
			for (var i in dataset) {
				for (var j in chart.series) {
					if (!chart.series[j].disabled && chart.series[j].name == dataset[i].name) {
						$('#chart').removeClass('loading');
						break;
					}
				}
	
				if (!$('#chart').hasClass('loading')) {
					break;
				}
			}
	
			chart.graph.update();
	
			if (chart.series.length != dataset.length) {
				chart.createLegend();
			}
		}
	});
	
	/* UI */

	$('#offset-form input[type=radio]').change(function() {
		if ($(this).val() == 'two-hours') {
			$('#pause').prop('disabled', false);
			chart.setElapsed(2*60*60*1000);
			chart.setRenderer('line');
			chart.loadPoints();
		} else if ($(this).val() == 'six-hours') {
			$('#pause').prop('disabled', false);
			chart.setElapsed(6*60*60*1000);
			chart.setRenderer('line');
			chart.loadPoints();
		} else if ($(this).val() == 'twentyfour-hours') {
			chart.setElapsed(24*60*60*1000);
			chart.setPaused(true);
			chart.setRenderer('line');
			chart.loadPoints();
			$('#pause').prop('disabled', true);
		} else if ($(this).val() == 'two-weeks') {
			chart.setElapsed(2*7*24*60*60*1000);
			chart.setPaused(true);
			chart.setRenderer('line');
			chart.loadPoints();
			$('#pause').prop('disabled', true);
		} else if ($(this).val() == 'two-months') {
			chart.setElapsed(2*4*7*24*60*60*1000); // 2x28 days
			chart.setPaused(true);
			chart.setRenderer('bar');
			chart.loadPoints();
			$('#pause').prop('disabled', true);
		} else if ($(this).val() == 'one-year') {
			chart.setElapsed(365*24*60*60*1000); // 365 days
			chart.setPaused(true);
			chart.setRenderer('bar');
			chart.loadPoints();
			$('#pause').prop('disabled', true);
		}
	});
	
	$('#pause').click(function() {
		if ($('#pause').data('paused') == true) {
			chart.setPaused(false);
		} else {
			chart.setPaused(true);
		}
	});
	
	$('#download').click(function() {
		window.location.href = chart.createDownloadUrl();
	});
};

dashChart.prototype.setElapsed = function(duration) {
	this.elapsed = duration;
	for (var i in this.points) {
		this.points[i].elapsed = duration;
	}
};

dashChart.prototype.emitStream = function(command) {
	for (var i in this.points) {
		this.socket.emit(command, this.points[i].dgm);
	}
};

dashChart.prototype.prepareSeries = function(s, valid) {
	// assumes series has a name

	s.color = this.palette.color();
	s.display = $('<div/>').addClass('display');
	$('<div/>').addClass('name').text(s.name).appendTo(s.display);
	s.value = $('<div/>').addClass('value').appendTo(s.display);

	if (valid) {
		if (s.unit) {
			s.value.text(s.data[s.data.length - 1].y + ' ' + s.unit);
		} else if (this.unit) {
			s.value.text(s.data[s.data.length - 1].y + ' ' + this.unit);
		} else {
			s.value.text(s.data[s.data.length - 1].y);
		}
	} else {
		s.value.text('N/A');
	}

	return s;
};

dashChart.prototype.loadPoints = function() {
	$('#chart').addClass('loading');
	
	if (this.series) {
		this.series.forEach(function(s) {
			if (s.data) {
				s.data = [s.data[s.data.length - 1]];
			}
		});
	}

	for (var p in this.points) {
		this.loadSeries(this.points[p].dgm, this.points[p].variables);
	}
};

dashChart.prototype.loadSeries = function(dgm, variables) {
	if ($('#pause').data('paused')) {
		var now = +(new Date());

		this.socket.emit('load', {
			dgm: dgm,
			variables: variables,
			start: now - this.elapsed,
			end: now
		});
	} else {
		this.socket.emit('load', {
			dgm: dgm,
			variables: variables,
			elapsed: this.elapsed
		});
		
		this.socket.emit('update', dgm);
	}
};

dashChart.prototype.setRenderer = function(renderer) {
	if (renderer == 'bar') {
		// Disable a series if it represents the sum of other series
		for (var p in this.points) {
			if (this.points[p].sum) {
				this.disableSeries(this.points[p].sum);
			}
		}
		
		Rickshaw.Series.fill(this.series, 0);
	}
	
	this.renderer = renderer;
	
	this.graph.configure({
		renderer: renderer
	});
	
	this.graph.render();
};

dashChart.prototype.createLegend = function() {
	$('#legend').empty();

	this.legend = new Rickshaw.Graph.Legend({
		element : document.getElementById('legend'),
		graph : this.graph
	});

	new Rickshaw.Graph.Behavior.Series.Toggle({
		graph : this.graph,
		legend : this.legend
	});
	
	$(this.legend.list).sortable('destroy');

	this.legend.lines.forEach(function(line) {
		// clicking on text should be the same as clicking on checkmark
		var check = line.element.getElementsByTagName('a')[0];
		line.element.getElementsByTagName('span')[0].onclick = check.onclick;
	});
};

/* GRAPH */
dashChart.prototype.createGraph = function(dataset) {
	var chart = this;
	
	this.series = dataset;

	this.series.sort(function(a, b) {
		return b.name.localeCompare(a.name);
	});

	// Determine the time of the latest update
	var latest;
	var latestTimestamp;
	
	this.series.forEach(function(s) {
		var timestamp = s.data[s.data.length - 1].x;
		var d = new Date(timestamp * 1000);

		if (latest === undefined || d > latest) {
			latest = d;
			latestTimestamp = timestamp; 
		}
	});

	this.series.forEach(function(s) {
		// Mark series with data older than 5 minutes as invalid
		chart.prepareSeries(s, latestTimestamp - 5*60 < s.data[s.data.length - 1].x);

		$('#current-data').prepend(s.display);
	});

	if (latest) {
		$('#last-date').text(moment(latest).format('l'));
		$('#last-time').text(moment(latest).format('hh:mm:ss a'));
	}
	
	var size = this.graphSize();
	
	// instantiate our graph!
	var graph = new Rickshaw.Graph({
		element : document.getElementById('chart'),
		width : size.width,
		height : size.height,
		renderer : 'line',
		interpolation : 'linear',
		min: this.min ? 'auto': this.min,
		series : this.series
	});
	this.graph = graph;
	this.renderer = 'line';
	
	$(window).resize(function() {
		if (graph) {
			graph.configure(chart.graphSize());
			graph.update(); 
		}
	});

	this.graph.render();

	new Rickshaw.Graph.HoverDetail({
		graph: this.graph,
		xFormatter: function(x) {
			var d = moment(x * 1000);
			if (chart.elapsed < 2*7*24*60*60*1000) {
				return d.format('MMM DD hh:mm:ss a');
			} else if (chart.elapsed < 2*4*7*24*60*60*1000) {
				return d.format('MMM DD hh:mm a');
			} else if (chart.elapsed < 365*24*60*60*1000) {
				return d.format('MMM DD');
			} else {
				return d.format('MMM DD') + ' - ' + d.add(1, 'weeks').format('MMM DD');
			}
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
			} else if (chart.unit) {
				top = series.name + ':&nbsp;' + formattedY + '&nbsp;' + chart.unit;
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
		graph : this.graph,
		timeFixture: timeFixture
	});
	x_axis.render();

	var y_axis = new Rickshaw.Graph.Axis.Y({
		graph : this.graph,
		orientation : 'left',
		tickFormat : function(y) {
			if (chart.unit) {
				if (chart.unit == 'kW' && chart.renderer == 'bar') {
					return Rickshaw.Fixtures.Number.formatKMBT(y) + ' kWh';
				} else {
					return Rickshaw.Fixtures.Number.formatKMBT(y) + ' ' + chart.unit;
				}
			} else {
				return Rickshaw.Fixtures.Number.formatKMBT(y);
			}
		},
		element : document.getElementById('y-axis'),
	});
	y_axis.render();

	this.createLegend();
	this.disableSeries(this.disable);
};

dashChart.prototype.disableSeries = function(disable) {
	if (disable) {
		for (var i in this.series) {
			try {
				if (disable.length > 0 && disable.indexOf(this.series[i].id) > -1) {
					this.series[i].disable();
				} else if (disable == this.series[i].id) {
					this.series[i].disable();
				}
			} catch (e) {
				console.warn('Could not disable ' + disable);
			}
		}
		
		if (this.legend && this.legend.lines && this.legend.lines.length > 0) {
			this.legend.lines.forEach(function(line) {
				if (line.series.disabled) {
					$(line.element).addClass('disabled');
				} else {
					$(line.element).removeClass('disabled');
				}
			});
		}
	}
};

dashChart.prototype.setPaused = function(paused) {
	if (paused) {
		$('#pause').val('resume');
		$('#pause').data('paused', true);

		this.emitStream('pause');
	} else {
		$('#pause').val('pause');
		$('#pause').data('paused', false);

		this.loadPoints();
	}
};

dashChart.prototype.graphSize = function() {
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
};

dashChart.prototype.createDownloadUrl = function() {

	// create list of disabled series
	var disabled = [];

	if (this.graph && this.graph.series && this.graph.series.length > 0) {
		this.graph.series.forEach(function(s) { 
			if (s.disabled && s.id) {
				disabled.push(s.id);
			}
		});
	}

	// build list of dgms and variables
	var dgms = '';
	var variablesList = [];
	var all = false;

	if (this.points) {
		this.points.forEach(function(point) {
			var includeDgm = false;
			
			if (point.variables && point.variables.length > 0) {
				point.variables.forEach(function(variable) {
					if (disabled.indexOf(variable) < 0) {
						variablesList.push(variable);
						includeDgm = true;
					}
				});
			} else {
				// if any series does not specify variables, load all of them
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
		
		if (dgms.length > 0) {
			dgms = 'dgm=' + dgms + '&';
		}
	}

	// convert array of variables into string
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

		return '/recent?format=csv&' + variables + dgms + 'elapsed=' + this.elapsed;
	} else if (this.series.length > 0) {

		// pick the earliest time from all series as the end time
		var start;
		this.series.forEach(function(s) {
			var x = s.data[0].x * 1000;
			if (start == null || x < start) {
				start = x;
			}
		});
	
		// pick the latest time from all series as the end time	
		var end;
		this.series.forEach(function(s) {
			var x = s.data[s.data.length-1].x * 1000;
			if (end == null || x > end) {
				end = x;
			}
		});

		return '/range?format=csv&' + variables + dgms + 'start=' + start + '&end=' + end;
	}
};