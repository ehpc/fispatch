/**
 * Модуль очередей
 * @author Eugene Maslovich <ehpc@em42.ru>
 */

/*jslint node:true*/

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
	var items = JSON.parse(fs.readFileSync(queuePath, 'utf8')),
		id = 1,
		i;
	if (items.length) {
		for (i = items.length - 1; i >= 0; i--) {
			id = Math.max(id, items[i].id);
		}
		for (i = items.length - 1; i >= 0; i--) {
			if (items[i].status !== 'error' && items[i].status !== 'done') {
				break;
			}
		}
		data.id = id + 1;
		items.splice(i >= 0 ? i : 0, 0, data);
	}
	else {
		data.id = id;
		items.push(data);
	}

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
			break;
		}
	}
	fs.writeFileSync(queuePath, JSON.stringify(items), 'utf8');
	return false;
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
		else if (queue[i].status === 'error') {
			queue[i].taskStatus = 'Ошибка';
		}
		else if (queue[i].status === 'done') {
			queue[i].taskStatus = 'Выполнено';
		}
	}
	return queue;
}

/**
 * Достаёт первый элемент в очереди
 * @returns {*}
 */
function pop() {
	var queue = JSON.parse(fs.readFileSync(queuePath, 'utf8')), i;
	if (queue.length) {
		for (i = 0; i < queue.length; i++) {
			// Если уже какой-то элемент обрабатывается
			if (queue[i].status === 'processing') {
				return null;
			}
			// Возвращаем первый попавшийся элемент
			if (queue[i].status === 'queued') {
				console.log('Popping queue item', queue[i].id);
				return queue[i];
			}
		}
	}
	else {
		return null;
	}
}

/**
 * Обновляет элемент очереди
 */
function update(item) {
	var queue = JSON.parse(fs.readFileSync(queuePath, 'utf8')), i, j;
	if (queue.length) {
		for (i = 0; i < queue.length; i++) {
			if (queue[i].id === item.id) {
				queue[i] = item;
				// Если задание завершено
				if (queue[i].status === 'error' || queue[i].status === 'done') {
					queue.splice(i, 1);
					// Вставляем элемент в конец живой очереди, но перед остальными завершенными
					for (j = 0; j < queue.length; j++) {
						if (queue[i].status === 'error' || queue[i].status === 'done') {
							break;
						}
					}
					queue.splice(i >= 0 ? i : 0, 0, item);
				}
				fs.writeFileSync(queuePath, JSON.stringify(queue), 'utf8');
				return true;
			}
		}
	}
	return false;
}

module.exports = {
	add: add,
	remove: remove,
	list: list,
	pop: pop,
	update: update
};
