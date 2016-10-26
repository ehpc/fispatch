/**
 * @author Eugene Maslovich <ehpc@em42.ru>
 */

/*global waitingDialog, mainController*/

(function ($) {
	'use strict';

	/**
	 * Создаёт объект из выбранных пользователем настроек репозиториев
	 * @param action Тип действия
	 * @returns {Object|null} Объект или null, если выбраны неверные значения
	 */
	function getSelectedData() {
		/*
		Пример возвращаемых данных:
		{
			type: 'patch_download',
			patchData:
			{
				name: 'dfsdfds',
				repos: [
					{
						alias: 'myrepo',
						type: 'branch',
						branch: '046'
					}
				]
			}
		}
		 */
		var $checkedRepos = $('.selectRepo:checked'),
			patchName = $('#formPatchName').val(),
			data = {};
		if (!patchName) {
			alert('Укажите название патча.');
			return null;
		}
		else if (!$checkedRepos.length) {
			alert('Выберите хотя бы один репозиторий.');
			return null;
		}
		data.name = patchName;
		data.repos = [];
		// Для каждого репозитория
		$checkedRepos.each(function () {
			var $row = $(this).closest('.repoRow'),
				alias = $(this).val(),
				branch = $row.find('select.formBranch').val(),
				startRev = $row.find('select.formStartRev').val(),
				endRev = $row.find('select.formEndRev').val(),
				isDistrib = $row.find('.isDistrib').is(':checked');
			// Если сборка для всей ветки
			if (branch) {
				data.repos.push({
					alias: alias,
					type: 'branch',
					branch: branch,
					distrib: isDistrib
				});
			}
			// Если сборка по диапазону ревизий
			else if (startRev && endRev) {
				data.repos.push({
					alias: alias,
					type: 'rev',
					startRev: startRev.split(';')[0],
					endRev: endRev.split(';')[0],
					distrib: isDistrib
				});
			}
			// Если ничего не выбрано
			else {
				alert('Выберите ветку или диапазон ревизий для репозитория «' + alias + '».');
				data = null;
				return false;
			}
		});
		return data;
	}

	$(document).ready(function () {

		var $formSettings = $('#formSettings'),
			$body = $('body');

		// Инициализируем красивые селекторы
		$('.selectpicker').selectpicker();

		// Кнопка сборки патча и залития в svn
		$body.on('click', '#buttonPatchSvn', function () {
			var data = getSelectedData('patch_svn');
			if (data) {
				waitingDialog.show('Добавляем задание в очередь...');
				mainController.makePatch('patch_svn', data).done(function (res) {
					waitingDialog.hide();
					info('Задание добавлено в очередь.');
				});
			}
		});

		// Кнопка сборки патча и скачивания архива
		$body.on('click', '#buttonPatchDownload', function () {
			var data = getSelectedData('patch_download');
			if (data) {
				waitingDialog.show('Добавляем задание в очередь...');
				mainController.makePatch('patch_download', data).done(function (res) {
					waitingDialog.hide();
					reloadQueueList();
					info('Задание добавлено в очередь.');
				}).fail(function (err) {
					console.error(err);
					waitingDialog.hide();
					alert('Ошибка при добавлении задания в очередь. ' + err.responseText);
				});
			}
		});

		// Кнопка сохранения настроек
		$body.on('click', '#buttonSaveSettings', function () {
			if (confirm('Вы уверены, что хотите сохранить настройки?')) {
				waitingDialog.show('Добавляем задание в очередь...');
				mainController.setSettings($formSettings.val()).then(function () {
					waitingDialog.hide();
					location.reload();
				}).fail(function (err) {
					console.error(err);
					waitingDialog.hide();
					alert('Ошибка при добавлении задания в очередь.' + err.responseText);
				});
			}
		});

		// Кнопка сброса настроек
		$body.on('click', '#buttonResetSettings', function () {
			if (confirm('Вы уверены, что хотите сбросить настройки?')) {
				waitingDialog.show('Добавляем задание в очередь...');
				mainController.resetSettings().done(function () {
					location.reload();
				}).fail(function (err) {
					console.error(err);
					waitingDialog.hide();
					alert('Ошибка при добавлении задания в очередь.' + err.responseText);
				});
			}
		});

		// Кнопка обновления репозиториев
		$body.on('click', '#buttonUpdateSystemData', function () {
			waitingDialog.show('Добавляем задание в очередь...');
			mainController.updateSystemData().done(function () {
				waitingDialog.hide();
				reloadQueueList();
				info('Задание добавлено в очередь.');
			}).fail(function (err) {
				console.error(err);
				waitingDialog.hide();
				alert('Ошибка при добавлении задания в очередь. ' + err.responseText);
			});
		});

		// Кнопка вызова справки
		$body.on('click', '#buttonHelp', function () {
			if ($body.hasClass('showHelp')) {
				$body.removeClass('showHelp');
			}
			else {
				$body.addClass('showHelp');
			}
		});

		/**
		 * Получает сообщение о попытке разблокировки
		 * @param leftMs Количество миллисекунд до следующей попытки
		 * @returns {string}
		 */
		function getCountdownMessage(leftMs) {
			var postfix = '';
			if (leftMs === 1000) {
				postfix = 'у';
			}
			else if (leftMs <= 4000) {
				postfix = 'ы';
			}
			return 'Следующая попытка через ' + parseInt(leftMs / 1000, 10) + ' секунд' + postfix + '.';
		}

		// Удаляет файл
		$body.on('click', '.deleteFile', function () {
			var $tr = $(this).closest('tr'),
				name = $tr.find('.fileLink').text();
			mainController.deleteFile(name).then(function () {
				$tr.remove();
			}).fail(function () {
				console.error(arguments);
				alert('Ошибка при удалении файла.');
			});
		});

		// Обновляет очередь
		$body.on('click', '.reloadQueueList', reloadQueueList);

		// Удаляет из очереди
		$body.on('click', '.deleteFromQueue', function () {
			if (confirm('Действительно удалить из очереди?')) {
				deleteFromQueue($(this));
			}
		});

		// Выводи сообщений об ошибках по ссылке
		$body.on('click', 'a.error', function () {
			window.alertDefault(this.title);
		});
	});

	/**
	 * Удаляет из очереди
	 * @param $this
	 */
	function deleteFromQueue($this) {
		mainController.deleteFromQueue($this.data('id')).then(function () {
			$this.closest('tr').remove();
		}).fail(function () {
			console.error(arguments);
			alert('Ошибка при удалении.');
		});
	}

	/**
	 * Обновляет очередь
	 */
	function reloadQueueList() {
		mainController.reloadQueueList().then(function (html) {
			$('#queue').replaceWith(html);
		}).fail(function () {
			console.error(arguments);
		});
	}

	/**
	 * Обновляет список файлов
	 */
	function reloadDownloadsList() {
		mainController.reloadDownloadsList().then(function (html) {
			$('#downloadsContainer').replaceWith(html);
		}).fail(function () {
			console.error(arguments);
		});
	}

	/**
	 * Автоматическое обновление серверного времени
	 */
	function reloadServerTime() {
		mainController.reloadServerTime().then(function (html) {
			$('#serverTime').replaceWith(html);
		});
	}

	// Автоматическое обновление очереди
	setInterval(reloadQueueList, 7000);

	// Автоматическое обновление списка файлов
	setInterval(reloadDownloadsList, 20000);

	// Автоматическое обновление серверного времени
	setInterval(reloadServerTime, 15000);

})(jQuery);

/**
 * Отображает сообщения об ошибках
 * @param message Сообщение
 */
window.alertDefault = window.alert;
var alert = function (message) {
	'use strict';
	var $alertContainer = $('#alertContainer'),
		$alert = $(
			'<div class="alert alert-danger alert-dismissable fade">' +
			'<button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>' +
			message +
			'</div>');
	$alertContainer.prepend($alert.fadeIn()).children().addClass('in');
	$alertContainer.find('.alert').slice(3).fadeOut(function () {
		$(this).remove();
	});
};

/**
 * Отображает произвольные сообщения
 * @param message Сообщение
 */
var info = function (message) {
	'use strict';
	var $alertContainer = $('#alertContainer'),
		$alert = $(
			'<div class="alert alert-info alert-dismissable">' +
			'<button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>' +
			message +
			'</div>');
	$alertContainer.prepend($alert.fadeIn()).children().addClass('in');
	$alertContainer.find('.alert').slice(3).fadeOut(function () {
		$(this).remove();
	});
};

jQuery.fn.extend({
	/**
	 * Плавный переход к элементу на странице
	 * @param interval Интервал скроллинга
	 * @param offset Смещение скроллинга
	 */
	scrollTo: function (interval, offset) {
		'use strict';
		if (typeof interval === 'undefined') {
			interval = 1000;
		}
		if (typeof offset === 'undefined') {
			offset = -100;
		}
		jQuery('html, body').animate({
			scrollTop: jQuery(this).offset().top + offset
		}, interval);
	}
});
