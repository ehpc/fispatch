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


	function createRepoDiff(snapshotSettings) {
		var deferred = Q.defer();
		console.log('Создаём патч для репозитория «' + snapshotSettings.alias + '»');
		readFile('data/settings.json', 'utf8').done(function (data) {
			var settings = JSON.parse(data),
				tempDir = settings.temp;
			// Находим настройки для репозитория
			settings.repositories.forEach(function (repository) {
				if (repository.alias === snapshotSettings.alias) {
					// Временная директория изменённых файлов репозитория
					var filesTempDir = path.join(tempDir, 'files_temp/' + snapshotSettings.alias);
					// Если собираем ветку целиком
					if (snapshotSettings.type === 'branch') {
						console.log('Собираем ветку целиком для репозитория «' + snapshotSettings.alias + '»');
						// Устанавливаем нужную ветку
						switchBranch(repository, tempDir, snapshotSettings.branch)
							.then(function () {
								// Достаём ревизии ветки
								return getBranchRevisions(repository, tempDir, snapshotSettings.branch);
							})
							.then(function (revs) {
								console.log('Ревизии репозитория «' + snapshotSettings.alias + '»', revs);
								console.log('Копируем изменённые файлы репозитория «' + snapshotSettings.alias + '»');
								return copyChangesFilesToTemp(repository, tempDir, revs, filesTempDir);
							})
							.done(function () {
								console.log('Скопировали изменённые файлы репозитория «' + snapshotSettings.alias + '» в директорию «' + filesTempDir + '»');
								deferred.resolve();
							});
					}
					// Если собираем диапазон ревизий
					else if (snapshotSettings.type === 'rev') {
						console.log('Собираем диапазон ревизий для репозитория «' + snapshotSettings.alias + '»');
					}
					else {
						console.log('Неверный формат сборки репозитория «' + snapshotSettings.alias + '»');
						deferred.resolve(null);
					}
				}
			});
		});
		return deferred.promise;
	}

	/**
	 * Очищает временную директорию измененных файлов
	 * @returns {Q.Promise<null>}
	 */
	function cleanFilesTempDir() {
		var deferred = Q.defer();
		readFile('data/settings.json', 'utf8').done(function (data) {
			var settings = JSON.parse(data),
				tempDir = settings.temp,
				filesTempDirBase = path.join(tempDir, 'files_temp/');
			// Чистим временную директорию изменённых файлов
			exec('rm -rf "' + filesTempDirBase + '"').done(function () {
				return deferred.resolve(null);
			});
		});
		return deferred.promise;
	}

	/**
	 * Создаёт архив патча
	 * @param patchName Название патча
	 * @param downloadsDir Директория, в которую будет помещён архив
	 * @returns {Q.Promise<String>}
	 */
	function createArchive(patchName, downloadsDir) {
		var deferred = Q.defer();
		readFile('data/settings.json', 'utf8').done(function (data) {
			var settings = JSON.parse(data),
				tempDir = settings.temp,
				filesTempDirBase = path.join(tempDir, 'files_temp/'),
				archName = Date.now() + '_' + patchName + '.tar.gz',
				archFullName = path.join(downloadsDir, archName);
			exec('tar -czf "' + archFullName + '" -C "' + filesTempDirBase + '" .').done(function () {
				deferred.resolve(archName);
			});
		});
		return deferred.promise;
	}

	/**
	 * Находит изменённые файлы и копирует их во временную директорию
	 * @param repository Репозиторий
	 * @param tempDir Временная директория
	 * @param revs Объект с ревизиями
	 * @param filesTempDir Временная директория назначения
	 * @returns {Q.Promise<null>}
	 */
	function copyChangesFilesToTemp(repository, tempDir, revs, filesTempDir) {
		var deferred = Q.defer(),
			changedFiles = [],
			repositoryPath = path.join(tempDir, repository.alias);
		// Получаем изменённые файлы
		getChangedFiles(repository, tempDir, revs.startRev, revs.endRev)
			.then(function (files) {
				console.log('Изменённые файлы репозитория «' + repository.alias + '»', files);
				changedFiles = files;
				// Создаём временную директорию
				return exec('rm -rf ' + filesTempDir);
			})
			.then(function () {
				return exec('mkdir -p ' + filesTempDir);
			})
			.then(function () {
				var asyncs1 = [],
					asyncs2 = [];
				console.log('Создали временную директорию «' + filesTempDir + '»');
				// Копируем файлы, создавая необходимые директории
				changedFiles.forEach(function (file) {
					var source = path.join(repositoryPath, file),
						dest = path.join(filesTempDir, file),
						destDir = path.dirname(path.join(filesTempDir, file));
					asyncs1.push(exec('mkdir -p "' + destDir + '"'));
					asyncs2.push(exec('cp "' + source + '" "' + dest + '"'));
				});
				return Q.all(asyncs1).done(function () {
					return Q.all(asyncs2);
				});
			})
			.done(function () {
				deferred.resolve();
			});
		return deferred.promise;
	}

	/**
	 * Возвращает список изменённых между ревизиями файлов. Начальная ревизия исключается из поиска.
	 * @param repository Репозиторий
	 * @param tempDir Временная директория
	 * @param startRev Начальная ревизия
	 * @param endRev Конечная ревизия
	 * @returns {Q.Promise<Array>}
	 */
	function getChangedFiles(repository, tempDir,startRev, endRev) {
		var repositoryPath = path.join(tempDir, repository.alias),
			deferred = Q.defer();
		console.log('Находим изменённые файлы для репозитория «' + repository.alias + '»');
		exec('hg status -A --rev ' + startRev + ':' + endRev + ' -R ' + repositoryPath)
			.done(function (out) {
				// Команда вернула нам список файлов с их статусами в репозитории
				var fileStatuses = out[0].split("\n"),
					fileNames = [];
				// Для всех файлов в списке
				fileStatuses.forEach(function (fileStatus) {
					var rx = new RegExp('(.+)\\s+(.+)', 'g'),
						res;
					while ((res = rx.exec(fileStatus)) !== null) {
						// Если файл был модифицирован или добавлен
						if (res[1] === 'M' || res[1] === 'A') {
							fileNames.push(res[2]);
						}
					}
				});
				deferred.resolve(fileNames);
			});
		return deferred.promise;
	}

	/**
	 * Достаёт хеши родительской и последней ревизий ветки
	 * @param repository Репозиторий
	 * @param tempDir Временная директория
	 * @param branch Ветка
	 * @returns {Q.Promise<Object>}
	 */
	function getBranchRevisions(repository, tempDir, branch) {
		var repositoryPath = path.join(tempDir, repository.alias),
			deferred = Q.defer(),
			startRev, endRev;
		console.log('Вычисляем обрамляющие ревизии репозитория «' + repository.alias + '» для ветки «' + branch + '»');
		exec('hg log -r "parents(min(branch(\'' + branch + '\')))" --template "{node}\n" -R ' + repositoryPath)
			.then(function (out) {
				startRev = out[0].split("\n")[0];
				return exec('hg log -r "max(branch(\'' + branch + '\'))" --template "{node}\n" -R ' + repositoryPath);
			})
			.done(function (out) {
				endRev = out[0].split("\n")[0];
				deferred.resolve({
					startRev: startRev,
					endRev: endRev
				});
			});
		return deferred.promise;
	}

	/**
	 * Меняем активную ветку репозитория
	 * @param repository Репозиторий
	 * @param tempDir Временная директория
	 * @param branch Название ветки
	 * @returns {Q.Promise<null>}
	 */
	function switchBranch(repository, tempDir, branch) {
		var repositoryPath = path.join(tempDir, repository.alias),
			deferred = Q.defer();
		console.log('Меняем ветку репозитория «' + repository.alias + '» на «' + branch + '»');
		exec('hg update --clean "' + branch + '" -R ' + repositoryPath)
			.done(function () {
				deferred.resolve(null);
			});
		return deferred.promise;
	}

	/**
	 * Получает данные о репозиториях
	 * @returns {Q.Promise<null>}
	 */
	function getReposData() {
		var deferred = Q.defer();

		readFile('data/settings.json', 'utf8').done(function (data) {
			var settings = JSON.parse(data),
				tempDir = settings.temp,
				i;

			initAllIfNeeded().done(function () {
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
					Пример структуры данных:
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
							while ((res = rx.exec(out[0])) !== null) {
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
							while ((res = rx.exec(out[0])) !== null) {
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
					asyncs0.push(updateRepo(repository, tempDir));
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
	 * Обновляет все репозитории
	 * @returns {Q.Promise<null>}
	 */
	function updateAll() {
		var deferred = Q.defer();
		readFile('data/settings.json', 'utf8').done(function (data) {
			var settings = JSON.parse(data),
				tempDir = settings.temp,
				asyncs = [];
			settings.repositories.forEach(function (repo) {
				asyncs.push(updateRepo(repo, tempDir));
			});
			Q.all(asyncs).done(function () {
				deferred.resolve(null);
			});
		});
		return deferred.promise;
	}

	/**
	 * Обновляет указанный репозиторий
	 * @param repository Репозиторий
	 * @param tempDir Временная директория
	 * @returns {Q.Promise<null>}
	 */
	function updateRepo(repository, tempDir) {
		var repositoryPath = path.join(tempDir, repository.alias),
			deferred = Q.defer();
		console.log('Затягиваем изменения репозитория «' + repository.alias + '»');
		exec('hg pull --force -R ' + repositoryPath)
			.then(function () {
				console.log('Обновляем репозиторий «' + repository.alias + '»');
				return exec('hg update --clean -R ' + repositoryPath);
			})
			.done(function () {
				deferred.resolve(null);
			});
		return deferred.promise;
	}

	/**
	 * Инициализирует репозитории при необходимости
	 * @returns {Q.Promise<null>}
	 */
	function initAllIfNeeded() {
		var deferred = Q.defer();
		readFile('data/settings.json', 'utf8').done(function (data) {
			var settings = JSON.parse(data),
				tempDir = settings.temp,
				i, needInit = false;
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
					deferred.resolve(null);
				});
			}
			// Если загружены
			else {
				deferred.resolve(null);
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
					.then(function () {
						return exec('mkdir -p ' + repositoryPath);
					})
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
					.then(function () {
						return exec('mkdir -p ' + svnDir);
					})
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
		initAllIfNeeded: initAllIfNeeded,
		getReposData: getReposData,
		getSettings: getSettings,
		updateAll: updateAll,
		createRepoDiff: createRepoDiff,
		createArchive: createArchive,
		cleanFilesTempDir: cleanFilesTempDir
	};

})();

module.exports = helper;
