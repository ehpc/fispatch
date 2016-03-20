chcp 1251
@ echo off
set NLS_LANG=AMERICAN_AMERICA.CL8MSWIN1251

rem ИНИЦИАЛИЗАЦИЯ ФАЙЛА КОНФИГУРАЦИИ
set SETTINGSFILE=config.ini
if not exist %SETTINGSFILE% ( 
    echo FAIL: config.ini not found
    exit /b 1
)
rem УСТАНОВКА ПАРАМЕТРОВ , кроме рекомпиляции
for /f "eol=# delims== tokens=1,2" %%i in (%SETTINGSFILE%) do ( if NOT %%i == R ( set %%i=%%j))

rem зануляем логи
sqlplus -S /nolog @sql/null.sql "Install %patch_ver% patch on FIS Collection System..."

Title Install %patch_ver% patch on FIS Collection System...

set NLS_LANG=AMERICAN_AMERICA.CL8MSWIN1251
rem ----- проверка на правильность подключения ----------
for /f "eol=# delims== tokens=1,2" %%i in (%SETTINGSFILE%) do (  if %%i == R (
echo.
sqlplus -L -S /nolog @sql/check_conn.sql  %%j@%dbhost% 
)
)

rem ----- проверка на окружение -------------------------
sqlplus -S %credmon_sch%@%dbhost% @sql/check.sql %patch_ver%
IF %errorlevel% EQU -1 GOTO err_exit


rem Регистрация операций первичная до
rem sqlplus %credmon_sch%@%dbhost% @sql/reg_op_first.sql
rem IF %errorlevel% EQU -1 GOTO err_exit

rem ==== вывод обхектов
rem echo.
rem echo ========================================================
rem echo Количество валидных/невалидных объектов в схемах
rem for /f "eol=# delims== tokens=1,2" %%i in (%SETTINGSFILE%) do (  if %%i == R ( sqlplus %%j@%dbhost% @sql/cnt_valid_objs.sql))
rem ==========================================================

rem ---- доп предупреждение о особенностях установки ----
set contn=n
if %features% EQU 1 (
  echo.
  echo ========================================================
  echo Патч имеет особенности установки. 
  echo Внимательно прочитайте Readme.txt прежде чем продолжить!  
  set /p contn=Все доп. требования выполнены [Y - да, N - нет]? 
) else (
goto start:
) 
if /i %contn%==Y (
  echo ========================================================
goto start:
) else ( 
  echo Процесс установки патча прерван. 	
  echo ========================================================
  GOTO err_exit
)
:start
rem ================== !СТРОЧКИ ВЫШЕ РЕДАКТИРОВАТЬ НЕ НАДО!  ================================

rem ОСНОВНЫЕ СКРИПТЫ DDL
rem Включить файла для всех схем, которые есть в патче
sqlplus %[схема]_sch%@%dbhost% @[схема]_setup.sql

rem ==== рекопмиляция схем, трогать не надо ==================
for /f "eol=# delims== tokens=1,2" %%i in (%SETTINGSFILE%) do (  if %%i == R ( sqlplus %%j@%dbhost% @sql/recompile2.sql ))
rem ==========================================================

rem ОСНОВНЫЕ СКРИПТЫ DML
rem Включить файла для всех схем, которые есть в патче
sqlplus %[схема]_sch%@%dbhost% @[схема]_data.sql

rem ================== !СТРОЧКИ НИЖЕ РЕДАКТИРОВАТЬ НЕ НАДО!  ================================
rem Регистрация операция
sqlplus %credmon_sch%@%dbhost% @sql/reg_op.sql
rem Установка версии патча
sqlplus %credmon_sch%@%dbhost% @sql/set_ver.sql %patch_ver%
rem Создание JOBов в credmon
sqlplus %credmon_sch%@%dbhost% @sql/create_credmon_jobs.sql
rem Раздача грантов на объекты CREDMON для STRATEGY
sqlplus %credmon_sch%@%dbhost% @sql/grants_2_strat_ddl.sql
rem Раздача грантов на объекты CREDMON для STRATEGY
sqlplus %fcs_org_sch%@%dbhost% @sql/grants_fcs_org_2_strat_ddl.sql
rem Права
sqlplus %strategy_sch%@%dbhost% @sql/grants_strat_2_pub_ddl.sql
rem Трансляция стратегий
sqlplus %strategy_sch%@%dbhost% @sql/translate_all_strategy.sql
rem Запуск работ 
sqlplus %strategy_sch%@%dbhost% @sql/run_strat_jobs_dml.sql
rem если возникла ошибка
:err_exit
pause
