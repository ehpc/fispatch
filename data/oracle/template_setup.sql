spool setup.log append
SET SERVEROUTPUT ON
set verify off
set scan off

prompt  =============== [схема]_setup.sql. BEGIN... ===============

TIMING START SCRIPT
------ загрузка параметров (трогать не надо) ---------
@@sql/init.sql


--Если имя схемы = credmon, то вставить кусок 
--Начало вставки для credmon
------------------ основные скрипты ------------------
prompt modify CRED_UTILS...
prompt ====================
------------------------------------

ALTER PACKAGE credmon.cred_utl COMPILE SPECIFICATION;
ALTER PACKAGE credmon.cred_utl compile BODY;

grant execute on cred_utl to public;
grant execute on cfg to public;

-- не убирать!
-- добавлЯетсЯ таблица
-- @@credmon/cred_utl.spc
-- @@credmon/cred_utl.bdy
ALTER PACKAGE credmon.cred_utl COMPILE SPECIFICATION;
ALTER PACKAGE credmon.cred_utl compile BODY;
grant execute on cred_utl to public;

prompt Remove duplicates...
prompt ====================
---------------------------------
--Конец вставки для credmon

prompt DDL...
prompt ====================
--Включить все файлы из папки [схема]/DDL, 
--@@[схема]/DDL/[имя_файла]
--пример 
@@credmon/DDL/059_FCSMTSPL_5_add_tab_ddl.sql

prompt Run Specs scripts...
prompt ====================
---------------------------------
--Включить все файлы из папки [схема] с расширением .spc 
--@@[схема]/[имя_файла]
--пример 
@@credmon/pwf_export.spc

prompt Run View
prompt =====================
--Включить все файлы из папки [схема] с расширением .vw 
--@@[схема]/[имя_файла]
--пример 
@@credmon/vwf_task_proto.vw

prompt Run Bodies scripts...
prompt ====================
---------------------------------
--Включить все файлы из папки [схема] с расширением .bdy 
--@@[схема]/[имя_файла]
--пример 
@@credmon/pwf_export.bdy

--Если имя схемы = credmon, то вставить кусок 
--Начало вставки для credmon
-- Доп. рекомпиляция пакетов (не убирать) ------
ALTER PACKAGE credmon.cfg COMPILE SPECIFICATION;
ALTER PACKAGE credmon.cfg compile BODY;
--Конец вставки для credmon

TIMING STOP

prompt  ================== [схема]_setup.sql. END. ================
prompt 

spool off
set echo off
exit 0
