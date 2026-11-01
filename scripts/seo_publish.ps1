# PowerRun Industries - one-click SEO publish (desktop shortcut "PowerRun SEO Push").
#
# Rebuilds every SEO output from the live database and the blog sources, then pushes
# them so GitHub Pages publishes them on powerrun.in:
#   blog_build -> merchant_feed -> seo_build -> stamp_assets -> commit -> push
# Only files changed by this build are committed; anything you were already editing
# is left alone. Reads only public data - no Supabase token needed.

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$env:PYTHONUTF8 = '1'

function Step($text) { Write-Host ''; Write-Host ">> $text" -ForegroundColor Cyan }
function Done($text, $color) { Write-Host ''; Write-Host $text -ForegroundColor $color; Read-Host 'Band karne ke liye Enter dabayein' | Out-Null; exit }

try {
    Step 'Latest code GitHub se le rahe hain...'
    git pull --rebase --autostash --quiet
    if ($LASTEXITCODE -ne 0) { Done 'git pull nahi hua - Claude ko batayein.' Red }

    $before = @(git status --porcelain | ForEach-Object { $_.Substring(3) })

    Step 'Blog pages bana rahe hain...';      python scripts/blog_build.py;   if ($LASTEXITCODE) { throw 'blog_build' }
    Step 'Google Merchant feed bana rahe hain...'; python scripts/merchant_feed.py; if ($LASTEXITCODE) { throw 'merchant_feed' }
    Step 'Product pages, sitemap aur SEO tags bana rahe hain...'; python scripts/seo_build.py; if ($LASTEXITCODE) { throw 'seo_build' }
    Step 'CSS / JS versions update kar rahe hain...'; python scripts/stamp_assets.py; if ($LASTEXITCODE) { throw 'stamp_assets' }

    $changed = @(git status --porcelain | ForEach-Object { $_.Substring(3) } |
        Where-Object { $before -notcontains $_ -and $_ -notmatch '^(x/|private/|docs/)' })
    if ($changed.Count -eq 0) { Done 'Sab pehle se up to date hai - push karne ko kuch naya nahi.' Green }

    Step ("{0} files badli hain, push kar rahe hain..." -f $changed.Count)
    git add -- $changed
    git commit --quiet -m "SEO: rebuild pages, sitemap and Merchant feed (desktop shortcut)"
    git push --quiet
    if ($LASTEXITCODE -ne 0) { Done 'Push nahi hua - internet check karein ya Claude ko batayein.' Red }
    Done 'Ho gaya! 2-5 minute mein powerrun.in par live ho jayega.' Green
}
catch {
    Done ("Rukna pada ({0}). Ye message Claude ko bhej dein." -f $_) Red
}
