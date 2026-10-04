@echo off
chcp 65001 >nul
rem Запуск Crimson Vigil: локальный сервер + браузер.
cd /d "%~dp0"
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8080"
echo Crimson Vigil: сервер на http://localhost:8080  (закройте это окно, чтобы остановить)
python tools\serve.py 8080
