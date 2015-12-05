var io = require('socket.io-client')({ transports: ['websocket'] });
var diffpatcher = require('jsondiffpatch').create();
var hash = require('object-hash');

var cache = require('./cache');

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
			diff_stores();
		});
	});	
}

function diff_stores() {
	return get_json('http://localhost:9090/hashes/1')
		.then(function (hashes_data) {
			hashes_data.forEach(function (hash_data) {
				console.log(hash_data);
			});
		});
}

function init_stores() {
	return get_json('http://localhost:9090/stores/1')
		.then(function (stores_data) {
			stores_data.forEach(function (store_data) {
				stores[store_data['key']] = store_data['store'];
				hashes[store_data['key']] = store_data['hash'];
			});

			console.log('Got stores and hashes', stores, hashes);
		});
}

function patch_store(patch) {
	var key = patch['key'];
	var old_hash = patch['old_hash'];
	var new_hash = patch['new_hash'];

	if (hashes[key] === old_hash) {
		stores[key] = diffpatcher.patch(stores[key], patch['diff']);
		hashes[key] = new_hash;

		console.log('Patched ', key, stores[key], hashes[key]);
	}

	else { /* out of sync */
		get_json('http://localhost:9090/store/1/' + key)
		.then(function (stores_data) {
			stores[key] = stores_data[0]['store'];
			hashes[key] = stores_data[0]['hash'];

			console.log('Re-retrieved ', key, stores[key], hashes[key]);
		})
		.catch(function (err) {
			console.error(err['stack']);
		});
	}
}

init_stores()
.then(function () {
	return init_socket();
})
.then(function () {
	console.log('Listening...');
})
.catch(function (err) {
	console.error(err['stack']);
});