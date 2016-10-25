/**
 * Модуль очередей
 * @author Eugene Maslovich <ehpc@em42.ru>
 */

/*jslint node:true*/


var queue = queue || (function () {
	'use strict';

	var Q = require('q'),
		fs = require('fs'),
		path = require('path'),
		childProcess = require('child_process'),
		exec = Q.denodeify(childProcess.exec),
		queuePath = 'data/queue.json',
		execOptions = {
			maxBuffer: 250000
		};

	/**
	 * Добавление задания в очередь
	 * @param data Данные задания
	 * @returns {boolean}
	 */
	function add(data) {
		var items = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
		if (items.length) {
			data.id = items[items.length - 1].id;
		}
		else {
			data.id = 1;
		}
		items.push(data);
		fs.writeFileSync(queuePath, JSON.stringify(items), 'utf8');
		return true;
	}

	/**
	 * Удаление задания из очереди
	 * @param id Идентификатор задания
	 * @returns {boolean}
	 */
	function remove(id) {
		var items = JSON.parse(fs.readFileSync(queuePath, 'utf8')), i;
		console.log('Удаление из очереди: ' + id);
		for (i = items.length - 1; i >= 0; i--) {
			if (items[i].id == id) {
				items.splice(i, 1);
			}
		}
		fs.writeFileSync(queuePath, JSON.stringify(items), 'utf8');
		return true;
	}

	/**
	 * Получение списка элементов в очереди
	 */
	function list() {
		var queue = JSON.parse(fs.readFileSync(queuePath, 'utf8')),
			i;
		for (i = 0; i < queue.length; i++) {
			if (queue[i].status === 'queued') {
				queue[i].taskStatus = 'В очереди';
			}
			else if (queue[i].status === 'processing') {
				queue[i].taskStatus = 'Выполняется';
			}
		}
		return queue;
	}

	return {
		add: add,
		remove: remove,
		list: list
	};

})();


module.exports = queue;
