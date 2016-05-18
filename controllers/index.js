/**
 * @author Eugene Maslovich <ehpc@em42.ru>
 */

/*jslint node:true*/

'use strict';

var router = require('express').Router(),
	helper = require('controllers/helper'),
	Q = require('q');

router.get('/', function (req, res) {
	var lock = helper.lock(req.ip);
	if (lock === true) {
		// Подгружаем данные репозиториев
		Q.all([helper.getReposData(), helper.getSettings()]).done(function (data) {
			console.log('>>>/done');
			// Рендерим интерфейс
			res.render('index', {
				reposData: data[0],
				settings: JSON.stringify(data[1], null, 4)
			});
			helper.unlock();
		});
	}
	else {
		res.render('locked', {
			lock: lock
		});
	}
});

module.exports = router;
