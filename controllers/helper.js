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
 * @property svnWebDirName
 * @property hgCommand
 * @property processMaxBuffer
 * @property cloneRev
 * @property revisionsLimit
 */
var helper = helper || (function () {
	'use strict';

	var Q = require('q'),
		fs = require('fs'),
		path = require('path'),
		childProcess = require('child_process'),
		exec = Q.denodeify(childProcess.exec),
		readFile = Q.denodeify(fs.readFile),
		colorsModule = require('controllers/colors'),
		execOptions = {
			maxBuffer: 250000
		},
		hgCommand = 'hg';

	// Считываем необходимые настройки
	readFile('data/settings.json', 'utf8').done(function (data) {
		var settings = JSON.parse(data);
		hgCommand = settings.hgCommand;
		execOptions.maxBuffer = settings.processMaxBuffer;
		console.log('maxBuffer', execOptions.maxBuffer);
	});

	/**
	 * Последовательно выполняемые промисы
	 * @returns {*}
	 */
	function sequentialPromises() {
		var i, generators = [], result = new Q(true), results = [];
		for (i = 0; i < arguments.length; i++) {
			generators.push(arguments[i]);
		}
		generators.forEach(function (f) {
			result = result.then(function (value) {
				results.push(value);
				return f.call(this);
			}, function () {
				results.push(null);
				return f.call(this);
			});
		});
		return result.then(function (value) {
			return results.concat(value).slice(1);
		}, function () {
			return results.concat(null).slice(1);
		});
	}

	/**
	 * Возвращает путь до файлов репозитория по его псевдониму
	 * @param alias Псевдоним
	 * @param type Тип пути (repo, patch)
	 * @returns {*}
	 */
	function getFilesDirByRepoAlias(alias, type) {
		return Q.Promise(function (resolve) {
			readFile('data/settings.json', 'utf8').done(function (data) {
				var settings = JSON.parse(data),
					tempDir = settings.temp,
					patchDir = path.join(tempDir, 'files_temp', 'patch'),
					distribDir = path.join(tempDir, 'files_temp', 'distrib');
				if (type === 'repo') {
					resolve(path.join(tempDir, alias));
				}
				else if (type === 'patch') {
					resolve(path.join(patchDir, alias));
				}
				else if (type === 'distrib') {
					resolve(path.join(distribDir, alias));
				}
				else {
					resolve(path.join(tempDir, 'files_temp'));
				}
			});
		});
	}

	/**
	 * Основная функция для создания патча
	 * @param snapshotSettings Настройки сборки
	 * @returns {Q.Promise<null>}
	 */
	function createRepoDiff(snapshotSettings, patchName) {
		var deferred = Q.defer();
		console.log('Создаём патч для репозитория «' + snapshotSettings.alias + '»');
		readFile('data/settings.json', 'utf8').done(function (data) {
			var settings = JSON.parse(data),
				tempDir = settings.temp;
			// Находим настройки для репозитория
			settings.repositories.forEach(function (repository) {
				if (repository.alias === snapshotSettings.alias) {
					// Временная директория изменённых файлов репозитория
					var filesTempDirBase = path.join(tempDir, 'files_temp'),
						filesTempDir = path.join(filesTempDirBase, snapshotSettings.alias);
					// Если собираем ветку целиком
					if (snapshotSettings.type === 'branch') {
						console.log('Собираем ветку целиком для репозитория «' + snapshotSettings.alias + '»');
						// Сборка дистрибутива по необходимости
						createDistrib(snapshotSettings, snapshotSettings.branch, repository, tempDir, filesTempDirBase).done(function () {
							// Сборка патча
							console.log('Собираем патч');
							// Устанавливаем нужную ветку
							switchBranch(repository, tempDir, snapshotSettings.branch)
								.then(function () {
									// Достаём ревизии ветки
									return getBranchRevisions(repository, tempDir, snapshotSettings.branch);
								})
								.then(function (revs) {
									console.log('Ревизии репозитория «' + snapshotSettings.alias + '»', revs);
									console.log('Копируем изменённые файлы репозитория «' + snapshotSettings.alias + '»');
									return copyChangesFilesToTemp(repository, tempDir, revs, path.join(filesTempDirBase, 'patch', snapshotSettings.alias), patchName, snapshotSettings.branch);
								})
								.done(function () {
									console.log('Скопировали изменённые файлы репозитория «' + snapshotSettings.alias + '»');
									deferred.resolve(null);
								});
						});
					}
					// Если собираем диапазон ревизий
					else if (snapshotSettings.type === 'rev') {
						console.log('Собираем по указанным ревизиям');
						// Сборка дистрибутива
						createDistrib(snapshotSettings, snapshotSettings.endRev, repository, tempDir, filesTempDirBase).done(function () {
							// Сборка патча
							// Устанавливаем нужную ревизию
							updateToRevision(repository, tempDir, snapshotSettings.endRev)
								.then(function () {
									console.log('Собираем диапазон ревизий для репозитория «' + snapshotSettings.alias + '»');
									console.log('Копируем изменённые файлы репозитория «' + snapshotSettings.alias + '»');
									return copyChangesFilesToTemp(repository, tempDir, snapshotSettings, path.join(filesTempDirBase, 'patch', snapshotSettings.alias), patchName);
								})
								.done(function () {
									console.log('Скопировали изменённые файлы репозитория «' + snapshotSettings.alias + '»');
									deferred.resolve(null);
								});
						});
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
	 * Вспомогательная функция сборки дистрибутива
	 * @param snapshotSettings Настройки сборки
	 * @param baseRev Начальная ревизия
	 * @param repository Репозиторий
	 * @param tempDir Временная директория
	 * @param filesTempDir Временная директория назначения
	 * @returns {Q.Promise<null>}
	 */
	function createDistrib(snapshotSettings, baseRev, repository, tempDir, filesTempDir) {
		var deferred = Q.defer();
		if (snapshotSettings.distrib === 'true') {
			console.log('Собираем дистрибутив');
			// Устанавливаем нужную ветку
			switchBranch(repository, tempDir, baseRev)
				.then(function () {
					console.log('Копируем файлы');
					// Копируем все файлы
					return copyAllFilesToTemp(repository, tempDir, path.join(filesTempDir, 'distrib', snapshotSettings.alias));
				})
				.done(function () {
					console.log('Скопировали все файлы репозитория «' + snapshotSettings.alias + '» в директорию «' + filesTempDir + '»');
					deferred.resolve(null);
				});
		}
		else {
			deferred.resolve(null);
		}
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
			exec('rm -rf "' + filesTempDirBase + '"', execOptions).done(function () {
				return deferred.resolve(null);
			});
		});
		return deferred.promise;
	}

	/**
	 * Очищает SVN-репозиторий от незакоммиченных файлов
	 * @returns {Q.Promise<null>}
	 */
	function cleanupSvn() {
		var deferred = Q.defer();
		readFile('data/settings.json', 'utf8').done(function (data) {
			var settings = JSON.parse(data),
				tempDir = settings.temp,
				svnDir = path.join(tempDir, 'svn');
			console.log('Очищаем SVN');
			exec('cd ' + svnDir + " && svn st | grep '^?' | awk '{print $2}' | xargs rm -rf", execOptions)
				.done(function () {
					deferred.resolve(null);
				});
		});
		return deferred.promise;
	}

	/**
	 * Обновляет репозиторий SVN
	 * @returns {Q.Promise<null>}
	 */
	function updateSvn() {
		var deferred = Q.defer();
		readFile('data/settings.json', 'utf8').done(function (data) {
			var settings = JSON.parse(data),
				tempDir = settings.temp,
				svnDir = path.join(tempDir, 'svn');
			console.log('Обновляем SVN');
			exec('cd ' + svnDir + " && svn cleanup && svn update", execOptions)
				.done(function () {
					deferred.resolve(null);
				});
		});
		return deferred.promise;
	}

	/**
	 * Тихий exec не прерывающий цепочки обещаний
	 * @param cmd Команда
	 * @returns {Q.Promise<Boolean>}
	 */
	function execQuiet(cmd) {
		var deferred = Q.defer();
		exec(cmd, execOptions)
			.fail(function () {
				deferred.resolve(false);
			})
			.done(function () {
				deferred.resolve(true);
			});
		return deferred.promise;
	}

	/**
	 * Залить изменения в SVN
	 * @param patchName Имя патча
	 * @returns {Q.Promise<String>}
	 */
	function pushToSvn(patchName) {
		var deferred = Q.defer();
		readFile('data/settings.json', 'utf8').done(function (data) {
			var settings = JSON.parse(data),
				tempDir = settings.temp,
				svnDir = path.join(tempDir, 'svn'),
				svnCommitDir = path.join(svnDir, patchName, settings.svnWebDirName),
				filesTempDirBase = path.join(tempDir, 'files_temp/'),
				svnDate = '',
				noDelete = false;
			// Очищаем SVN
			cleanupSvn()
				// Обновляемся
				.then(function () {
					return updateSvn();
				})
				// Удаляем старую директорию, если есть
				.then(function () {
					console.log('Создаём директорию в SVN для записи патча');
					return execQuiet('cd ' + svnDir + ' && svn delete --force ' + svnCommitDir);
				})
				.then(function (deleted) {
					if (deleted) {
						return exec('cd ' + svnDir + ' && svn commit -m "Удалили старую версию патча «' + patchName + '»"', execOptions);
					}
					else {
						noDelete = true;
						return Q.fcall(function () {
							return true;
						});
					}
				})
				// Создаём директорию, в которую пойдут файлы патча
				.then(function () {
					if (noDelete) {
						return Q.fcall(function () {
							return true;
						});
					}
					else {
						return exec('rm -rf "' + svnCommitDir + '"', execOptions);
					}
				})
				.then(function () {
					return exec('mkdir -p "' + svnCommitDir + '"', execOptions);
				})
				// Копируем файлы в директорию SVN
				.then(function () {
					console.log('Копируем патч в SVN');
					return exec('cp -r ' + filesTempDirBase + '. ' + svnCommitDir, execOptions);
				})
				// Добавляем всё под контроль репозитория
				.then(function () {
					return exec('cd ' + svnDir + ' && svn add --force .', execOptions);
				})
				// Коммитим изменения
				.then(function () {
					console.log('Делаем коммит в SVN');
					svnDate = getDateTimeString();
					return exec('cd ' + svnDir + ' && svn commit -m "Создаём патч «' +
						patchName + '». Дата: ' + svnDate + '."', execOptions);
				})
				.done(function () {
					console.log('Изменения, вероятно, запушены в SVN');
					deferred.resolve(svnDate);
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
		console.log('Before createArchive');
		readFile('data/settings.json', 'utf8').done(function (data) {
			console.log('createArchive', patchName, downloadsDir);
			var settings = JSON.parse(data),
				tempDir = settings.temp,
				filesTempDirBase = path.join(tempDir, 'files_temp/'),
				archName = getDateTimeString() + '_' + patchName + '.tar.gz',
				archFullName = path.join(downloadsDir, archName);
			console.log('tar -czf "' + archFullName + '" -C "' + filesTempDirBase + '" .');
			exec('tar -czf "' + archFullName + '" -C "' + filesTempDirBase + '" .', execOptions).done(function () {
				console.log('tar закончен');
				deferred.resolve(archName);
			});
		});
		return deferred.promise;
	}

	/**
	 * Копирует все файлы репозитория во временную директорию
	 * @param repository Репозиторий
	 * @param tempDir Временная директория
	 * @param filesTempDir Временная директория назначения
	 * @returns {Q.Promise<null>}
	 */
	function copyAllFilesToTemp(repository, tempDir, filesTempDir) {
		var deferred = Q.defer(),
			exclude = repository.exclude || [],
			repositoryPath = path.join(tempDir, repository.alias);
		// Создаём временную директорию
		exec('rm -rf ' + filesTempDir, execOptions)
			.then(function () {
				return exec('mkdir -p ' + filesTempDir, execOptions);
			})
			.then(function () {
				console.log('Создали временную директорию «' + filesTempDir + '»');
				// Копируем файлы
				return exec('rsync -a --exclude=\'.hg\' ' + repositoryPath + '/. ' + filesTempDir, execOptions);
			})
			.then(function () {
				var asyncs = [];
				exclude.forEach(function (pattern) {
					console.log('Чистим исключаемые файлы и папки «' + 'find ' + filesTempDir + ' -regex "' + filesTempDir + '/' + pattern + '.*" -exec rm -rf {} \\;' + '»');
					asyncs.push(exec('find ' + filesTempDir + ' -regex "' + filesTempDir + '/' + pattern + '.*" -exec rm -rf {} \\;', execOptions));
				});
				return sequentialPromises.apply(this, asyncs);
			})
			.done(function () {
				deferred.resolve(null);
			});
		return deferred.promise;
	}

	/**
	 * Находит изменённые файлы и копирует их во временную директорию
	 * @param repository Репозиторий
	 * @param tempDir Временная директория
	 * @param revs Объект с ревизиями
	 * @param filesTempDir Временная директория назначения
	 * @param patchName
	 * @param branch Собираемая ветка
	 * @returns {Q.Promise<null>}
	 */
	function copyChangesFilesToTemp(repository, tempDir, revs, filesTempDir, patchName, branch) {
		var deferred = Q.defer(),
			changedFiles = [],
			repositoryPath = path.join(tempDir, repository.alias),
			asyncs1 = [],
			asyncs2 = [],
			cmdParts = 10,
			asyncs1Cmd = '',
			asyncs2Cmds = [],
			stat = '';
		// Получаем изменённые файлы
		getChangedFiles(repository, tempDir, revs.startRev, revs.endRev, branch)
			.then(function (files) {
				console.log('Изменённые файлы репозитория «' + repository.alias + '»', files.length, 'штук');
				changedFiles = files;
				fs.writeFileSync('logs/changed_files.txt', files.join('\n'));
				// Создаём временную директорию
				return exec('rm -rf ' + filesTempDir, execOptions);
			})
			.then(function () {
				return exec('mkdir -p ' + filesTempDir, execOptions);
			})
			.then(function () {
				console.log('Создали временную директорию «' + filesTempDir + '»');
				var deferred1 = Q.defer(), asyncs2Cmd = '';
				// Копируем файлы, создавая необходимые директории
				changedFiles.forEach(function (file) {
					var source = path.join(repositoryPath, file).replace('$', '\\$'),
						dest = path.join(filesTempDir, file).replace('$', '\\$'),
						destDir = path.dirname(path.join(filesTempDir, file));
					asyncs1Cmd += 'mkdir -p "' + destDir + '"; ';
					asyncs2Cmd += 'cp "' + source + '" "' + dest + '"; ';
					stat += file + '$"\n" ';
					if (asyncs2Cmd.length > 100000) {
						asyncs2Cmds.push(asyncs2Cmd);
						asyncs2Cmd = '';
					}
				});
				// Добавляем остатки
				if (asyncs2Cmd) {
					asyncs2Cmds.push(asyncs2Cmd);
				}
				fs.writeFileSync('logs/stat.txt', stat);
				childProcess.exec(asyncs1Cmd, execOptions, function (error, stdout, stderr) {
					console.log('asyncs1Cmd DONE');
					fs.writeFileSync('logs/asyncs1Cmd.txt', asyncs1Cmd + '\n\n>>>\n' + error + '\n\n>>>\n' + stdout + '\n\n>>>\n' + stderr);
					deferred1.resolve(true);
				});
				console.log('Создаём структуру директорий');
				return deferred1.promise;
			})
			.then(function () {
				var defers = [], promises = [], i;
				console.log('Создали структуру директорий, копируем файлы');
				console.log('Количество суб-процессов: ' + asyncs2Cmds.length);
				function exeCbWrapper(defer, i) {
					return function execCb(error, stdout, stderr) {
						console.log('asyncs2Cmd' + i + ' DONE');
						fs.writeFileSync('logs/asyncs2Cmd' + i + '.txt', asyncs2Cmds[i] + '\n\n>>>\n' + error + '\n\n>>>\n' + stdout + '\n\n>>>\n' + stderr);
						defer.resolve(true);
					};
				}
				for (i = 0; i < asyncs2Cmds.length; i++) {
					defers[i] = Q.defer();
					promises[i] = defers[i].promise;
					childProcess.exec(asyncs2Cmds[i], execOptions, exeCbWrapper(defers[i], i));
				}
				return Q.all(promises);
			})
			.then(function () {
				console.log('Пишем статистику в version.txt');
				if (repository.withVersion) {
					return exec(
						'echo patchName: ' + patchName + '$"\n"end revision: ' + revs.endRev + '$"\n"' +
						'-------------- Changed files-----------------$"\n" ' +
						stat + '----------------------------- > ' + filesTempDir + '/version.txt', execOptions
					);
				}
				else {
					return true;
				}
			})
			.done(function () {
				console.log('Завершили копирование файлов');
				deferred.resolve(null);
			});
		return deferred.promise;
	}

	/**
	 * Возвращает список изменённых между ревизиями файлов. Начальная ревизия исключается из поиска.
	 * @param repository Репозиторий
	 * @param tempDir Временная директория
	 * @param startRev Начальная ревизия
	 * @param endRev Конечная ревизия
	 * @param branch Собираемая ветка
	 * @returns {Q.Promise<Array>}
	 */
	function getChangedFiles(repository, tempDir, startRev, endRev, branch) {
		var repositoryPath = path.join(tempDir, repository.alias),
			deferred = Q.defer(),
			branchFilter = branch ? 'branch(' + branch + ')' : startRev + ':' + endRev,
			hgFilter = repository.hgFilter || '',
			exclude = repository.exclude || [];
		// hg log --template "{join(file_adds,'\n')}\n{join(file_mods,'\n')}\n" --rev "a00e68e1f1af:f72c26489b27 and not grep(Слияние)" -R /srv/www/temp/fcs | sort | uniq -u
		console.log('Находим изменённые файлы для репозитория «' + repository.alias + '»',
			hgCommand + ' log --template "{join(file_adds,\'\\n\')}\\n{join(file_mods,\'\\n\')}\\n" --rev "' + branchFilter + ' ' + hgFilter + '" -R ' + repositoryPath + ' | sort | uniq');
		exec(hgCommand + ' log --template "{join(file_adds,\'\\n\')}\\n{join(file_mods,\'\\n\')}\\n" --rev "' + branchFilter + ' ' + hgFilter + '" -R ' + repositoryPath + ' | sort | uniq', execOptions)
			.done(function (out) {
				// Команда вернула нам список файлов с их статусами в репозитории
				var files = out[0].split("\n"),
					fileNames = [];
				// Для всех файлов в списке
				files.forEach(function (file) {
					var excludeFile = false;
					if (file) {
						exclude.forEach(function (pattern) {
							var rx = new RegExp('^' + pattern, 'mg');
							if (file.match(rx)) {
								excludeFile = true;
							}
						});
						if (!excludeFile) {
							fileNames.push(file);
						}
					}
				});
				fs.writeFileSync('logs/fileNames.txt', fileNames.join('\n'));
				deferred.resolve(fileNames);
			});

		/*console.log('Находим изменённые файлы для репозитория «' + repository.alias + '»', hgCommand + ' status -A --rev ' + startRev + ':' + endRev + ' -R ' + repositoryPath);
		exec(hgCommand + ' status -A --rev ' + startRev + ':' + endRev + ' -R ' + repositoryPath, execOptions)
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
				fs.writeFileSync('logs/fileNames.txt', fileNames.join('\n'));
				deferred.resolve(fileNames);
			});*/
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
		console.log('Вычисляем обрамляющие ревизии репозитория «' + repository.alias + '» для ветки «' + branch + '»', 'hg log -r "parents(min(branch(\'' + branch + '\')))" --template "{node}\n" -R ' + repositoryPath);
		exec(hgCommand + ' log -r "min(branch(\'' + branch + '\'))" --template "{node}\n" -R ' + repositoryPath, execOptions)
			.then(function (out) {
				startRev = out[0].split("\n")[0];
				console.log('Вычисляем конечную ревизию', 'hg log -r "max(branch(\'' + branch + '\'))" --template "{node}\n" -R ' + repositoryPath);
				return exec(hgCommand + ' log -r "max(branch(\'' + branch + '\'))" --template "{node}\n" -R ' + repositoryPath, execOptions);
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
		console.log('Меняем ветку репозитория «' + repository.alias + '» на «' + branch + '»', hgCommand + ' update --clean "' + branch + '" -R ' + repositoryPath);
		exec(hgCommand + ' update --clean "' + branch + '" -R ' + repositoryPath, execOptions)
			.done(function () {
				deferred.resolve(null);
			});
		return deferred.promise;
	}

	/**
	 * Делаем активной указанную ревизию
	 * @param repository Репозиторий
	 * @param tempDir Временная директория
	 * @param revision Ревизия
	 * @returns {Q.Promise<null>}
	 */
	function updateToRevision(repository, tempDir, revision) {
		var repositoryPath = path.join(tempDir, repository.alias),
			deferred = Q.defer();
		console.log('Меняем текущую ревизию репозитория «' + repository.alias + '» на «' + revision + '»');
		exec(hgCommand + ' update --clean -r "' + revision + '" -R ' + repositoryPath, execOptions)
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
						i, colors, branchName;
					console.log('Получаем список веток для репозитория «' + repository.alias + '»', 'hg branches -R ' + repositoryPath);
					exec(hgCommand + ' branches -c -R ' + repositoryPath, execOptions)
						.done(function (out) {
							var rx = new RegExp('(.+)\\s+(\\d+):(\\w+)', 'ig'),
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
								branchName = trimStr(res[1]);
								data[repository.alias].branches.push(branchName);
								data[repository.alias].branchesMetadata[branchName] = {
									name: branchName
								};
							}
							// Задаём цвета для веток
							colors = colorsModule.getColors(data[repository.alias].branches.length);
							for (i = 0; i < data[repository.alias].branches.length; i++) {
								data[repository.alias].branchesMetadata[data[repository.alias].branches[i]].color = colors[i];
							}
							console.log('<<<Получили список веток для репозитория «' + repository.alias + '»');
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
					console.log('Получаем список ревизий для репозитория «' + repository.alias + '»', hgCommand + ' log --limit 100 --debug --template "rev:{rev};; branch:{branches};; node:{node};; desc:{desc|firstline};; parents:{parents};;\n" -R ' + repositoryPath);
					exec(hgCommand + ' log --limit ' + repository.revisionsLimit + ' --debug --template "rev:{rev};; branch:{branches};; node:{node};; desc:{desc|firstline};; parents:{parents};;\n" -R ' + repositoryPath, execOptions)
						.done(function (out) {
							var rx = new RegExp('rev:(\\d+);; branch:([^;]*);; node:(\\w+);; desc:(.+);; parents:[-\\d]+:(\\w+) .+;;', 'ig'),
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
								var branchName = trimStr(res[2]),
									descTrimmed = res[4].substr(0, 38);
								if (!branchName) {
									branchName = 'default';
								}
								if (!data[repository.alias].branchesMetadata[branchName]) {
									console.error('Нет данных для репозитория ' + repository.alias + ' и ветки ' + branchName);
									console.error(JSON.stringify(data[repository.alias]));
								}
								// Добавляем ревизию в список
								data[repository.alias].revisions.push({
									rev: res[1],
									branch: branchName,
									node: res[3],
									desc: descTrimmed + ((descTrimmed.length < res[4].length) ? '...' : ''),
									parent1: res[5],
									color: data[repository.alias].branchesMetadata[branchName].color
								});
							}
							console.log('<<<Получили список ревизий для репозитория «' + repository.alias + '»');
							deferred.resolve(null);
						});
					return deferred.promise;
				}

				// Проходимся по всем репозиториям
				console.log('updateRepo');
				for (i = 0; i < settings.repositories.length; i++) {
					// Предварительно обновим репозитории
					asyncs0.push(updateRepo(settings.repositories[i], tempDir));
				}
				Q.all(asyncs0).done(function () {
					console.log('getBranches');
					for (i = 0; i < settings.repositories.length; i++) {
						// Создаём стек функций, которые достанут данные о ветках репозитория
						asyncs1.push(getBranches(settings.repositories[i]));
					}
					Q.all(asyncs1).done(function () {
						console.log('getRevisions');
						for (i = 0; i < settings.repositories.length; i++) {
							// Создаём стек функций, которые достанут данные о ревизиях
							asyncs2.push(getRevisions(settings.repositories[i]));
						}
						Q.all(asyncs2).done(function () {
							// Сортируем репозитории и дополняем объекты данными
							var ordered = {};
							for (i = 0; i < settings.repositories.length; i++) {
								ordered[settings.repositories[i].alias] = data[settings.repositories[i].alias];
								ordered[settings.repositories[i].alias].hidden = settings.repositories[i].hidden;
							}
							data = ordered;
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
		console.log('Затягиваем изменения репозитория «' + repository.alias + '»', hgCommand + ' pull --force -R ' + repositoryPath);
		exec(hgCommand + ' pull --force -R ' + repositoryPath, execOptions)
			.then(function () {
				console.log('Обновляем репозиторий «' + repository.alias + '»', 'hg update --quiet --clean -R ' + repositoryPath);
				return exec(hgCommand + ' update --quiet --clean -R ' + repositoryPath, execOptions);
			})
			.done(function () {
				console.log('<<<Затянули изменения репозитория «' + repository.alias + '»');
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
				exec('rm -rf ' + repositoryPath, execOptions)
					.then(function () {
						return exec('mkdir -p ' + repositoryPath, execOptions);
					})
					// Клонируем репозиторий
					.then(function () {
						console.log('Клонируем репозиторий «' + repository.alias + '»', hgCommand + ' clone -r ' + repository.cloneRev + ' ' + repository.address + ' ' + repositoryPath);
						return exec(hgCommand + ' clone -r ' + repository.cloneRev + ' ' + repository.address + ' ' + repositoryPath, execOptions);
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
			/*asyncs.push(function () {
				var deferred = Q.defer();
				console.log('Создаём директорию для svn');
				exec('rm -rf ' + svnDir, execOptions)
					.then(function () {
						return exec('mkdir -p ' + svnDir, execOptions);
					})
					.then(function () {
						console.log('Загружаем svn', settings.svn, svnDir);
						return exec('svn co -q ' + settings.svn + ' ' + svnDir, execOptions);
					})
					.done(function () {
						console.log('svn co завершено');
						deferred.resolve(null);
					});
				return deferred.promise;
			}());*/

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

	/**
	 * Возвращает текущую дату в формате «Y.m.d.h.m.s»
	 * @returns {string} Дата в виде строки
	 */
	function getDateTimeString() {
		function pad(num, size) {
			var s = "000000000" + num;
			return s.substr(s.length-size);
		}
		var date = new Date(),
			res = '';
		res += date.getFullYear() + '.' + pad(date.getMonth() + 1, 2) + '.' + pad(date.getDate(), 2) + '.' +
				pad(date.getHours(), 2) + '.' + pad(date.getMinutes(), 2) + '.' + pad(date.getSeconds(), 2);
		return res;
	}

	/**
	 * Удаляет пробелы в начале и конце строки
	 * @returns {String}
	 */
	function trimStr(str) {
		return str.replace(/^\s+|\s+$/g, '');
	}

	return {
		initAll: initAll,
		initAllIfNeeded: initAllIfNeeded,
		getReposData: getReposData,
		getSettings: getSettings,
		updateAll: updateAll,
		createRepoDiff: createRepoDiff,
		createArchive: createArchive,
		cleanFilesTempDir: cleanFilesTempDir,
		pushToSvn: pushToSvn,
		getFilesDirByRepoAlias: getFilesDirByRepoAlias,
		sequentialPromises: sequentialPromises
	};

})();

if (!String.prototype.endsWith) {
	String.prototype.endsWith = function(searchString, position) {
		var subjectString = this.toString();
		if (typeof position !== 'number' || !isFinite(position) || Math.floor(position) !== position || position > subjectString.length) {
			position = subjectString.length;
		}
		position -= searchString.length;
		var lastIndex = subjectString.indexOf(searchString, position);
		return lastIndex !== -1 && lastIndex === position;
	};
}

module.exports = helper;
