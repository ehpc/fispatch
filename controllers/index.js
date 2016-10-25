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

router.get('/queue', function (req, res) {
	res.render('queue', {
		queue: queue.list()
	});
});

router.get('/', function (req, res) {
	// Подгружаем данные репозиториев
	Q.all([helper.getReposData(), helper.getSettings()]).done(function (data) {
		exec('ls -t1sh downloads').done(function (out) {
			var files = out[0].split('\n').map(function (line) {
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
			// Рендерим интерфейс
			res.render('index', {
				ip: req.ip,
				reposData: data[0],
				settings: JSON.stringify(data[1], null, 4),
				files: files,
				queue: queue.list()
			});
		});
	});
});
module.exports = router;
