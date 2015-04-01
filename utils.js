var cleanDGM = function(dgm) {
	return dgm.replace(/\//g, '-');
}

module.exports.cleanDGM = cleanDGM;