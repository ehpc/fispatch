spool setup.log append
SET SERVEROUTPUT ON
set verify off
set scan off

prompt  ================= [�����]_data.sql. BEGIN...

TIMING START SCRIPT
------ �������� ���������� (������� �� ����) ---------
@@sql/init.sql
------------------------------------
prompt DML
prompt ====================
prompt ��������! ������� ����� ����������� ����� �����...
----------------

--�������� ��� ����� �� ����� [�����]/DML, 
--@@[�����]/DML/[���_�����]
--������ 
@@credmon/DML/060_FCSAKB_2670_add_sys_param_dml.sql

------------------------------------
TIMING STOP

prompt  ================= [�����]_data.sql. END
prompt 

spool off
set echo off
exit 0


