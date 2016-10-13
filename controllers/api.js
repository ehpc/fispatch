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
	exec = require('child_process').exec;

function getSettingsByAlias(settings, alias) {
	var i;
	for (i = 0; i < settings.repositories.length; i++) {
		if (settings.repositories[i].alias === alias) {
			return settings.repositories[i];
		}
	}
	return null;
}

router
	// Создание патча
	.post('/api/make-patch', function (req, res) {
		var lock = helper.lock(req.ip);
		if (true) {
			var data = req.body,
				downloadsDir = path.join(__dirname, '..', 'downloads');
			console.log('Директория загрузок: «' + downloadsDir + '»');
			console.log('Собираем патч «' + data.patchData.name + '»');
			// Инициализируем все репозитории по необходимости
			helper.initAllIfNeeded()
				.then(function () {
					console.log('API updateAll');
					// Обновляем все репозитории
					return helper.updateAll();
				})
				.then(function () {
					console.log('API cleanFilesTempDir');
					return helper.cleanFilesTempDir();
				})
				.then(function () {
					var asyncs = [];

					// Для каждого репозитория
					data.patchData.repos.forEach(function (repo) {
						console.log('Собираем репозиторий «' + repo.alias + '»');
						console.log('Настройки для репозитория «' + repo.alias + '»:', repo);
						// Создаём патч для репозитория
						asyncs.push(helper.createRepoDiff(repo, data.patchData.name));
					});

					fs.writeFileSync('logs/data.txt', JSON.stringify(data, null, 4));

					// Если сборка патча в SVN
					if (data.type === 'patch_svn') {
						console.log('Сборка патча для SVN');

						Q.all(asyncs)
							.then(function () {
								// Заливаем в SVN
								return helper.pushToSvn(data.patchData.name);
							})
							.done(function (date) {
								console.log('Патч «' + data.patchData.name + '» добавлен в SVN');
								// Отдаём информацию на интерфейс
								res.json({
									name: data.patchData.name,
									status: 'ok',
									date: date
								});
							});
					}
					// Если сборка патча с загрузкой
					else if (data.type === 'patch_download') {
						console.log('Сборка патча для загрузки');

						readFile('data/settings.json', 'utf8').then(function (settingsData) {
							var settings = JSON.parse(settingsData);
							Q.all(asyncs)
								.then(function () {

									console.log('Проверяем хуки');

									// Хуки перед загрузкой патча
									var beforeDownloadAsyncs = [];
									data.patchData.repos.forEach(function (repo) {
										var repoSettings = getSettingsByAlias(settings, repo.alias);
										console.log('beforeDownload «' + repo.alias + '»');
										if (repoSettings.beforeDownload) {
											console.log('Для репозитория ' + repo.alias + ' существует обработчик beforeDownload');
											beforeDownloadAsyncs.push(Q.Promise(function (resolve, reject) {
												console.log('require(./' + repoSettings.beforeDownload.controller + ')');
												// Находим контроллер, в котором реализован beforeDownload
												var controller = require('./' + repoSettings.beforeDownload.controller);
												console.log('required.');
												if (controller && typeof controller[repoSettings.beforeDownload.action] === 'function') {
													// Находим экшн контроллера
													controller[repoSettings.beforeDownload.action](repoSettings.beforeDownload.options, repoSettings, repo, data).then(function () {
														console.log('Завершился обработчик ' + repoSettings.beforeDownload.action);
														resolve();
													}).fail(function (error) {
														console.error('Ошибка обработчика ' + repoSettings.beforeDownload.action, error);
														reject();
													});
												}
												else {
													console.error('Не удалось найти экшн' + repoSettings.beforeDownload.action);
													reject();
												}
											}));
										}
									});

									return Q.Promise(function (resolve, reject) {
										console.log('beforeDownloadAsyncs');
										Q.all(beforeDownloadAsyncs)
										// Создаём архив патча
											.then(function () {
												console.log('Создаем архив');
												resolve(helper.createArchive(data.patchData.name, downloadsDir));
											})
											.fail(function (err) {
												console.log(err);
												reject(err);
											});
									});
								})
								.then(function (archName) {
									console.log('Создан архив патча «' + archName + '»');
									// Отдаём информацию на интерфейс
									res.json({
										name: data.patchData.name,
										status: 'ok',
										url: '/shared/' + archName
									});
									helper.unlock();
								}).fail(helper.unlock);
						}).fail(helper.unlock);
					}
				}).fail(helper.unlock);
		}
		else {
			helper.throwLocked(lock);
		}
	})

	// Выдача настроек
	.get('/api/settings', function (req, res) {
		var lock = helper.lock(req.ip);
		if (lock === true) {
			readFile('data/settings.json', 'utf8').done(function (data) {
				res.json(JSON.parse(data));
			});
		}
		else {
			helper.throwLocked(lock);
		}
	})
	// Запись настроек
	.post('/api/settings', function (req, res) {
		var lock = helper.lock(req.ip);
		if (lock === true) {
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
		}
		else {
			helper.throwLocked();
		}
	})
	// Сброс настроек
	.delete('/api/settings', function (req, res) {
		var lock = helper.lock(req.ip);
		if (lock === true) {
			var ws = fs.createWriteStream('data/settings.json');
			ws.on('close', function () {
				// После сброса заново инициализируем приложение
				helper.initAll().done(function () {
					res.json({status: 'ok'});
					helper.unlock();
				});
			});
			ws.on('error', function (err) {
				helper.unlock();
				throw err;
			});
			fs.createReadStream('data/settings-default.json').pipe(ws);
		}
		else {
			helper.throwLocked(lock);
		}
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


