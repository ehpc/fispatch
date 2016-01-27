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
						return exec('find ' + patchDir + ' -mindepth 1 -maxdepth 1 -type d ! -name "sql"', execOptions);
					})
					// Формируем массив директорий
					.then(function (schemasList) {
						var asyncGenerators = [];
						schemasList = (schemasList + '').trim().split('\n').filter(function (val) {
							return val !== ',';
						});
						console.log('Список директорий схем для обработки', schemasList);

						// Для каждой схемы
						schemasList.forEach(function (schemaPath) {
							var schemaName = schemaPath.replace(/^.+\//g, '');
							// Получаем список файлов
							asyncGenerators.push(function () {
								console.log('Выполняем обработку для схемы', schemaName);
								return exec('find ' + path.join(patchDir, schemaName) + ' -mindepth 1 -maxdepth 2 -type f', execOptions)
									.then(function (files) {
										files = (files + '').trim().split('\n').filter(function (val) {
											return val !== ',';
										});

										console.log('Файлы для схемы ' + schemaName, files);
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

	return {
		beforeDownload: beforeDownload
	};

})();

module.exports = oracle;
