@echo off
echo "Archiving this folder..."

set detail=%1

set filename="%detail%"

if "%detail%"=="" set filename=Node_communication

"C:\Program Files\WinRAR\rar.exe" a -agYY-MM-DD(HH-mm-SS) ..\backup\%filename%- -r -x*.bak -x.settings -x*.pch  -x*.idb  -xsrcbackup -x*.ncb -x*.opt -x*.pdb -x*.bsc -x*.res -x*.sbr -x*.clw -x*.scc -x*.rar -x*.dll -xgen -xobj -xbin -x.svn
pause
