'use strict';

var dashMeter = function(host, dgm, variables, latest) {
	var socket = io.connect(host);
	
	var self = this;

	socket.emit('update', dgm);
	
	socket.on('update', function(dataset) {
		for (var d in dataset) {
	
			if (dataset[d].name == variables) {
				
				var next = dataset[d].data[dataset[d].data.length - 1].y;
				
				if (next && next > 0) {
					self.update(next);
				}
			}
		}
	});
	
	this.update(latest);
};

dashMeter.prototype.update = function(value) {
	document.getElementById('amount').innerHTML = Math.floor(value).toLocaleString();	
};