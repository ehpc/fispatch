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
	execOptions = {
		maxBuffer: 250000
	},
	cmdOptions = process.argv.filter(function (item, index) {
		return index >= 2;
	});

/**
 * Сборка патча
 * @param data
 */
function makePatch(data) {
	var downloadsDir = path.join(__dirname, '..', 'downloads');
	console.log('Директория загрузок: «' + downloadsDir + '»');
	console.log('Собираем патч «' + data.name + '»');
	return new Promise(function (resolve) {
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
				// Если сборка патча в SVN
				if (data.type === 'patch_svn') {
					console.log('Сборка патча для SVN');
					Q.all(asyncs)
						.then(function () {
							// Заливаем в SVN
							return helper.pushToSvn(data.name);
						})
						.done(function (date) {
							console.log('Патч «' + data.name + '» добавлен в SVN');
							// Отдаём информацию на интерфейс
							resolve({
								name: data.name,
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
								data.repos.forEach(function (repo) {
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
											resolve(helper.createArchive(data.name, downloadsDir));
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
								resolve({
									name: data.name,
									status: 'ok',
									url: '/shared/' + archName
								});
								helper.unlock();
							}).fail(function (err) {
							console.error(err);
						});
					}).fail(function (err) {
						console.error(err);
					});
				}
			}).fail(function (err) {
			console.error(err);
		});
	});
}

/**
 * Запуск команды
 * @param cmd Команды
 * @param data Данные
 */
function run(cmd, data) {
	var cmdStr = 'node controllers/proc.js ' + cmd + ' ' + JSON.stringify(data) + '&';
	console.log('Запуск команды планировщика: ' + cmdStr);
	exec(cmdStr, execOptions);
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
	// Выполняем функцию
	module.exports[cmdOptions[0]].apply(this, cmdOptions.slice(1));
}
