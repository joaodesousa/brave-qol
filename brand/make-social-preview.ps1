Add-Type -AssemblyName System.Drawing

$W = 1280
$H = 640
$ink   = [System.Drawing.Color]::FromArgb(255, 0x14, 0x17, 0x1A)
$paper = [System.Drawing.Color]::FromArgb(255, 0xF3, 0xF1, 0xEC)
$teal   = [System.Drawing.Color]::FromArgb(255, 0x00, 0x96, 0x8C)
$orange = [System.Drawing.Color]::FromArgb(255, 0xFF, 0x5A, 0x1E)
$sub    = [System.Drawing.Color]::FromArgb(255, 0x8B, 0x93, 0x8F)

$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$g.FillRectangle((New-Object System.Drawing.SolidBrush($ink)), 0, 0, $W, $H)

# badge: paper square, ink chevron (inverted mark, reads on the dark ground)
$badge = New-Object System.Drawing.Rectangle(140, 220, 200, 200)
$g.FillRectangle((New-Object System.Drawing.SolidBrush($paper)), $badge)
$pen = New-Object System.Drawing.Pen($ink, 22)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$cx = $badge.X
$cy = $badge.Y
$chevron = @(
  (New-Object System.Drawing.Point(($cx+66), ($cy+66))),
  (New-Object System.Drawing.Point(($cx+130), ($cy+100))),
  (New-Object System.Drawing.Point(($cx+66), ($cy+134)))
)
$g.DrawLines($pen, $chevron)

# wordmark — GenericTypographic drops GDI+'s default per-string bearing,
# which otherwise differs between the bold and regular weights and throws
# off the shared left edge.
$fmt = [System.Drawing.StringFormat]::GenericTypographic
$textX = $badge.X + $badge.Width + 48
$titleFont = New-Object System.Drawing.Font("Consolas", 62, [System.Drawing.FontStyle]::Bold)
$g.DrawString("brave-qol", $titleFont, (New-Object System.Drawing.SolidBrush($paper)), $textX, ($badge.Y + 18), $fmt)

$tagFont = New-Object System.Drawing.Font("Consolas", 22, [System.Drawing.FontStyle]::Regular)
$g.DrawString("no accounts. no telemetry. no bloat.", $tagFont, (New-Object System.Drawing.SolidBrush($sub)), $textX, ($badge.Y + 108), $fmt)

# signature rule beneath the wordmark
$ruleY = $badge.Y + 160
$ruleW = 430
$g.FillRectangle((New-Object System.Drawing.SolidBrush($teal)), $textX, $ruleY, ($ruleW/2 - 4), 7)
$g.FillRectangle((New-Object System.Drawing.SolidBrush($orange)), ($textX + $ruleW/2 + 4), $ruleY, ($ruleW/2 - 4), 7)

$outPath = "C:\Users\User\CascadeProjects\brave-qol\brand\social-preview.png"
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
"saved: $outPath"
