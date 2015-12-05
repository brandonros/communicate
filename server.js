var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var diffpatcher = require('jsondiffpatch').create();
var hash = require('object-hash');

var cache = require('./cache');

var default_store = {
	account: { id: 1, name: 'lol' },
	items: [{ id: 1, name: 'extra lol' }],
	balance: 300,
	customers: [{ id: 1, name: 'ronnie' }]
};

var updated_store = {
	account: { id: 1, name: 'l2ol' },
	items: [{ id: 1, name: 'extra lol' }],
	balance: 3040,
	customers: [{ id: 1, name: 'ronnie' }, { id: 2, name: 'jonnie' }]
};

var store_keys = ['account', 'items', 'balance', 'customers'];

function notify_channel(channel, name, old_hash, new_hash, patch) {
	io.to(channel).emit('patch', { name: name, old_hash: old_hash, new_hash: new_hash, patch: patch });
}

function calculate_patch(old_store, new_store) {
	return diffpatcher.diff(old_store, new_store);
}

function store_patch(old_hash, new_hash, patch) {
	return cache.set('patch:' + old_hash + ':' + new_hash, patch);
}

function get_patch(old_hash, new_hash) {
	return cache.get('patch:' + old_hash + ':' + new_hash);
}

function get_patches(stores) {
	return Promise.all(stores.map(function (store) {
		return get_patch(store['old_hash'], store['new_hash']);
	}));
}

function get_store(hash) {
	return cache.get('store:' + hash);
}

function set_store(hash, store) {
	return cache.set('store:' + hash, store);
}

function get_hash(name) {
	return cache.get('hash:' + name);
}

function set_hash(name, hash) {
	return cache.set('hash:' + name, hash);
}

function get_hashs(name) {
	return Promise.all(Object.keys(default_store).map(function (key) {
		return get_hash(name + ':' + key)
			.then(function (hash) {
				return {
					store: key,
					hash: hash
				};
			});
	}));
}

function get_stores(name) {
	return Promise.all(Object.keys(default_store).map(function (key) {
		return get_hash(name + ':' + key)
			.then(function (hash) {
				return get_store(hash)
					.then(function (store) {
						return {
							key: key,
							store: store,
							hash: hash
						};
					});
			});
	}));
}

function update_store(name, key, new_store) {
	return get_hash(name + ':' + key)
		.then(function (old_hash) {
			return get_store(old_hash)
				.then(function (old_store) {
					var patch = calculate_patch(old_store, new_store);
					var new_hash = hash(new_store);

					if (patch && new_hash !== old_hash) { /* if there was actually a change */
						return store_patch(old_hash, new_hash, patch)
							.then(function () {
								return set_hash(name + ':' + key, new_hash)
									.then(function () {
										return set_store(new_hash, new_store)
											.then(function () {
												notify_channel(name, key, old_hash, new_hash, patch);
											});
									});
							});
					}
				});
		});
}

function init_stores(name) {
	return Promise.all(store_keys.map(function (key) {
		var new_hash = hash(default_store[key]);

		return set_store(new_hash, default_store[key])
			.then(function () {
				return set_hash(name + ':' + key, new_hash);
			});
	}));
}

function update_stores(name) {
	return Promise.all(store_keys.map(function (key) {
		return update_store(name, key, updated_store[key])
	}));
}

function init_server(port) {
	io.on('connection', function (socket) {
		socket.on('subscribe', function (data) {
			socket.join(data['channel']);
		});
	});

	app.get('/update_stores/:name', function (req, res) {
		update_stores(req['params']['name'])
		.then(function () {
			res.send({ success: true });
		})
		.catch(function (err) {
			res.status(500).send({ error: err['stack'] });
		});
	});

	app.get('/hashes/:name', function (req, res) {
		get_hashs(req['params']['name'])
		.then(function (hashes) {
			res.send(hashes);
		})
		.catch(function (err) {
			res.status(500).send({ error: err['stack'] });
		});
	});

	app.get('/stores/:name', function (req, res) {
		get_stores(req['params']['name'])
		.then(function (stores) {
			res.send(stores);
		})
		.catch(function (err) {
			res.status(500).send({ error: err['stack'] });
		});
	});

	app.get('/patch/:old_hash/:new_hash', function (req, res) {
		get_patch(req['params']['old_hash'], req['params']['new_hash'])
		.then(function (patch) {
			res.send(patch);
		})
		.catch(function (err) {
			res.status(500).send({ error: err['stack'] });
		});
	});

	app.listen(port);
}

init_stores('1')
.then(function () {
	init_server(9090);	

	console.log('Listening...');
})
.catch(function (err) {
	console.error(err['stack']);

	process.exit(1);
});