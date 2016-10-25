/**
 * Модуль повторяющихся операций
 * @author Eugene Maslovich <ehpc@em42.ru>
 */

/*jslint node:true*/

var Q = require('q'),
	fs = require('fs'),
	path = require('path'),
	childProcess = require('child_process'),
	exec = Q.denodeify(childProcess.exec),
	queue = require('./queue'),
	proc = require('./proc'),
	execOptions = {
		maxBuffer: 250000
	};

/**
 * Планировщик очереди заданий
 */
function processQueue() {
	var item = queue.pop();
	if (item) {
		console.log('Обрабатываем задание ' + item.id);
		item.status = 'processing';
		if (queue.update(item)) {
			proc.run('makePatch', item);
		}
		else {
			console.log('Ошибка обработки задания ' + item.id);
		}
	}
}

module.exports = {
	start: function () {
		setInterval(processQueue, 5000);
	}
};
