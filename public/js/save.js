var socket = io.connect(host);

socket.emit('update', dgm);

socket.on('update', function(dataset) {
	for (var d in dataset) {

		if (dataset[d].name == variables) {
			
			var next = dataset[d].data[dataset[d].data.length - 1].y;

			if (next && next > 0) {
				var diff = next - latest;

				amount += diff;
				document.getElementById('amount').innerHTML = amount;

				latest = next;
			}
		}
	}
});