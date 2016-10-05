/**
 * Контроллер, реализующий вебовские фишки
 * @author Eugene Maslovich <ehpc@em42.ru>
 */

/*jslint node:true*/

var web = web || (function () {
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
		 * Заменяет все вхождения строки на другую строку
		 * @param str
		 * @param find
		 * @param replace
		 * @returns {void|XML|string}
		 */
		function replaceAll(str, find, replace) {
			if (str) {
				return str.replace(new RegExp(find.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1'), 'g'), replace);
			}
			else {
				return '';
			}
		}

		/**
		 * Обработчик репозитория перед закачкой
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
		 * @param patchData Данные сборщика
		 * Пример:
		 *     {
		 *         "alias": "oracleSchemas",
		 *         "type": "branch",
		 *         "branch": "b063",
		 *         "distrib": "true"
		 *     }
		 * @returns {*}
		 */
		function beforeDownload(options, repoSettings, snapshotSettings, patchData) {
			console.log('beforeDownload snapshotSettings', JSON.stringify(snapshotSettings, null, '\t'));
			return Q.Promise(function (resolve, reject) {
				Q.all([
					helper.getFilesDirByRepoAlias(repoSettings.alias, 'patch'), // Путь до файлов патча
					helper.getFilesDirByRepoAlias(repoSettings.alias, 'distrib') // Путь до файлов дистрибутива
				]).then(function (values) {
					var patchDir = values[0],
						distribDir = values[1],
						isDistrib = snapshotSettings.distrib === 'true';

					console.log('Нужно ли создавать дистрибутив?', snapshotSettings.distrib);

					console.log('Составляем список файлов, из которых состоит дистрибутив. ');
					console.log('find ' + distribDir + ' -type f | sort');
					return exec('find ' + distribDir + ' -type f | sort', execOptions).then(function (res) {
						if (options.fileList) {
							res[0] += options.fileList.reduce(function (acc, x) {
								return acc + distribDir + '/' + x + '\n';
							}, '');
						}
						res[0] += distribDir + '/' + 'file-list.txt';
						res[0] = res[0].replace(new RegExp('^' + distribDir, 'img'), '.');
						return Q.all([
							writeFile(path.join(distribDir, 'file-list.txt'), res[0]),
							writeFile(path.join(patchDir, 'file-list.txt'), res[0])
						]);
					}).then(function () {
						console.log('beforeDownload успешно завершён.');
						resolve();
					}).fail(function (error) {
						console.log('Error', error);
						reject(error);
					});
					/*helper.sequentialPromises(
						function () {
							console.log('Вычисляем хеш-суммы файлов патча. ', 'find ' + patchDir + ' -type f -print0 | sort -z | xargs -0 -I {} sh -c \'stat --printf="%Y " {}; sha1sum {};\'');
							return exec('find ' + patchDir + ' -type f -print0 | sort -z | xargs -0 -I {} sh -c \'stat --printf="%Y " {}; sha1sum {};\'', execOptions);
						},
						function () {
							if (isDistrib) {
								console.log('Вычисляем хеш-суммы файлов дистрибутива. ', 'find ' + distribDir + ' -type f -print0 | sort -z | xargs -0 -I {} sh -c \'stat --printf="%Y " {}; sha1sum {};\'');
								return exec('find ' + distribDir + ' -type f -print0 | sort -z | xargs -0 -I {} sh -c \'stat --printf="%Y " {}; sha1sum {};\'', execOptions);
							}
							else {
								return false;
							}
						}
					).then(function (values) {
						console.log('Записываем результаты вычисления хешей в checksum.txt.');
						values[0] = (values[0] + '').replace(/ +/g, ' ').replace(/^,$/img, '');
						values[0] = replaceAll(values[0], path.join(patchDir, '/'), '').trim();
						if (isDistrib) {
							values[1] = (values[1] + '').replace(/ +/g, ' ').replace(/^,$/img, '');
							values[1] = replaceAll(values[1], path.join(distribDir, '/'), '').trim();
						}
						helper.sequentialPromises(
							function () {
								return writeFile(path.join(patchDir, 'checksum.txt'), isDistrib ? values[1] : values[0]);
							},
							function () {
								if (isDistrib) {
									return writeFile(path.join(distribDir, 'checksum.txt'), values[1]);
								}
								else {
									return true;
								}
							}
						).then(function () {
							console.log('beforeDownload успешно завершён.');
							resolve();
						}).fail(reject);
					});*/
				});
			});
		}

		return {
			beforeDownload: beforeDownload
		};

})();

module.exports = web;
