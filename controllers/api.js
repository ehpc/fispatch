/**
 * @author Eugene Maslovich <ehpc@em42.ru>
 */

/*jslint node:true*/

'use strict';

var router = require('express').Router(),
	fs = require('fs'),
	Q = require('q'),
	path = require('path'),
	readFile = Q.denodeify(fs.readFile),
	helper = require('./helper'),
	queue = require('./queue'),
	proc = require('./proc'),
	exec = require('child_process').exec;

router

	// Добавление задания в очередь
	.post('/api/queue/add', function (req, res) {
		var queueData = {
				data: req.body.data
			},
			settings = JSON.parse(fs.readFileSync('data/settings.json', 'utf8'));
		queueData.type = req.body.type;
		if (req.body.type === 'makePatch') {
			queueData.taskName =
				'Сборка патча "' + queueData.data.name + '"' +
				' (' + JSON.stringify(queueData.data.repos) + ')';
		}
		queueData.taskCreator = settings.ipMap[req.ip] || req.ip;
		queue.add(queueData);
		console.log('Добавлено задание', JSON.stringify(queueData));
		res.json({
			result: 'ok'
		});
	})

	// Удаление задания из очереди
	.post('/api/queue/delete', function (req, res) {
		queue.remove(req.body.id);
		res.json({
			result: 'ok'
		});
	})

	// Создание патча
	.post('/api/make-patch', function (req, res) {
		proc.makePatch(req.body).then(function (data) {
			res.json(data);
		}).catch(function (error) {
			console.error(error);
			throw error;
		});
	})

	// Выдача настроек
	.get('/api/settings', function (req, res) {
		readFile('data/settings.json', 'utf8').done(function (data) {
			res.json(JSON.parse(data));
		});
	})
	// Запись настроек
	.post('/api/settings', function (req, res) {
		fs.writeFile('data/settings.json', req.body.settings, function (err) {
			if (err) {
				throw err;
			}
			// После сохранения заново инициализируем приложение
			helper.initAll().then(function () {
				res.json({status: 'ok'});
			}).fail(function (err) {
				console.log(err);
			});
		});
	})
	// Сброс настроек
	.delete('/api/settings', function (req, res) {
		var ws = fs.createWriteStream('data/settings.json');
		ws.on('close', function () {
			// После сброса заново инициализируем приложение
			helper.initAll().done(function () {
				res.json({status: 'ok'});
			});
		});
		ws.on('error', function (err) {
			throw err;
		});
		fs.createReadStream('data/settings-default.json').pipe(ws);
	})

	// Для отладки
	.get('/api/test', function (req, res) {
		res.send('ok');
	})

	.get('/api/lock/force', function (req, res) {
		helper.unlock();
		console.log('lock forced successfully');
		res.send('ok');
	})
	
	.get('/api/restart', function (req, res) {
		console.log('Restarting server');
		exec('./restart.sh&', function (error, stdout, stderr) {
			if (error) {
				console.error('exec error: ' + error);
				return;
			}
			console.log('stdout: ' + stdout);
			console.log('stderr: ' + stderr);
		});
		res.send('ok');
	})

	// Удаляет собранный файл
	.get('/api/delete', function (req, res) {
		console.log('Deleting file', 'rm -f downloads/' + req.query.fileName);
		if (req.query.fileName) {
			exec('rm -f downloads/' + req.query.fileName, function (error, stdout, stderr) {
				if (error) {
					console.error('exec error: ' + error);
				}
			});
		}
		res.send('ok');
	});


module.exports = router;


