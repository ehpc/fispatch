/**
 * @author Eugene Maslovich <ehpc@em42.ru>
 */

/*jslint node:true*/

'use strict';

var express = require('express'); // Веб сервер express
var path = require('path'); // Модуль работы с путями
var logger = require('morgan'); // Логирование для express
var bodyParser = require('body-parser'); // Для работы с POST-запросами
var fs = require('fs');
var timeout = require('connect-timeout');
var cron = require('./controllers/cron');

console.log = function () {
	var currentdate = new Date(),
		timestamp = currentdate.getDate() + "." +
                (currentdate.getMonth() + 1)  + "." +
                currentdate.getFullYear() + " " +
                currentdate.getHours() + ":" +
                currentdate.getMinutes() + ":" +
                currentdate.getSeconds();
	fs.appendFile('logs/console.log', '[' + timestamp + '] ' + Array.prototype.slice.call(arguments).join(' ') + '\n');
};

// Создаём наше серверное приложение
var app = express();

app.use(timeout('3600s'));
// Настраиваем view
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.locals.pretty = true;
// Настраиваем приложение
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
// Конфигурируем статику
app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/vendor/', express.static(path.join(__dirname, 'bower_components')));
app.use('/shared/', express.static(path.join(__dirname, 'downloads')));


// Подключаем контроллеры
app.use('/', require('./controllers/index'));
app.use('/', require('./controllers/api'));

// Планировщик задач
cron.start();

// Отлавливаем ошибки
app.use(function (req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});
// Middleware ошибки
app.use(function (err, req, res, next) {
	console.log('+++++++++ERROR', err);
	res.status(err.status || 500);
	res.render('error', {
		message: err.message || err,
		error: err
	});
});

module.exports = app;
