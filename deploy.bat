@echo off
cd /d "%~dp0"
echo.
echo Deploying Lavish Leaf website to lavishleaf.org...
echo.
git add .
git commit -m "Site update"
git push
echo.
echo Done! Your changes are live at lavishleaf.org in a few seconds.
echo.
pause
