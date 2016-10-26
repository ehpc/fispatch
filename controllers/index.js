/**
 * @author Eugene Maslovich <ehpc@em42.ru>
 */

/*jslint node:true*/

'use strict';

var router = require('express').Router(),
	helper = require('./helper'),
	queue = require('./queue'),
	Q = require('q'),
	fs = require('fs'),
	childProcess = require('child_process'),
	exec = Q.denodeify(childProcess.exec);

/**
 * Возвращает список файлов для загрузки
 * @returns {*}
 */
function getDownloads() {
	return exec('ls -t1sh downloads').then(function (out) {
		return out[0].split('\n').map(function (line) {
			var match = /\s*(\d+\w*)\s+([\s\S]+)/im.exec(line);
			if (match !== null) {
				return {
					name: match[2],
					size: match[1]
				};
			}
			else {
				return null;
			}
		}).filter(function (file) {
			return file;
		});
	});
}

router.get('/queue', function (req, res) {
	res.render('queue', {
		queue: queue.list()
	});
});

router.get('/server-time', function (req, res) {
	res.render('server-time', {
		date: new Date().toLocaleString()
	});
});

router.get('/downloads', function (req, res) {
	getDownloads().then(function (files) {
		res.render('downloads', {
			files: files
		});
	});
});

router.get('/', function (req, res) {
	// Подгружаем данные репозиториев
	Q.all([helper.getReposData(true), helper.getSettings()]).then(function (data) {
		getDownloads().then(function (files) {
			// Рендерим интерфейс
			res.render('index', {
				ip: req.ip,
				date: new Date().toLocaleString(),
				reposData: data[0],
				settings: JSON.stringify(data[1], null, 4),
				files: files,
				queue: queue.list()
			});
		}).fail(function (err) {
			console.error(err);
			throw err;
		});
	}).fail(function (err) {
		console.error(err);
		throw err;
	});
});
module.exports = router;
