# Делает скриншот игры в headless Chrome и печатает console-лог страницы.
# Пример: powershell -File tools/shot.ps1 -Query "scenario=overview&steps=60" -Name overview
param(
    [string]$Query = 'scenario=overview',
    [string]$Name = 'shot',
    [int]$Width = 1280,
    [int]$Height = 720,
    [int]$Budget = 20000,
    [int]$Port = 8080
)
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root 'screenshots'
New-Item -ItemType Directory -Force $dir | Out-Null
$png = Join-Path $dir "$Name.png"
$log = Join-Path $dir "$Name.log"
if (Test-Path $png) { Remove-Item $png }
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$profileDir = Join-Path $env:TEMP 'claude-headless-profile'
$url = "http://localhost:$Port/index.html?$Query"
$chromeArgs = @(
    '--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--hide-scrollbars', '--mute-audio', "--window-size=$Width,$Height",
    "--virtual-time-budget=$Budget", "--user-data-dir=$profileDir",
    '--enable-logging=stderr', '--v=0', "--screenshot=$png", $url
)
$p = Start-Process -FilePath $chrome -ArgumentList $chromeArgs -RedirectStandardError $log -Wait -PassThru -NoNewWindow
Get-Content $log | Where-Object { $_ -match 'CONSOLE' } | ForEach-Object {
    ($_ -replace '^\[[^\]]*CONSOLE[^\]]*\]\s*', '') -replace ', source: http://localhost:\d+/', ' @ '
}
if (Test-Path $png) { "saved: $png" } else { "NO SCREENSHOT (exit $($p.ExitCode))" }
