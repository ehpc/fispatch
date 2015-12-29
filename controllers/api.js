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
			.done(function () {
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

					readFile('data/settings.json', 'utf8').done(function (settingsData) {
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
											console.log('require(controllers/' + repoSettings.beforeDownload.controller + ')');
											var controller = require('controllers/' + repoSettings.beforeDownload.controller);
											if (controller && typeof controller[repoSettings.beforeDownload.action] === 'function') {
												controller[repoSettings.beforeDownload.action].call(repoSettings, repoSettings.beforeDownload.options).then(function () {
													console.log('Завершился обработчик ' + repoSettings.beforeDownload.action);
													resolve();
												}).fail(function () {
													console.error('Ошибка обработчика ' + repoSettings.beforeDownload.action);
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
										.fail(reject);
								});
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
					});
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


