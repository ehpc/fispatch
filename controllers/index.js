/**
 * @author Eugene Maslovich <ehpc@em42.ru>
 */

/*jslint node:true*/

'use strict';

var router = require('express').Router(),
	helper = require('controllers/helper'),
	Q = require('q');

router.get('/', function (req, res) {
	// Подгружаем данные репозиториев
	Q.all([helper.getReposData(), helper.getSettings()]).done(function (data) {
		console.log('>>>/done');
		// Рендерим интерфейс
		res.render('index', {
			reposData: data[0],
			settings: JSON.stringify(data[1], null, 4)
		});
	});
});

module.exports = router;
