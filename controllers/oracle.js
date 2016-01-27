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
			open = Q.denodeify(fs.open),
			writeFile = Q.denodeify(fs.writeFile),
			readDir = Q.denodeify(fs.readdir),
			fstat = Q.denodeify(fs.fstat),
			iconv = require('iconv-lite'),
			execOptions = {
				maxBuffer: 10000000 // Количество байт для буфера командной строки
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
						.then(function () {
							console.log('Копирование папки sql завершено');

							patchDir = distribDir; // TODO DELETE

							// 2. Ищем все директории, для которых нужно добавить спецфайлы
							return exec('find ' + patchDir + ' -mindepth 1 -maxdepth 1 -type d ! -name "sql" | sort', execOptions);
						})
						// Формируем массив директорий
						.then(function (schemasList) {
							var asyncGenerators = [],
								schemaHash = {};
							schemasList = (schemasList + '').trim().split('\n').filter(function (val) {
								return val !== ',';
							});

							console.log('Список директорий схем для обработки', schemasList);

							// Для каждой схемы
							schemasList.forEach(function (schemaPath) {
								var schemaName = schemaPath.replace(/^.+\//g, ''),
									otherSchemasList = schemasList.map(function (val) {
										return val.match(/[^\/]+$/img)[0];
									}).filter(function (val) {
										return val !== schemaName;
									});
								schemaHash[schemaName] = {};
								// Получаем список файлов
								asyncGenerators.push(function () {
									console.log('Выполняем обработку для схемы', schemaName);
									return exec('find ' + path.join(patchDir, schemaName) + ' -mindepth 1 -maxdepth 2 -type f | sort', execOptions)
										.then(function (schemaFiles) {
											schemaFiles = new SchemaFiles(schemaFiles, schemaPath);

											console.log('Нашли Файлы для схемы ' + schemaName);

											return Q.all([
												Q(schemaFiles),
												readFile(options['setup.sql'].path, 'utf-8')
											]);
										})
										.then(function (values) {

											// Дешаблонизируем файл и создаём его копию в правильном месте
											fs.writeFileSync(
												path.join(patchDir, schemaName + '_setup.sql'),
												iconv.encode(
													transformSetupSql(values[1], schemaName, values[0], otherSchemasList, options),
													'win1251'
												)
											);

											console.log('Был создан ' + schemaName + '_setup.sql');
										});
								});
							});

							return asyncGenerators.reduce(Q.when, Q(true));
						})
						.then(function () {
							console.log('Обработчик оракла завершён');
							resolve();
						})
						.fail(reject);
				}).fail(reject);
			});
		}

		/**
		 * Раскрывает шаблон setup.sql
		 * @param data Шаблон в виде строки
		 * @param schemaName Название схемы
		 * @param schemaFiles Файлы схемы
		 * @param otherSchemasList Список схем, кроме текущей
		 * @param options Настройки
		 * @returns {XML|string|void|*}
		 */
		function transformSetupSql(data, schemaName, schemaFiles, otherSchemasList, options) {
			var rootFiles = schemaFiles.getFilesFromRoot(); // Список файлов в папке схемы
			console.log('Трансформируем setup.sql для ' + schemaName);
			// Заменяем базовый шаблон
			data = data.replace(/\[схема\]/img, schemaName);
			// Удаляем опциональные куски, которые не относятся к текущей схеме
			otherSchemasList.forEach(function (otherSchema) {
				var rx = new RegExp(
					options['setup.sql'].optionalBlockRegex.replace(/__SCHEMA__/img, otherSchema),
					'img'
				);
				data = data.replace(rx, '');
			});
			// Добавляем файлы согласно шаблонам
			return data;
		}

		/**
		 * Объект для работы с выводом find
		 * @param schemaFilesString Список файлов схемы в виде строки
		 * @param schemaPath Путь до директории схемы
		 * @constructor
		 */
		function SchemaFiles(schemaFilesString, schemaPath) {
			this.schemaFilesString = schemaFilesString + '';
			this.schemaPath = schemaPath;
		}

		/**
		 * Получае файлы в папке схемы
		 * @returns {Array}
		 */
		SchemaFiles.prototype.getFilesFromRoot = function (ext) {
			return this.getFilesFromDir(null, ext);
		};

		/**
		 * Получает файлы в папке схемы из указанной поддиректории
		 * @param dirName Поддиректория
		 * @param ext Расширение файла
		 * @returns {Array}
		 */
		SchemaFiles.prototype.getFilesFromDir = function (dirName, ext) {
			var rx = new RegExp(this.schemaPath + (dirName ? '/' + dirName : '') + '/[^/]+(?=\n)', 'img'),
				rxExt = new RegExp('\.' + ext + '$', 'im'),
				m = rx.exec(this.schemaFilesString),
				res = [];
			while (m !== null) {
				// Если нет фильтрации по расширению или фильтрация проходит
				if (!ext || rxExt.test(m[0])) {
					res.push(m[0]);
				}
				m = rx.exec(this.schemaFilesString);
			}
			return res;
		};

		return {
			beforeDownload: beforeDownload
		};

})();

module.exports = oracle;
