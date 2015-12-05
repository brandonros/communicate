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

var store_keys = ['account', 'items', 'balance', 'customers'];

function notify_channel(name, key, old_hash, new_hash, patch) {
	io.to(name).emit('patch', { key: key, old_hash: old_hash, new_hash: new_hash, diff: patch });
}

function calculate_patch(old_store, new_store) {
	return diffpatcher.diff(old_store, new_store);
}

function get_store(name, key) {
	return cache.get('store:' + name + ':' + key);
}

function set_store(name, key, store) {
	return cache.set('store:' + name + ':' + key, store);
}

function get_hash(name, key) {
	return cache.get('hash:' + name + ':' + key);
}

function set_hash(name, key, hash) {
	return cache.set('hash:' + name + ':' + key, hash);
}

function get_hashes(name) {
	return Promise.all(store_keys.map(function (key) {
		return get_hash(name, key)
			.then(function (hash) {
				return {
					key: key,
					hash: hash
				};
			});
	}));
}

function get_stores(name, keys) {
	return Promise.all(keys.map(function (key) {
		return get_hash(name, key)
			.then(function (hash) {
				return get_store(name, key)
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
	return get_hash(name, key)
		.then(function (old_hash) {
			return get_store(name, key)
				.then(function (old_store) {
					var patch = calculate_patch(old_store, new_store);
					var new_hash = hash(new_store);

					if (patch && new_hash !== old_hash) { /* if there was actually a change */
						return set_hash(name, key, new_hash)
							.then(function () {
								return set_store(name, key, new_store)
									.then(function () {
										notify_channel(name, key, old_hash, new_hash, patch);
									});
							});
					}
				});
		});
}

function init_stores(name) {
	return Promise.all(store_keys.map(function (key) {
		var new_hash = hash(default_store[key]);

		return set_store(name, key, default_store[key])
			.then(function () {
				return set_hash(name, key, new_hash);
			});
	}));
}

function update_stores(name) {
	var updated_store = {
		account: { id: 1, name: 'l2ol' },
		items: [{ id: 1, name: 'extra lol' }],
		balance: Math.random(),
		customers: [{ id: 1, name: 'ronnie' }, { id: 2, name: 'jonnie' }]
	};

	return Promise.all(store_keys.map(function (key) {
		return update_store(name, key, updated_store[key])
	}));
}

function init_socket() {
	io.on('connection', function (socket) {
		socket.on('subscribe', function (data) {
			socket.join(data['name']);
		});
	});
}

function init_server(port) {
	app.disable('etag');

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
		get_hashes(req['params']['name'])
		.then(function (hashes) {
			res.send(hashes);
		})
		.catch(function (err) {
			res.status(500).send({ error: err['stack'] });
		});
	});

	app.get('/stores/:name', function (req, res) {
		get_stores(req['params']['name'], store_keys)
		.then(function (stores) {
			res.send(stores);
		})
		.catch(function (err) {
			res.status(500).send({ error: err['stack'] });
		});
	});

	app.get('/store/:name/:key', function (req, res) {
		get_stores(req['params']['name'], [req['params']['key']])
		.then(function (stores) {
			res.send(stores);
		})
		.catch(function (err) {
			res.status(500).send({ error: err['stack'] });
		});
	});

	app.get('/', function (req, res) {
	  res.sendFile(__dirname + '/index.html');
	});

	app.get('/bundle.js', function (req, res) {
	  res.sendFile(__dirname + '/bundle.js');
	});

	server.listen(port);
}

init_stores('1')
.then(function () {
	init_socket();
	init_server(9090);	

	console.log('Listening...');
})
.catch(function (err) {
	console.error(err['stack']);

	process.exit(1);
});