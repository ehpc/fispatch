/**
 * Модуль основного контроллера
 *
 * @author Eugene Maslovich <ehpc@em42.ru>
 */

var mainController = mainController || (function ($) {
	'use strict';

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
			url: '/api/make-patch',
			data: {type: type, patchData: data},
			dataType: 'json'
		}).done(function (res) {
			$def.resolve(res);
		});
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
		});
		return $def.promise();
	};

	/**
	 * Записать текущие настройки
	 * @param jsonData Новые настройки в формате JSON
	 * @returns {Promise}
	 */
	var setSettings = function (jsonData) {
		var $def = $.Deferred();
		$.ajax({
			type: 'POST',
			url: '/api/settings',
			data: jsonData,
			dataType: 'json'
		}).done(function (res) {
			$def.resolve(res);
		});
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
		});
		return $def.promise();
	};

	return {
		getSettings: getSettings,
		setSettings: setSettings,
		resetSettings: resetSettings,
		makePatch: makePatch
	};

})(jQuery);
