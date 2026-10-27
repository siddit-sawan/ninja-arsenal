# Packs the game for the CrazyGames Developer Portal: dist/ninja-arsenal.zip
$root = $PSScriptRoot
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$zip = Join-Path $dist 'ninja-arsenal.zip'
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path (Join-Path $root 'index.html'), (Join-Path $root 'js'), (Join-Path $root 'vendor') -DestinationPath $zip
"Built $zip ($([math]::Round((Get-Item $zip).Length / 1KB)) KB)"
