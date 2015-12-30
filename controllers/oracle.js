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
		readFile = Q.denodeify(fs.readFileSync), // Функция чтения файла
		execOptions = {
			maxBuffer: 250000 // Количество байт для буфера командной строки
		},
		hgCommand = 'hg'; // Полный путь до меркуриала

	// Считываем настройки
	readFile('data/settings.json', 'utf8').done(function (data) {
		var settings = JSON.parse(data);
		hgCommand = settings.hgCommand;
		execOptions.maxBuffer = settings.processMaxBuffer;
	});

	/**
	 * Обработчик ораклового репозитория перед закачкой
	 * Алгоритм:
	 *     1. Копирование папки sql
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
				var fromDir = path.join(values[0], options.mergeFrom.path);
				// Копируем папку sql в патч
				console.log('Копируем папку sql в патч', fromDir, values[1]);
				exec('cp -r ' + fromDir + ' ' + values[1], execOptions)
					.then(function () {
						if (snapshotSettings.distrib === 'true') {
							console.log('Копируем папку sql в дистрибутив', fromDir, values[2]);
							return exec('cp -r ' + fromDir + ' ' + values[2], execOptions);
						}
						else {
							return true;
						}
					})
					.then(function () {
						console.log('Копирование папки sql завершено');
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
