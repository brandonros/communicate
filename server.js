var app = require('express').createServer();
var io = require('socket.io')(app);
var diffpatcher = require('jsondiffpatch').create();
var cache = require('memory-cache');
var uuid = require('uuid');

function notify_channel(channel, name, old_version, new_version, patch) {
	io.to(channel).emit('patch', { name: name, old_version: old_version, new_version: new_version, patch: patch });
}

function calculate_patch(old_store, new_store) {
	return diffpatcher(old_store, new_store);
}

function store_patch(old_store, old_version, new_store, new_version) {
	var patch = calculate_patch(old_store, new_store);

	return cache.set('patch:' + old_version + ':' + new_version, patch);
}

function get_patch(old_version, new_version) {
	return cache.get('patch:' + old_version + ':' + new_version);
}

function get_patches(stores) {
	return Promise.all(stores.map(function (store) {
		return get_patch(store['old_version'], store['new_version']);
	}));
}

function get_store(version) {
	return cache.get('store:' + version);
}

function set_store(version, store) {
	return cache.set('store:' + version, store);
}

function get_version(name) {
	return cache.get('version:' + name);
}

function set_version(name, version) {
	return cache.set('version:' + name, version);
}

function get_versions(names) {
	return Promise.all(names.map(function (name) {
		return get_version(name);
	}));
}

function update_store(channel, name, new_store) {
	return get_version(name)
		.then(function (old_version) {
			return get_store(old_version)
				.then(function (old_store) {
					var patch = calculate_patch(old_store, new_store);
					var new_version = uuid.v4();

					return store_patch(old_store, old_store, new_store, new_version)
						.then(function () {
							return set_version(name, new_version);
								.then(function () {
									send_to_channel(channel, name, old_version, new_version, patch);
								});
						});
				});
		});
}

function init_stores(name) {
	var store = {
		account: { id: 1, name: 'lol' },
		items: [{ id: 1, name: 'extra lol' }],
		balance: 300,
		customers: [{ id: 1, name: 'ronnie' }]
	};

	var version = uuid.v4();

	return set_store(verion, store)
		.then(function () {
			return set_version(name, version);
		});
}

function init_server(port) {
	io.on('connection', function (socket) {
		socket.on('subscribe', function (data) {
			socket.join(data['channel']);
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