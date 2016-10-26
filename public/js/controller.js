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
	function makePatch(type, data) {
		var $def = $.Deferred();
		$.ajax({
			type: 'POST',
			url: '/api/queue/add',
			data: {
				type: 'makePatch',
				data: data
			},
			dataType: 'json'
		}).done(function (res) {
			$def.resolve(res);
		}).fail($def.reject);
		return $def.promise();
	}

	/**
	 * Обновить данные репозиториев
	 * @returns {Promise}
	 */
	function updateSystemData() {
		return $.ajax({
			type: 'POST',
			url: '/api/queue/add',
			data: {
				type: 'updateSystemData'
			},
			dataType: 'json'
		});
	}

	/**
	 * Получить текущие настройки
	 * @returns {Promise}
	 */
	function getSettings() {
		var $def = $.Deferred();
		$.get('/api/settings').done(function (res) {
			$def.resolve(res);
		}).fail($def.reject);
		return $def.promise();
	}

	/**
	 * Записать текущие настройки
	 * @param data Новые настройки
	 * @returns {Promise}
	 */
	function setSettings(data) {
		return $.ajax({
			type: 'POST',
			url: '/api/queue/add',
			data: {
				type: 'changeSettings',
				data: data
			},
			dataType: 'json'
		});
	}

	/**
	 * Сбрасывает настройки
	 * @returns {Promise}
	 */
	function resetSettings() {
		var $def = $.Deferred();
		$.ajax({
			type: 'DELETE',
			url: '/api/settings'
		}).done(function (res) {
			$def.resolve(res);
		}).fail($def.reject);
		return $def.promise();
	}

	/**
	 * Принудительно забирает блокировку
	 * @returns {*}
	 */
	function forceLock() {
		var $def = $.Deferred();
		$.ajax({
			type: 'GET',
			url: '/api/lock/force'
		}).done(function (res) {
			$def.resolve(res);
		}).fail($def.reject);
		return $def.promise();
	}

	/**
	 * Удаляет собранный файл
	 * @returns {*}
	 */
	function deleteFile(name) {
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
	}

	/**
	 * Обновляет список очереди
	 */
	function reloadQueueList() {
		return $.ajax({
			type: 'GET',
			url: '/queue'
		});
	}

	/**
	 * Обновляет список файлов
	 */
	function reloadDownloadsList() {
		return $.ajax({
			type: 'GET',
			url: '/downloads'
		});
	}

	/**
	 * Считывает серверное время
	 */
	function reloadServerTime() {
		return $.ajax({
			type: 'GET',
			url: '/server-time'
		});
	}

	/**
	 * Удаляет элемент очереди
	 */
	function deleteFromQueue(id) {
		return $.ajax({
			type: 'POST',
			url: '/api/queue/delete',
			data: {
				id: id
			}
		});
	}

	return {
		getSettings: getSettings,
		setSettings: setSettings,
		resetSettings: resetSettings,
		makePatch: makePatch,
		forceLock: forceLock,
		deleteFile: deleteFile,
		reloadQueueList: reloadQueueList,
		deleteFromQueue: deleteFromQueue,
		reloadServerTime: reloadServerTime,
		reloadDownloadsList: reloadDownloadsList,
		updateSystemData: updateSystemData
	};

})(jQuery);
