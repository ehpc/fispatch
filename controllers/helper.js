/**
 * Вспомогательный модуль
 * @author Eugene Maslovich <ehpc@em42.ru>
 */

/*jslint node:true*/

/**
 * @property repositories
 * @property temp
 * @property svn
 * @property alias
 */
var helper = helper || (function () {
	'use strict';

	var Q = require('q'),
		fs = require('fs'),
		path = require('path'),
		childProcess = require('child_process'),
		exec = Q.denodeify(childProcess.exec),
		readFile = Q.denodeify(fs.readFile),
		colorsModule = require('controllers/colors');

	/**
	 * Получает данные о репозиториях
	 * @returns {Q.Promise<null>}
	 */
	function getReposData() {
		var deferred = Q.defer();

		readFile('data/settings.json', 'utf8').done(function (data) {
			var settings = JSON.parse(data),
				tempDir = settings.temp,
				i,
				needInit = false,
				initDeferred = Q.defer();

			console.log('Проверяем, загружены ли репозитории');
			for (i = 0; i < settings.repositories.length; i++) {
				var repository = settings.repositories[i],
					repositoryPath = path.join(tempDir, repository.alias);
				console.log('Проверяем существование репозитория', repositoryPath);
				if (!fs.existsSync(repositoryPath)) {
					needInit = true;
				}
			}

			console.log('Загружаем данные о ветках. Необходимость инициализации: ', needInit);
			// Если репозитории не загружены
			if (needInit) {
				initAll().done(function () {
					initDeferred.resolve(null);
				});
			}
			// Если загружены
			else {
				initDeferred.resolve(null);
			}

			initDeferred.promise.done(function () {
				// Загружаем данные о ветках
				getReposDataInner().done(function (data) {
					console.log('Получили данные репозиториев');
					deferred.resolve(data);
				});
			});

			/**
			 * Достаёт данные о репозиториях
			 */
			function getReposDataInner() {
				var deferred = Q.defer(),
					asyncs0 = [],
					asyncs1 = [],
					asyncs2 = [],
					data = {}; // Здесь будут храниться данные о репозиториях
					/*
					data = {
						repo1: {
							branches: ['70', ...],
							branchesMetadata: {
								'70': {
									name: '70',
									color: '#ff0000'
								}, ...
							},
							revisions: [
					 			{
					 				rev: 3940,
					 				branch: 70,
					 				node: 3d34fd4h4d3443f34f343f34543,
					 				desc: 'Description',
					 				parent1: 234234ghj243g43432k4h3j2
					 			}, ...
							]
						}
					}
					*/

				/**
				 * Обновляет указанный репозиторий
				 * @param repository Репозиторий
				 * @returns {Q.Promise<null>}
				 */
				function updateRepo(repository) {
					var repositoryPath = path.join(tempDir, repository.alias),
						deferred = Q.defer();
					console.log('Обновляем репозиторий «' + repository.alias + '»');
					exec('hg update -R ' + repositoryPath)
						.done(function () {
							deferred.resolve(null);
						});
					return deferred.promise;
				}

				/**
				 * Достаёт данные о ветках для указанного репозитория
				 * @param repository Репозиторий
				 * @returns {Q.Promise<null>}
				 */
				function getBranches(repository) {
					var repositoryPath = path.join(tempDir, repository.alias),
						deferred = Q.defer(),
						i, colors;
					console.log('Получаем список веток для репозитория «' + repository.alias + '»');
					exec('hg branches -R ' + repositoryPath)
						.done(function (out) {
							var rx = new RegExp('(\\w+)\\s+(\\d+):(\\w+)', 'ig'),
								res;
							if (typeof data[repository.alias] === 'undefined') {
								data[repository.alias] = {
									branches: [],
									branchesMetadata: {},
									revisions: []
								};
							}
							// Добавляем ветки
							while ((res = rx.exec(out)) !== null) {
								data[repository.alias].branches.push(res[1]);
								data[repository.alias].branchesMetadata[res[1]] = {
									name: res[1]
								};
							}
							// Задаём цвета для веток
							colors = colorsModule.getColors(data[repository.alias].branches.length);
							for (i = 0; i < data[repository.alias].branches.length; i++) {
								data[repository.alias].branchesMetadata[data[repository.alias].branches[i]].color = colors[i];
							}
							deferred.resolve(null);
						});
					return deferred.promise;
				}

				/**
				 * Достаёт данные о ревизиях для указанного репозитория
				 * @param repository Репозиторий
				 * @returns {Q.Promise<null>}
				 */
				function getRevisions(repository) {
					var repositoryPath = path.join(tempDir, repository.alias),
						deferred = Q.defer();
					console.log('Получаем список ревизий для репозитория «' + repository.alias + '»');
					exec('hg log --debug --template "rev:{rev};; branch:{branch};; node:{node};; desc:{firstline(desc)};; parents:{parents};;\n" -R ' + repositoryPath)
						.done(function (out) {
							var rx = new RegExp('rev:(\\d+);; branch:(\\w+);; node:(\\w+);; desc:(.+);; parents:[-\\d]+:(\\w+) .+;;', 'ig'),
								res;
							if (typeof data[repository.alias] === 'undefined') {
								data[repository.alias] = {
									branches: [],
									branchesMetadata: {},
									revisions: []
								};
							}
							// Добавляем ревизии
							while ((res = rx.exec(out)) !== null) {
								data[repository.alias].revisions.push({
									rev: res[1],
									branch: res[2],
									node: res[3],
									desc: res[4],
									parent1: res[5],
									color: data[repository.alias].branchesMetadata[res[2]].color
								});
							}
							deferred.resolve(null);
						});
					return deferred.promise;
				}

				// Проходимся по всем репозиториям
				for (i = 0; i < settings.repositories.length; i++) {
					var repository = settings.repositories[i];
					// Предварительно обновим репозитории
					asyncs0.push(updateRepo(repository));
					// Создаём стек функций, которые достанут данные о ветках репозитория
					asyncs1.push(getBranches(repository));
					// Создаём стек функций, которые достанут данные о ревизиях
					asyncs2.push(getRevisions(repository));
				}
				Q.all(asyncs0).done(function () {
					Q.all(asyncs1).done(function () {
						Q.all(asyncs2).done(function () {
							deferred.resolve(data);
						});
					});
				});
				return deferred.promise;
			}

		});
		return deferred.promise;
	}

	/**
	 * Инициализация приложения
	 */
	function initAll() {
		var deferred = Q.defer();
		console.log('Инициализируем репозитории...');
		readFile('data/settings.json', 'utf8').done(function (data) {
			var settings = JSON.parse(data),
				tempDir = settings.temp,
				svnDir = path.join(tempDir, 'svn'),
				i,
				asyncs = [];
			console.log('Текущие настройки: ', settings);

			/**
			 * Инициализирует указанный репозиторий
			 * @param repository Репозиторий
			 * @returns {Q.Promise<null>}
			 */
			function initRepo(repository) {
				var deferred = Q.defer(),
					repositoryPath = path.join(tempDir, repository.alias);
				// Создаём временную директорию репозитория
				console.log('Создаём директорию для «' + repository.alias + '»');
				exec('rm -rf ' + repositoryPath)
					.then(exec('mkdir -p ' + repositoryPath))
					// Клонируем репозиторий
					.then(function () {
						console.log('Клонируем репозиторий «' + repository.alias + '»');
						return exec('hg clone ' + repository.address + ' ' + repositoryPath);
					})
					.done(function () {
						console.log('Клонирование «' + repository.alias + '» завершено');
						deferred.resolve(null);
					});
				return deferred.promise;
			}

			// Инициализируем все репозитории
			for (i = 0; i < settings.repositories.length; i++) {
				var repository = settings.repositories[i];
				asyncs.push(initRepo(repository));
			}

			// Инициализируем svn
			asyncs.push(function () {
				var deferred = Q.defer();
				console.log('Создаём директорию для svn');
				exec('rm -rf ' + svnDir)
					.then(exec('mkdir -p ' + svnDir))
					.then(function () {
						console.log('Загружаем svn');
						return exec('svn co ' + settings.svn + ' ' + svnDir);
					})
					.done(function () {
						console.log('svn co завершено');
						deferred.resolve(null);
					});
				return deferred.promise;
			}());

			// Выполняем всё асинхронно
			Q.all(asyncs).done(function () {
				console.log('Инициализация репозиториев завершена');
				deferred.resolve(null);
			});
		});
		return deferred.promise;
	}

	/**
	 * Достаёт текущие настройки
	 * @returns {Q.Promise<null>}
	 */
	function getSettings() {
		var deferred = Q.defer();
		readFile('data/settings.json', 'utf8').done(function (data) {
			deferred.resolve(JSON.parse(data));
		});
		return deferred.promise;
	}

	return {
		initAll: initAll,
		getReposData: getReposData,
		getSettings: getSettings
	};

})();

module.exports = helper;
