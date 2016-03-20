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
			console.log('beforeDownload snapshotSettings', JSON.stringify(snapshotSettings, null, '\t'));
			return Q.Promise(function (resolve, reject) {
				Q.all([
					helper.getFilesDirByRepoAlias(options.mergeFrom.alias, 'repo'), // Путь до файлов репозитория sql
					helper.getFilesDirByRepoAlias(repoSettings.alias, 'patch'), // Путь до файлов патча
					helper.getFilesDirByRepoAlias(repoSettings.alias, 'distrib') // Путь до файлов дистрибутива
				]).then(function (values) {
					var fromDir = path.join(values[0], options.mergeFrom.path),
						patchDir = values[1],
						distribDir = values[2],
						patchSchemaNames,
						distribSchemaNames;

					console.log('Нужно ли создавать дистрибутив?', snapshotSettings.distrib);

					// 1. Копирование папки sql


					helper.sequentialPromises(
						function () {
							console.log('Копируем папку sql в патч', fromDir, patchDir);
							return exec('cp -r ' + fromDir + ' ' + patchDir, execOptions);
						},
						function () {
							if (snapshotSettings.distrib === 'true') {
								console.log('Копируем папку sql в дистрибутив', fromDir, distribDir);
								return exec('cp -r ' + fromDir + ' ' + distribDir, execOptions);
							}
							else {
								return true;
							}
						}
					)
					.then(function () {
						console.log('Копирование папки sql завершено');
						// 2. Ищем все директории, для которых нужно добавить спецфайлы
						return helper.sequentialPromises(
							function () {
								console.log('Ищем все директории, для которых нужно добавить спецфайлы для патча', 'find ' + patchDir + ' -mindepth 1 -maxdepth 1 -type d ! -name "sql" | sort');
								return exec('find ' + patchDir + ' -mindepth 1 -maxdepth 1 -type d ! -name "sql" | sort', execOptions);
							},
							function () {
								console.log('Ищем все директории, для которых нужно добавить спецфайлы для дистрибутива', 'find ' + distribDir + ' -mindepth 1 -maxdepth 1 -type d ! -name "sql" | sort');
								return exec('find ' + distribDir + ' -mindepth 1 -maxdepth 1 -type d ! -name "sql" | sort', execOptions);
							}
						);
					})
					.then(function (values) {
						console.log('Директории: ', values);
						var res, asyncGenerators;
						// 3. Для каждой схемы создаем setup.sql и data.sql
						res = processSchemas(values[0], patchDir, options);
						asyncGenerators = res.asyncGenerators;
						patchSchemaNames = res.schemaNames;
						res = processSchemas(values[1], distribDir, options);
						asyncGenerators = asyncGenerators.concat(res.asyncGenerators);
						distribSchemaNames = res.schemaNames;
						console.log('asyncGenerators: length: ', asyncGenerators.length);
						return helper.sequentialPromises.apply(this, asyncGenerators);
					})
					.then(function () {
						// 4. Создаём config.ini
						return Q.all([
							readFile(options['config.ini'].path, 'utf-8')
						]);
					})
					.then(function (values) {
						// Трансформируем config.ini
						var transformedConfigIni = makeReplacements(values[0], options['config.ini'].replacements, snapshotSettings);
						[patchDir, distribDir].forEach(function (dir) {
							fs.writeFileSync(
								path.join(dir, 'config.ini'),
								iconv.encode(
									transformedConfigIni,
									'win1251'
								)
							);
							console.log('Был создан config.ini для ' + dir);
						});
					})
					.then(function () {
						// 5. Создаём setup.bat
						return Q.all([
							readFile(options['setup.bat'].path, 'utf-8')
						]);
					})
					.then(function (values) {
						[
							{
								dir: patchDir,
								schemaNames: patchSchemaNames
							},
							{
								dir: distribDir,
								schemaNames: distribSchemaNames
							}
						].forEach(function (data) {
							var transformedSetupBat = transformSetupBat(values[0], data.schemaNames, options['setup.bat']);
							fs.writeFileSync(
								path.join(data.dir, 'setup.bat'),
								iconv.encode(
									transformedSetupBat,
									'win1251'
								)
							);
							console.log('Был создан setup.bat для ' + data.dir);
						});
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
		 * Трансформирует setup.bat
		 * @param data Данные
		 * @param schemaNames Список схем
		 * @param options Настройки
		 * @returns {string|void|XML|*}
		 */
		function transformSetupBat(data, schemaNames, options) {
			var rx = new RegExp(options.filesRegex, 'mg');
			console.log('transformSetupBat regex:', options.filesRegex);
			data = data.replace(rx, function (match, comment, template) {
				var res = comment;
				console.log('transformSetupBat:', match);
				schemaNames.forEach(function (schemaName) {
					res += template.replace(/\[схема\]/img, schemaName) + '\r\n';
				});
				return res;
			});
			return data;
		}

		/**
		 * Проводит серию автозамен
		 * @param data Данные
		 * @param replacements Массив замен
		 * @param snapshotSettings Данные сборки
		 * @returns {*}
		 */
		function makeReplacements(data, replacements, snapshotSettings) {
			var i, rx, to;
			if (replacements && replacements.length) {
				for (i = 0; i < replacements.length; i++) {
					to = replacements[i].to;
					to = to.replace(/__BRANCH__/img, snapshotSettings.branch);
					to = to.replace(/__PATCH__/img, snapshotSettings.branch.replace(/[^0-9.]/img, ''));
					rx = new RegExp(replacements[i].from, 'mg');
					data = data.replace(rx, to);
				}
			}
			return data;
		}

		/**
		 * Обработка папок схем
		 * @param schemasList Список схем
		 * @param filesDir Целевая директория
		 * @param options Опции
		 * @returns {Array}
		 */
		function processSchemas(schemasList, filesDir, options) {
			var asyncGenerators = [],
				schemaNames = [];
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
				schemaNames.push(schemaName);
				// Получаем список файлов
				asyncGenerators.push(function () {
					console.log('Выполняем обработку для схемы', schemaName);
					console.log('exec:', 'find ' + path.join(filesDir, schemaName) + ' -mindepth 1 -maxdepth 2 -type f | sort');
					return exec('find ' + path.join(filesDir, schemaName) + ' -mindepth 1 -maxdepth 2 -type f | sort', execOptions)
						.then(function (schemaFiles) {
							schemaFiles = new SchemaFiles(schemaFiles, schemaPath);
							console.log('Нашли Файлы для схемы ' + schemaName);
							return Q.all([
								new Q(schemaFiles),
								readFile(options['setup.sql'].path, 'utf-8'),
								readFile(options['data.sql'].path, 'utf-8')
							]);
						})
						.then(function (values) {
							var transformed;
							// Дешаблонизируем setup.sql и создаём его копию в правильном месте
							transformed = transformSqlTemplate('setup.sql', values[1].replace(/\r\n/img, "\n"), schemaName, values[0], otherSchemasList, options);
							fs.writeFileSync(
								path.join(filesDir, schemaName + '_setup.sql'),
								iconv.encode(
									transformed.replace(/\n/img, "\r\n"),
									'win1251'
								)
							);
							console.log('Был создан ' + schemaName + '_setup.sql');
							// Дешаблонизируем data.sql и создаём его копию в правильном месте
							transformed = transformSqlTemplate('data.sql', values[2].replace(/\r\n/img, "\n"), schemaName, values[0], otherSchemasList, options);
							fs.writeFileSync(
								path.join(filesDir, schemaName + '_data.sql'),
								iconv.encode(
									transformed.replace(/\n/img, "\r\n"),
									'win1251'
								)
							);
							console.log('Был создан ' + schemaName + '_data.sql');
						});
				});
			});
			return {
				asyncGenerators: asyncGenerators,
				schemaNames: schemaNames
			};
		}

		/**
		 * Раскрывает шаблон *.sql
		 * @param templateName Название шаблона (setup.sql, data.sql)
		 * @param data Шаблон в виде строки
		 * @param schemaName Название схемы
		 * @param schemaFiles Файлы схемы (SchemaFiles)
		 * @param otherSchemasList Список схем, кроме текущей
		 * @param options Настройки
		 * @returns {XML|string|void|*}
		 */
		function transformSqlTemplate(templateName, data, schemaName, schemaFiles, otherSchemasList, options) {
			var filesRegexp = new RegExp(
					options[templateName].filesRegex.replace(/__SCHEMA__/img, schemaName),
					'img'
				);
			console.log('Трансформируем ' + templateName + ' для ' + schemaName);
			// Заменяем базовый шаблон
			data = data.replace(/\[схема\]/img, schemaName);
			// Удаляем опциональные куски, которые не относятся к текущей схеме
			otherSchemasList.forEach(function (otherSchema) {
				var rx = new RegExp(
					options[templateName].optionalBlockRegex.replace(/__SCHEMA__/img, otherSchema),
					'img'
				);
				data = data.replace(rx, '');
			});
			// Добавляем файлы согласно шаблонам
			data = data.replace(filesRegexp, function (match, rawPath, path, rawExt, ext, fileTemplate) {
				var res = '',
					files = schemaFiles.getFilesFromDir(path, ext, true),
					i, currentRes;
				for (i = 0; i < files.length; i++) {
					currentRes = fileTemplate;
					// Шаблонизируем вывод файла
					res += currentRes.replace(/\[схема\]/img, schemaName).replace(/\[имя_файла\]/img, files[i]) + '\n';
				}
				return res;
			});
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
		 * @param ext Расширение файла
		 * @param fileNamesOnly Возвращать только имена файлов без пути
		 * @returns {Array}
		 */
		SchemaFiles.prototype.getFilesFromRoot = function (ext, fileNamesOnly) {
			return this.getFilesFromDir(null, ext, fileNamesOnly);
		};

		/**
		 * Получает файлы в папке схемы из указанной поддиректории
		 * @param dirName Поддиректория
		 * @param ext Расширение файла
		 * @param fileNamesOnly Возвращать только имена файлов без пути
		 * @returns {Array}
		 */
		SchemaFiles.prototype.getFilesFromDir = function (dirName, ext, fileNamesOnly) {
			var rx = new RegExp(this.schemaPath + (dirName ? '/' + dirName : '') + '/[^/]+(?=\n)', 'img'),
				rxExt = new RegExp('\\.' + ext + '$', 'im'),
				m = rx.exec(this.schemaFilesString),
				res = [];
			while (m !== null) {
				// Если нет фильтрации по расширению или фильтрация проходит
				if (!ext || rxExt.test(m[0])) {
					res.push(fileNamesOnly ? m[0].replace(/.+\//img, '') : m[0]);
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
