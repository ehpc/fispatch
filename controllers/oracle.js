/**
 * Контроллер, реализующий оракловые фишки
 * @author Eugene Maslovich <ehpc@em42.ru>
 */

/*jslint node:true*/


var oracle = oracle || (function () {
		'use strict';

		var Q = require('q'),
			fs = require('fs'),
			path = require('path'),
			childProcess = require('child_process'),
			exec = Q.denodeify(childProcess.exec),
			readFile = Q.denodeify(fs.readFile),
			execOptions = {
				maxBuffer: 250000
			},
			hgCommand = 'hg';

		/**
		 * Обработчик репозитория перед закачкой
		 * @returns {*}
		 */
		function beforeDownload(options) {
			return Q.Promise(function (resolve, reject) {
				console.log('ORCALE BEFORE', JSON.stringify(options));
				resolve();
			});
		}

		return {
			beforeDownload: beforeDownload
		};

	})();

module.exports = oracle;
