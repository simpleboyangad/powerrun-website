@echo off
REM ===========================================================================
REM  PowerRun Industries - publish SEO changes to powerrun.in
REM
REM  Double-click this file after changing anything in Admin > SEO Manager
REM  (or after adding / renaming a product). It rebuilds the static SEO tags,
REM  sitemap.xml and robots.txt, then publishes them.
REM
REM  It only ever touches SEO output + asset stamps. If there is nothing new,
REM  it says so and stops.
REM ===========================================================================
cd /d "%~dp0"
echo.
echo ================================================
echo   PowerRun - SEO publish
echo ================================================
echo.

echo [1/4] Reading SEO settings and rebuilding sitemap.xml + robots.txt...
python scripts\seo_build.py
if errorlevel 1 goto failed
echo.

echo [2/4] Updating file versions...
python scripts\stamp_assets.py
if errorlevel 1 goto failed
echo.

echo [3/4] Saving changes...
REM only the SEO output, never whatever else is lying around in the folder
git add sitemap.xml robots.txt products assets *.html about account admin cart checkout contact dealer order-confirmation product service set-password track-order warranty
git diff --cached --quiet
if not errorlevel 1 (
  echo       Nothing new to publish - the website is already up to date.
  goto done
)
git commit -q -m "Update SEO"
if errorlevel 1 goto failed
echo.

echo [4/4] Publishing to powerrun.in...
git push -q origin main
if errorlevel 1 goto failed
echo.
echo   Published. The website updates in about 1-2 minutes.
echo   Sitemap: https://powerrun.in/sitemap.xml

:done
echo.
echo ================================================
echo   Finished.
echo ================================================
pause
exit /b 0

:failed
echo.
echo ------------------------------------------------
echo   Something went wrong. Nothing was published.
echo   Send this whole window as a screenshot.
echo ------------------------------------------------
pause
exit /b 1
