# Downloads each [url, path] pair in a JSON list and saves a JPEG no larger than
# 360 px (tools/azure-shelf.mjs uses it for partner thumbnails, 2026-10-14).
# Usage: powershell -File tools/thumbs.ps1 <list.json> <site folder>
param([string]$List, [string]$Root)
Add-Type -AssemblyName System.Drawing
$pairs = Get-Content $List -Raw | ConvertFrom-Json
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 85L
foreach ($p in $pairs) {
  $url = $p[0]; $out = Join-Path $Root $p[1]
  if (Test-Path $out) { continue }
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing -TimeoutSec 60
    $img = [System.Drawing.Image]::FromFile($tmp)
    $s = [Math]::Min(1.0, 360.0 / [Math]::Max($img.Width, $img.Height))
    $w = [int]($img.Width * $s); $h = [int]($img.Height * $s)
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $w, $h)
    $bmp.Save($out, $codec, $ep)
    $g.Dispose(); $bmp.Dispose(); $img.Dispose()
    Write-Output "OK $out"
  } catch { Write-Output "FAIL $url $($_.Exception.Message)" }
  finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
}
