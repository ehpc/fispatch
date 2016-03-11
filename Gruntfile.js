/**
 * @author Eugene Maslovich <ehpc@em42.ru>
 */

module.exports = function (grunt) {

	// Настраиваем grunt
	grunt.initConfig({
		// Настройки отладочного сервера
		express: {
			options: {
				delay: 1000
			},
			dev: {
				options: {
					script: 'bin/server-debug',
					opts: ['--debug']
				}
			}
		},
		// Настройки слежения за изменёнными файлами
		watch: {
			express: {
				files: ['**/*.js', 'public/**/*.css', 'views/**/*.jade'],
				tasks:  ['express:dev'],
				options: {
					spawn: false
				}
			}
		},
		// Настройки для запуска отладчика
		'external_daemon': {
			nodeInspector: {
				options: {
					verbose: true
				},
				cmd: 'node-inspector',
				args: ['--web-port=8181']
			}
		},
		// Настройки анализатора кода
		jshint: {
			all: ['Gruntfile.js', 'app.js', 'controllers/**/*.js', 'public/**/*.js', 'bin/**/server-debug']
		},
		// Настройки запуска продакшн-сервера
		forever: {
			prod: {
				options: {
					index: 'bin/server-prod',
					command: 'node',
					logDir: 'logs'
				}
			}
		}
	});

	// Подключаем зависимости
	grunt.loadNpmTasks('grunt-express-server');
	grunt.loadNpmTasks('grunt-contrib-watch');
	grunt.loadNpmTasks('grunt-external-daemon');
	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-forever');

	// Задача, запускающая отладочный стек
	// 1. Весь js-код проверяется с помощью jshint. Если есть ошибки, запуск прерывается.
	// 2. Запускается сервер отладчика.
	// 3. Запускается веб сервер.
	// 4. Запускается механизм слежения за файлами, который перезапускает сервер, если файлы были изменены.
	grunt.registerTask('start-dev', ['jshint', /*'external_daemon:nodeInspector',*/ 'express:dev', 'watch']);

	// Задача, запускающая веб сервер в режиме «продакшн»
	// Весь js-код проверяется с помощью jshint. Если есть ошибки, запуск прерывается.
	grunt.registerTask('start', ['forever:prod:start']);

	// Задача для остановки сервера
	grunt.registerTask('stop', ['forever:prod:stop']);
	
	grunt.registerTask('restart', ['forever:prod:stop', 'jshint', 'forever:prod:start']);

	// Задача «по умолчанию» ничего не делает, а просто выводит справку по командам
	grunt.registerTask('default', function () {
		grunt.log.writeln();
		grunt.log.ok('Наберите "' + 'grunt start'.yellow + '", чтобы запустить приложение.');
		grunt.log.ok('Наберите "' + 'grunt stop'.yellow + '", чтобы остановить приложение.');
		grunt.log.ok('Наберите "' + 'grunt start-dev'.yellow + '", чтобы запустить приложение в режиме отладки.');
	});
};
