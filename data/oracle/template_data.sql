spool setup.log append
SET SERVEROUTPUT ON
set verify off
set scan off

prompt  ================= [схема]_data.sql. BEGIN...

TIMING START SCRIPT
------ загрузка параметров (трогать не надо) ---------
@@sql/init.sql
------------------------------------
prompt DML
prompt ====================
prompt Внимание! Скрипты могут выполняться очень долго...
----------------

--Включить все файлы из папки [схема]/DML, 
--@@[схема]/DML/[имя_файла]
--пример 
@@credmon/DML/060_FCSAKB_2670_add_sys_param_dml.sql

------------------------------------
TIMING STOP

prompt  ================= [схема]_data.sql. END
prompt 

spool off
set echo off
exit 0


