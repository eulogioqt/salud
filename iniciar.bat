@echo off
chcp 65001 >NUL
title Salud
cd /d "%~dp0"
set "PY="
where py >NUL 2>&1 && set "PY=py -3"
if not defined PY (where python >NUL 2>&1 && set "PY=python")
if not defined PY (
  echo No se ha encontrado Python 3.
  echo Instalalo con:  winget install Python.Python.3.12
  echo o desde https://www.python.org/downloads/ marcando "Add python.exe to PATH".
  pause
  exit /b 1
)
%PY% app\servidor.py %*
if errorlevel 1 pause
