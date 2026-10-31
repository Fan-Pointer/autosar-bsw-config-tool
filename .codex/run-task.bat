@echo off
node "%~dp0run-task.cjs" %1
exit /b %errorlevel%
