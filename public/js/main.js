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

		var $formSettings = $('#formSettings');

		// Инициализируем красивые селекторы
		$('.selectpicker').selectpicker();

		// Кнопка сборки патча и залития в svn
		$('#buttonPatchSvn').on('click', function () {
			var data = getSelectedData('patch_svn');
			if (data) {
				waitingDialog.show('Собираем патч...');
				mainController.makePatch('patch_svn', data).done(function (res) {
					waitingDialog.hide();
					info('Патч «' + res.name + '» успешно собран [' + res.date + '].');
				});
			}
		});

		// Кнопка сборки патча и скачивания архива
		$('#buttonPatchDownload').on('click', function () {
			var data = getSelectedData('patch_download');
			if (data) {
				waitingDialog.show('Собираем патч...');
				mainController.makePatch('patch_download', data).done(function (res) {
					waitingDialog.hide();
					info('Патч «' + res.name + '» доступен по ссылке: <a href="' + res.url + '">' + res.url + '</a>');
				}).fail(function (err) {
					console.error(err);
					waitingDialog.hide();
					alert('Ошибка при сборке патча. ' + err.responseText);
				});
			}
		});

		// Кнопка сохранения настроек
		$('#buttonSaveSettings').on('click', function () {
			confirm('Вы уверены, что хотите сохранить настройки?', function () {
				waitingDialog.show('Сохраняем настройки...');
				mainController.setSettings(JSON.parse($formSettings.val())).done(function () {
					waitingDialog.hide();
					location.reload();
				}).fail(function (err) {
					console.error(err);
					waitingDialog.hide();
					alert('Ошибка при сохранении настроек.' + err.responseText);
				});
			});
		});

		// Кнопка сброса настроек
		$('#buttonResetSettings').on('click', function () {
			confirm('Вы уверены, что хотите сбросить настройки?', function () {
				waitingDialog.show('Сбрасываем настройки...');
				mainController.resetSettings().done(function () {
					location.reload();
				}).fail(function (err) {
					console.error(err);
					waitingDialog.hide();
					alert('Ошибка при сбрасывании настроек.' + err.responseText);
				});
			});
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

		// Если ожидаем блокировки
		var $lockMessage = $('.lockMessage'),
			lockCountdown = 10000,
			lockTimer;
		if ($lockMessage.length) {
			$lockMessage.text(getCountdownMessage(lockCountdown));
			lockTimer = setInterval(function () {
				lockCountdown -= 1000;
				if (lockCountdown <= 0) {
					clearInterval(lockTimer);
					window.location.reload();
				}
				else {
					$lockMessage.text(getCountdownMessage(lockCountdown));
				}
			}, 1000);

			$('#forceLock').on('click', function () {
				if (confirm('Вы уверены?')) {
					clearInterval(lockTimer);
					$lockMessage.text('All your base are belong to us...');
					mainController.forceLock().done(function () {
						window.location.reload();
					}).fail(function () {
						window.location.reload();
					});
				}
			});
		}
	});

})(jQuery);

/**
 * Отображает сообщения об ошибках
 * @param message Сообщение
 */
var alert = function (message) {
	'use strict';
	var $alert = $(
			'<div class="alert alert-danger alert-dismissable fade">' +
			'<button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>' +
			message +
			'</div>');
	$('#alertContainer').prepend($alert.fadeIn()).children().addClass('in').scrollTo();
};

/**
 * Отображает произвольные сообщения
 * @param message Сообщение
 */
var info = function (message) {
	'use strict';
	var $alert = $(
			'<div class="alert alert-info alert-dismissable">' +
			'<button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>' +
			message +
			'</div>');
	$('#alertContainer').prepend($alert.fadeIn()).children().addClass('in').scrollTo();
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
