var io = require('socket.io-client')({ transports: ['websocket'] }); /* 170kb */
var diffpatcher = require('jsondiffpatch').create(); /* 36kb */
var hash = require('object-hash'); /* 500kb... */
var localforage = require('localforage'); /* another 150kb or so */

global.socket = null;

global.stores = {};
global.hashes = {};

function get_json(path) {
	return fetch(path)
		.then(function (res) {
			return res.json();
		});
}

function init_socket() {
	return new Promise(function (resolve, reject) {
		socket = io.connect('http://localhost:9090/');

		socket.emit('subscribe', { name: '1' });

		socket.on('patch', function (data) {
			patch_store(data);
		});

		socket.on('connect', function () {
			resolve();
		});

		socket.on('reconnect', function () {
			reconnect();
		});
	});	
}

function reconnect() {
	diff_stores()
	.then(function () {
		socket.emit('subscribe', { name: '1' });

		console.log('Back up to date');
	})
	.catch(function (err) {
		console.error(err);
	});
}

function diff_stores() {
	return get_json('http://localhost:9090/hashes/1')
		.then(function (hashes_data) {
			return Promise.all(hashes_data.map(function (hash_data) {
				var key = hash_data['store'];
				var hash = hash_data['hash'];

				if (hashes[key] !== hash) {
					return retreive_store(key);
				}
			}));
		});
}

function load_stores() {
	return get_json('http://localhost:9090/hashes/1')
		.then(function (hashes_data) {
			return Promise.all(hashes_data.map(function (hash_data) {
				return Promise.all([
					localforage.getItem('stores:' + hash_data['key']),
					localforage.getItem('hashes:' + hash_data['key'])
				])
				.then(function (res) {
					if (res[1] !== hash_data['hash']) {
						return retreive_store(hash_data['key']);
					}

					stores[hash_data['key']] = res[0];
					hashes[hash_data['key']] = res[1];
				});
			}));
		});
}

function get_stores() {
	return get_json('http://localhost:9090/stores/1')
		.then(function (stores_data) {
			return Promise.all(stores_data.map(function (store_data) {
				return persist_store(store_data['key'], store_data['store'], store_data['hash']);
			}));
		});
}

function retreive_store(key) {
	return get_json('http://localhost:9090/store/1/' + key)
		.then(function (stores_data) {
			return persist_store(key, stores_data[0]['store'], stores_data[0]['hash']);
		});
}

function persist_store(key, store, hash) {
	return Promise.all([
		localforage.setItem('stores:' + key, store),
		localforage.setItem('hashes:' + key, hash)
	])
	.then(function (res) {
		stores[key] = res[0];
		hashes[key] = res[1];
	});
}

function patch_store(patch) {
	var key = patch['key'];
	var old_hash = patch['old_hash'];
	var new_hash = patch['new_hash'];

	if (hashes[key] !== old_hash) { /* out of sync */
		return retreive_store(key);
	}

	return persist_store(key, diffpatcher.patch(stores[key], patch['diff']), new_hash);
}

load_stores()
.then(function () {
	return init_socket();
})
.then(function () {
	console.log('Listening...');
})
.catch(function (err) {
	console.error(err['stack']);
});