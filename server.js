var app = require('express').createServer();
var io = require('socket.io')(app);
var diffpatcher = require('jsondiffpatch').create();
var cache = require('memory-cache');
var uuid = require('uuid');

function notify_channel(channel, old_version, new_version) {
	io.to(channel).emit('patch', { old_version: old_version, new_version: new_version });
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

function get_patches(body) {
	return Promise.all(body['stores'].map(function (store) {
		return get_patch(store['old_version'], store['new_version']);
	}));
}

function get_store(version) {
	return cache.get('store:' + version);
}

function set_store(version, docs) {
	return cache.set('store:' + version, docs);
}

function update_store(channel, name, new_store) {
	return cache.get('version:' + name)
		.then(function (old_version) {
			return get_store(old_version)
				.then(function (old_store) {
					var patch = calculate_patch(old_store, new_store);
					var new_version = uuid.v4();

					return store_patch(old_store, old_store, new_store, new_version)
						.then(function () {
							send_to_channel(channel, old_version, new_version);
						});
				});
		});
}

function init_server(port) {
	io.on('connection', function (socket) {
		socket.on('subscribe', function (data) {
			socket.join(data['channel']);
		});
	});

	app.post('/get_patches', function (req, res) {
		var body = req['body'];

		get_patches(req['body'])
		.then(function (patches) {
			res.send(patches);
		})
		.catch(function (err) {
			res.status(500).send({ error: err['stack'] });
		});
	});

	app.listen(port);
}

init_server(9090);