/**
 * Модуль отдельно выполняемых задач
 * @author Eugene Maslovich <ehpc@em42.ru>
 */

/*jslint node:true*/

var fs = require('fs'),
	Q = require('q'),
	path = require('path'),
	helper = require('./helper'),
	queue = require('./queue'),
	childProcess = require('child_process'),
	exec = Q.denodeify(childProcess.exec),
	readFile = Q.denodeify(fs.readFile),
	execOptions = {
		maxBuffer: 250000
	},
	cmdOptions = process.argv.filter(function (item, index) {
		return index >= 2;
	});

/**
 * Сборка патча
 * @param task Данные задания
 */
function makePatch(task) {
	function getSettingsByAlias(settings, alias) {
		var i;
		for (i = 0; i < settings.repositories.length; i++) {
			if (settings.repositories[i].alias === alias) {
				return settings.repositories[i];
			}
		}
		return null;
	}

	var downloadsDir = path.join(__dirname, '..', 'downloads'),
		data = task.data;
	console.log('Директория загрузок: «' + downloadsDir + '»');
	console.log('Собираем патч «' + data.name + '»');
	console.log('Данные: ' + JSON.stringify(data));
	return new Promise(function (resolve, reject) {
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
				data.repos.forEach(function (repo) {
					console.log('Собираем репозиторий «' + repo.alias + '»');
					console.log('Настройки для репозитория «' + repo.alias + '»:', repo);
					// Создаём патч для репозитория
					asyncs.push(helper.createRepoDiff(repo, data.name));
				});
				fs.writeFileSync('logs/data.txt', JSON.stringify(data, null, 4));
				console.log(data.type);
				// Если сборка патча в SVN
				if (data.type === 'patch_svn') {
					console.log('Сборка патча для SVN');
					Q.all(asyncs)
						.then(function () {
							// Заливаем в SVN
							return helper.pushToSvn(data.name);
						})
						.then(function (date) {
							console.log('Патч «' + data.name + '» добавлен в SVN');
							// Отдаём информацию на интерфейс
							resolve({
								name: data.name,
								status: 'ok',
								date: date
							});
						})
						.fail(reject);
				}
				// Если сборка патча с загрузкой
				else {
					console.log('Сборка патча для загрузки');
					readFile('data/settings.json', 'utf8').then(function (settingsData) {
						var settings = JSON.parse(settingsData);
						Q.all(asyncs)
							.then(function () {
								console.log('Проверяем хуки');
								// Хуки перед загрузкой патча
								var beforeDownloadAsyncs = [];
								data.repos.forEach(function (repo) {
									var repoSettings = getSettingsByAlias(settings, repo.alias);
									console.log('beforeDownload «' + repo.alias + '»');
									if (repoSettings.beforeDownload) {
										console.log('Для репозитория ' + repo.alias + ' существует обработчик beforeDownload');
										beforeDownloadAsyncs.push(Q.Promise(function (resolveInner, rejectInner) {
											console.log('require(./' + repoSettings.beforeDownload.controller + ')');
											// Находим контроллер, в котором реализован beforeDownload
											var controller = require('./' + repoSettings.beforeDownload.controller);
											console.log('required.');
											if (controller && typeof controller[repoSettings.beforeDownload.action] === 'function') {
												// Находим экшн контроллера
												controller[repoSettings.beforeDownload.action](repoSettings.beforeDownload.options, repoSettings, repo, data).then(function () {
													console.log('Завершился обработчик ' + repoSettings.beforeDownload.action);
													resolveInner();
												}).fail(function (error) {
													var res = 'Ошибка обработчика ' + repoSettings.beforeDownload.action;
													console.error(res, error);
													rejectInner(res);
												});
											}
											else {
												var res = 'Не удалось найти экшн' + repoSettings.beforeDownload.action;
												console.error(res);
												rejectInner(res);
											}
										}));
									}
								});
								return Q.Promise(function (resolveInner, rejectInner) {
									console.log('beforeDownloadAsyncs');
									Q.all(beforeDownloadAsyncs)
									// Создаём архив патча
										.then(function () {
											console.log('Создаем архив');
											resolveInner(helper.createArchive(data.name, downloadsDir));
										})
										.fail(function (err) {
											console.error(err);
											rejectInner(err + '');
										});
								});
							})
							.then(function (archName) {
								console.log('Создан архив патча «' + archName + '»');
								// Отдаём информацию на интерфейс
								resolve({
									name: data.name,
									status: 'ok',
									url: '/shared/' + archName,
									result: '/shared/' + archName
								});
							})
							.fail(function (err) {
								reject(err + '');
							});
					}).fail(function (err) {
						reject(err + '')
					});
				}
			}).fail(function (err) {
				reject(err + '');
			});
	});
}

/**
 * Запуск команды
 * @param cmd Команды
 * @param task Данные задания
 */
function run(cmd, task) {
	var cmdStr = 'node controllers/proc.js ' + cmd + ' ' + Buffer.from(JSON.stringify(task)).toString('base64') + ' &';
	console.log('Запуск команды планировщика: ' + cmdStr);
	exec(cmdStr, execOptions).then(function () {
		console.log('proc: Команда выполнена.');
	}).fail(function (err) {
		console.log('Ошибка запуска команды: ' + err);
	});
}

module.exports = {
	makePatch: makePatch,
	run: run
};

/**
 * Запись в лог-файл
 * @param message Сообщение
 */
function logWrite(message) {
	var currentdate = new Date(),
		timestamp = currentdate.getDate() + "." +
			(currentdate.getMonth() + 1)  + "." +
			currentdate.getFullYear() + " " +
			currentdate.getHours() + ":" +
			currentdate.getMinutes() + ":" +
			currentdate.getSeconds();
	fs.appendFile('logs/console.log', '[' + timestamp + '] ' + message + '\n');
}

// Запуск из консоли
if (cmdOptions.length) {
	console.log = function () {
		logWrite(Array.prototype.slice.call(arguments).join(' '));
	};
	console.error = function () {
		logWrite('ERROR: ' + Array.prototype.slice.call(arguments).join(' '));
	};
	try {
		// Выделяем данные задания
		if (cmdOptions[1]) {
			var jsonString = Buffer.from(cmdOptions[1], 'base64').toString('utf8');
			console.log('jsonString: ' + jsonString);
			cmdOptions[1] = JSON.parse(jsonString);
		}
		// Выполняем функцию
		module.exports[cmdOptions[0]].apply(this, cmdOptions.slice(1)).then(function (res) {
			if (cmdOptions[1]) {
				cmdOptions[1].status = 'done';
				cmdOptions[1].result = res.result;
				queue.update(cmdOptions[1]);
			}
			console.log('proc: ' + cmdOptions[0] + ': done');
		}).catch(function (err) {
			if (cmdOptions[1]) {
				cmdOptions[1].status = 'error';
				cmdOptions[1].result = err;
				queue.update(cmdOptions[1]);
			}
			console.error(err);
		});
	}
	catch (e) {
		console.error('ERROR: ' + e.message);
	}
}
