chcp 1251
@ echo off
set NLS_LANG=AMERICAN_AMERICA.CL8MSWIN1251

rem ������������� ����� ������������
set SETTINGSFILE=config.ini
if not exist %SETTINGSFILE% ( 
    echo FAIL: config.ini not found
    exit /b 1
)
rem ��������� ���������� , �஬� ४������樨
for /f "eol=# delims== tokens=1,2" %%i in (%SETTINGSFILE%) do ( if NOT %%i == R ( set %%i=%%j))

rem ����塞 ����
sqlplus -S /nolog @sql/null.sql "Install %patch_ver% patch on FIS Collection System..."

Title Install %patch_ver% patch on FIS Collection System...

set NLS_LANG=AMERICAN_AMERICA.CL8MSWIN1251
rem ----- �஢�ઠ �� �ࠢ��쭮��� ������祭�� ----------
for /f "eol=# delims== tokens=1,2" %%i in (%SETTINGSFILE%) do (  if %%i == R (
echo.
sqlplus -L -S /nolog @sql/check_conn.sql  %%j@%dbhost% 
)
)

rem ----- �஢�ઠ �� ���㦥��� -------------------------
sqlplus -S %credmon_sch%@%dbhost% @sql/check.sql %patch_ver%
IF %errorlevel% EQU -1 GOTO err_exit


rem ��������� ����権 ��ࢨ筠� ��
rem sqlplus %credmon_sch%@%dbhost% @sql/reg_op_first.sql
rem IF %errorlevel% EQU -1 GOTO err_exit

rem ==== �뢮� ��奪⮢
rem echo.
rem echo ========================================================
rem echo ������⢮ ��������/���������� ��ꥪ⮢ � �奬��
rem for /f "eol=# delims== tokens=1,2" %%i in (%SETTINGSFILE%) do (  if %%i == R ( sqlplus %%j@%dbhost% @sql/cnt_valid_objs.sql))
rem ==========================================================

rem ---- ��� �।�०����� � �ᮡ�������� ��⠭���� ----
set contn=n
if %features% EQU 1 (
  echo.
  echo ========================================================
  echo ���� ����� �ᮡ������ ��⠭����. 
  echo �����⥫쭮 ���⠩� Readme.txt �०�� 祬 �த������!  
  set /p contn=�� ���. �ॡ������ �믮����� [Y - ��, N - ���]? 
) else (
goto start:
) 
if /i %contn%==Y (
  echo ========================================================
goto start:
) else ( 
  echo ����� ��⠭���� ���� ��ࢠ�. 	
  echo ========================================================
  GOTO err_exit
)
:start
rem ================== !������� ���� ������������� �� ����!  ================================

rem �������� ������� DDL
rem ������� 䠩�� ��� ��� �奬, ����� ���� � ����
sqlplus %[�奬�]_sch%@%dbhost% @[�奬�]_setup.sql

rem ==== ४�������� �奬, �ண��� �� ���� ==================
for /f "eol=# delims== tokens=1,2" %%i in (%SETTINGSFILE%) do (  if %%i == R ( sqlplus %%j@%dbhost% @sql/recompile2.sql ))
rem ==========================================================

rem �������� ������� DML
rem ������� 䠩�� ��� ��� �奬, ����� ���� � ����
sqlplus %[�奬�]_sch%@%dbhost% @[�奬�]_data.sql

rem ================== !������� ���� ������������� �� ����!  ================================
rem ��������� ������
sqlplus %credmon_sch%@%dbhost% @sql/reg_op.sql
rem ��⠭���� ���ᨨ ����
sqlplus %credmon_sch%@%dbhost% @sql/set_ver.sql %patch_ver%
rem �������� JOB�� � credmon
sqlplus %credmon_sch%@%dbhost% @sql/create_credmon_jobs.sql
rem ������ �࠭⮢ �� ��ꥪ�� CREDMON ��� STRATEGY
sqlplus %credmon_sch%@%dbhost% @sql/grants_2_strat_ddl.sql
rem ������ �࠭⮢ �� ��ꥪ�� CREDMON ��� STRATEGY
sqlplus %fcs_org_sch%@%dbhost% @sql/grants_fcs_org_2_strat_ddl.sql
rem �ࠢ�
sqlplus %strategy_sch%@%dbhost% @sql/grants_strat_2_pub_ddl.sql
rem �࠭���� ���⥣��
sqlplus %strategy_sch%@%dbhost% @sql/translate_all_strategy.sql
rem ����� ࠡ�� 
sqlplus %strategy_sch%@%dbhost% @sql/run_strat_jobs_dml.sql
rem �᫨ �������� �訡��
:err_exit
pause
