var cache = require('memory-cache');

cache.get_raw = cache.get;
cache.put_raw = cache.put;

cache.get = function (key) {
	return Promise.resolve()
		.then(function () {
			var value = cache.get_raw(key)

			console.log('get', key, value);

			return value;
		});
};

cache.set = function (key, value) {
	return Promise.resolve()
		.then(function () {
			console.log('set', key, value);

			return cache.put_raw(key, value);
		});
};

module.exports = cache;