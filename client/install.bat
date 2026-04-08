@echo off
:: UltraRAT Client — Service Installer
:: Run this on the target machine (no Node.js required).
:: Place this file in the same folder as:
::   ultrarat-client-win.exe
::   config.json
::   install-windows.ps1

powershell.exe -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1"
