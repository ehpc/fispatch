/**
 * Контроллер, реализующий оракловые фишки
 * @author Eugene Maslovich <ehpc@em42.ru>
 */

/*jslint node:true*/

var oracle = oracle || (function () {
	'use strict';

	/*
	 Q - модуль для работы с обещаниями.
	 Q.denodeify превращает обычную node.js функцию в промис.
	 */

	var helper = require('controllers/helper'),
		Q = require('q'),
		fs = require('fs'),
		path = require('path'),
		childProcess = require('child_process'),
		exec = Q.denodeify(childProcess.exec),
		readFileSync = Q.denodeify(fs.readFileSync),
		readFile = Q.denodeify(fs.readFile),
		writeFile = Q.denodeify(fs.writeFile),
		readDir = Q.denodeify(fs.readdir),
		iconv = require('iconv-lite'),
		execOptions = {
			maxBuffer: 250000 // Количество байт для буфера командной строки
		},
		hgCommand = 'hg'; // Полный путь до меркуриала

	Q.longStackSupport = true;

	// Считываем настройки
	readFileSync('data/settings.json', 'utf8').done(function (data) {
		var settings = JSON.parse(data);
		hgCommand = settings.hgCommand;
		execOptions.maxBuffer = settings.processMaxBuffer;
	});

	/**
	 * Обработчик ораклового репозитория перед закачкой
	 * Алгоритм:
	 *     1. Копирование папки sql
	 *     2. Создание файла [схема]_setup.sql
	 * @param options Настройки вызова из settings.json
	 * Пример:
	 *     {
	 *         "mergeFrom": {
	 *             "alias": "oracleScripts",
	 *             "path": "/sql/"
	 *         }
	 *     }
	 * @param repoSettings Настроки репозитория из settings.json
	 * Пример:
	 *     {
	 *         "address": "http://mercurial.fisgroup.ru/fcs/Server/Schemas_dev/",
	 *         "alias": "oracleSchemas",
	 *         "cloneRev": "0",
	 *         "revisionsLimit": "50",
	 *         "beforeDownload": {
	 *             "controller": "oracle",
	 *             "action": "beforeDownload",
	 *             "options": {
	 *                 "mergeFrom": {
	 *                     "alias": "oracleScripts",
	 *                     "path": "/sql/"
	 *                 }
	 *             }
	 *         }
	 *     }
	 * @param snapshotSettings Настройки сборки репозитория
	 * Пример:
	 *     {
	 *         "alias": "oracleSchemas",
	 *         "type": "branch",
	 *         "branch": "b063",
	 *         "distrib": "true"
	 *     }
	 * @returns {*}
	 */
	function beforeDownload(options, repoSettings, snapshotSettings) {
		return Q.Promise(function (resolve, reject) {
			Q.all([
				helper.getFilesDirByRepoAlias(options.mergeFrom.alias, 'repo'), // Путь до файлов репозитория sql
				helper.getFilesDirByRepoAlias(repoSettings.alias, 'patch'), // Путь до файлов патча
				helper.getFilesDirByRepoAlias(repoSettings.alias, 'distrib') // Путь до файлов дистрибутива
			]).then(function (values) {
				var fromDir = path.join(values[0], options.mergeFrom.path),
					patchDir = values[1],
					distribDir = values[2];
				// 1. Копирование папки sql
				console.log('Копируем папку sql в патч', fromDir, patchDir);
				exec('cp -r ' + fromDir + ' ' + patchDir, execOptions)
					.then(function () {
						console.log('Нужно ли создавать дистрибутив?', snapshotSettings.distrib);
						if (snapshotSettings.distrib === 'true') {
							console.log('Копируем папку sql в дистрибутив', fromDir, distribDir);
							return exec('cp -r ' + fromDir + ' ' + distribDir, execOptions);
						}
						else {
							return true;
						}
					})
					// 2. Создание файлов [схема]_setup.sql
					.then(function () {
						console.log('Копирование папки sql завершено');
						console.log('Создание setup.sql', options['setup.sql'].path);
						return readFile(options['setup.sql'].path, 'utf-8');
					})
					.then(function (setupSqlTemplate) {
						//destination = path.join(patchDir, 'setup.sql');
						//setupSql.replace(/[схема]/gi, '');
						console.log('Ищем схемы');

						patchDir = distribDir; // TODO DELETE

						return readDir(patchDir).then(function (dirContents) {
							var asyncs = [];
							console.log('dirContents', dirContents);
							// Убираем лишние директории
							dirContents = dirContents.filter(function (dirName) {
								return dirName !== 'sql';
							});
							// Для каждой схемы создаём свой файлик
							dirContents.forEach(function (schemaName) {
								var destination = path.join(patchDir, schemaName + '_setup.sql'),
									otherDirs = dirContents.filter(function (dirName) {
										return dirName !== schemaName;
									}),
									setupSql = setupSqlTemplate;

								// Заменяем базовый шаблон
								setupSql = setupSql.replace(/\[схема\]/img, schemaName);
								// Удаляем опциональные куски, которые не относятся к текущей схеме
								otherDirs.forEach(function (otherSchema) {
									var rx = new RegExp(
										options['setup.sql'].optionalBlockRegex.replace(/__SCHEMA__/img, otherSchema),
										'img'
									);
									setupSql = setupSql.replace(rx, '');
								});

								// Добавляем файлы
								// TODO
								var rx = /--Включить все файлы из папки (\S+)( с расширением (\S+))?[\s\S]+?--(@@[\S]+)[\s\S]+?\r\n\r\n/img,
									fileCommands = '';
								setupSql = setupSql.replace(rx, function (match, dirName, p1, extension, filePattern) {
									var filesDir = path.join(patchDir, dirName.replace(/,$/, '')),
										files, i, fd, filePath;
									try {
										fd = fs.openSync(filesDir, 'r');
									}
									catch (e) {
										fd = null;
									}
									if (fd && fs.fstatSync(fd).isDirectory()) {
										fs.close(fd);
										fd = null;
										console.log('Включения файлов из', filesDir, extension, filePattern);
										files = fs.readdirSync(filesDir);
										for (i = 0; i < files.length; i++) {
											filePath = path.join(filesDir, files[i]);
											try {
												fd = fs.openSync(filePath, 'r');
											}
											catch (e) {
												fd = null;
											}
											if (fd && fs.fstatSync(fd).isFile() && (!extension || files[i].endsWith(extension))) {
												fs.close(fd);
												fd = null;
												//console.log('file>>>', files[i]);
											}
										}
									}
									return '';
								});

								// Удаляем всё остальное
								otherDirs.forEach(function (otherSchema) {
									options['setup.sql'].removeRegex.forEach(function (pattern) {
										var rx = new RegExp(pattern.replace(/__SCHEMA__/img, otherSchema), 'img');
										setupSql = setupSql.replace(rx, '');
									});
								});

								// Сохраняем изменения
								//asyncs.push(writeFile(destination, iconv.encode(setupSql, 'win1251')));
							});
							return Q.all(asyncs);
						}).fail(reject);
					})
					.then(function () {
						console.log('Обработчик оракла завершён');
						resolve();
					})
					.fail(reject);
			}).fail(reject);
		});
	}

	return {
		beforeDownload: beforeDownload
	};

})();

module.exports = oracle;
