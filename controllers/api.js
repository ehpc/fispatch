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
	helper = require('controllers/helper');

router
	// Создание патча
	.post('/api/make-patch', function (req, res) {
		var data = req.body,
			downloadsDir = path.join(__dirname, '..', 'downloads');
		console.log('Директория загрузок: «' + downloadsDir + '»');
		console.log('Собираем патч «' + data.patchData.name + '»');
		// Инициализируем все репозитории по необходимости
		helper.initAllIfNeeded()
			.then(function () {
				// Обновляем все репозитории
				return helper.updateAll();
			})
			.then(function () {
				return helper.cleanFilesTempDir();
			})
			.done(function () {
				var asyncs = [];
				// Если сборка патча в SVN
				if (data.type === 'patch_svn') {
					console.log('Сборка патча для SVN');
					// TODO:
				}
				// Если сборка патча с загрузкой
				else if (data.type === 'patch_download') {
					console.log('Сборка патча для загрузки');
					// Для каждого репозитория
					data.patchData.repos.forEach(function (repo) {
						console.log('Собираем репозиторий «' + repo.alias + '»');
						console.log('Настройки для репозитория «' + repo.alias + '»:', repo);
						// Создаём патч для репозитория
						asyncs.push(helper.createRepoDiff(repo));
					});
					Q.all(asyncs)
						.then(function () {
							// Создаём архив патча
							return helper.createArchive(data.patchData.name, downloadsDir);
						})
						.done(function (archName) {
							console.log('Создан архив патча «' + archName + '»');
							// Отдаём информацию на интерфейс
							res.json({
								name: data.patchData.name,
								status: 'ok',
								url: '/shared/' + archName
							});
						});
				}
				// Если сборка дистрибутива в SVN
				else if (data.type === 'distrib_svn') {
					console.log('Сборка дистрибутива для SVN');
					// TODO:
				}
				// Если сборка дистрибутива с загрузкой
				else if (data.type === 'distrib_download') {
					console.log('Сборка дистрибутива для загрузки');
					// TODO:
				}
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


