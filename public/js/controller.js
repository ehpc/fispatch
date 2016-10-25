/**
 * Модуль основного контроллера
 *
 * @author Eugene Maslovich <ehpc@em42.ru>
 */

var mainController = mainController || (function ($) {
	'use strict';

	$.ajaxSetup({
	  timeout: 0
	});
	
	/**
	 * Создать патч
	 * @param type Тип патча [patch, distrib, patch_download, distrib_download]
	 * @param data Данные репозиториев
	 * @returns {Promise}
	 */
	var makePatch = function (type, data) {
		var $def = $.Deferred();
		$.ajax({
			type: 'POST',
			url: '/api/queue/add',
			data: {
				type: 'make-patch',
				data: data
			},
			dataType: 'json'
		}).done(function (res) {
			$def.resolve(res);
		}).fail($def.reject);
		return $def.promise();
	};

	/**
	 * Получить текущие настройки
	 * @returns {Promise}
	 */
	var getSettings = function () {
		var $def = $.Deferred();
		$.get('/api/settings').done(function (res) {
			$def.resolve(res);
		}).fail($def.reject);
		return $def.promise();
	};

	/**
	 * Записать текущие настройки
	 * @param data Новые настройки
	 * @returns {Promise}
	 */
	var setSettings = function (data) {
		var $def = $.Deferred();
		$.ajax({
			type: 'POST',
			url: '/api/settings',
			data: {
				settings: data
			},
			dataType: 'json'
		}).then(function (res) {
			$def.resolve(res);
		}).fail($def.reject);
		return $def.promise();
	};

	/**
	 * Сбрасывает настройки
	 * @returns {Promise}
	 */
	var resetSettings = function () {
		var $def = $.Deferred();
		$.ajax({
			type: 'DELETE',
			url: '/api/settings'
		}).done(function (res) {
			$def.resolve(res);
		}).fail($def.reject);
		return $def.promise();
	};

	/**
	 * Принудительно забирает блокировку
	 * @returns {*}
	 */
	var forceLock = function () {
		var $def = $.Deferred();
		$.ajax({
			type: 'GET',
			url: '/api/lock/force'
		}).done(function (res) {
			$def.resolve(res);
		}).fail($def.reject);
		return $def.promise();
	};

	/**
	 * Удаляет собранный файл
	 * @returns {*}
	 */
	var deleteFile = function (name) {
		var $def = $.Deferred();
		$.ajax({
			type: 'GET',
			url: '/api/delete',
			data: {
				fileName: name
			}
		}).done(function (res) {
			$def.resolve(res);
		}).fail($def.reject);
		return $def.promise();
	};

	/**
	 * Обновляет список очереди
	 */
	var reloadQueueList = function () {
		return $.ajax({
			type: 'GET',
			url: '/queue'
		});
	};

	/**
	 * Удаляет элемент очереди
	 */
	var deleteFromQueue = function (id) {
		return $.ajax({
			type: 'POST',
			url: '/api/queue/delete',
			data: {
				id: id
			}
		});
	};

	return {
		getSettings: getSettings,
		setSettings: setSettings,
		resetSettings: resetSettings,
		makePatch: makePatch,
		forceLock: forceLock,
		deleteFile: deleteFile,
		reloadQueueList: reloadQueueList,
		deleteFromQueue: deleteFromQueue
	};

})(jQuery);
