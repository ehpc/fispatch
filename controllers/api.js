/**
 * @author Eugene Maslovich <ehpc@em42.ru>
 */

/*jslint node:true*/

'use strict';

var router = require('express').Router(),
	fs = require('fs'),
	Q = require('q'),
	readFile = Q.denodeify(fs.readFile),
	helper = require('controllers/helper');

router
	.post('/api/make-patch', function (req, res) {
		var data = req.body;
		console.log('Собираем патч «' + data.patchData.name + '»');
		if (data.type === 'patch_svn') {
			console.log('Сборка патча для SVN');
		}
		else if (data.type === 'patch_download') {
			console.log('Сборка патча для загрузки');
			data.patchData.repos.forEach(function (repo) {
				console.log('Собираем репозиторий «' + repo.alias + '»');
			});
		}
		else if (data.type === 'distrib_svn') {
			console.log('Сборка дистрибутива для SVN');
		}
		else if (data.type === 'distrib_download') {
			console.log('Сборка дистрибутива для загрузки');
		}
		res.json({
			name: data.patchData.name,
			status: 'ok',
			url: 'http://test.em42.ru/downloads/repo.tar.gz'
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
		fs.writeFile('data/settings.json', JSON.stringify(req.body), function (err) {
			if (err) {
				throw err;
			}
			// После сохранения заново инициализируем приложение
			helper.initAll().done(function () {
				res.json({status: 'ok'});
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
	});


module.exports = router;


