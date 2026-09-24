$ErrorActionPreference = 'Stop'
try {
    $install = $PSScriptRoot
    $config = Get-Content -Raw -LiteralPath (Join-Path $install 'settings.json') | ConvertFrom-Json
    $current = Get-Content -Raw -LiteralPath (Join-Path $install 'current.json') | ConvertFrom-Json
    if ($current.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid installed version.' }
    $launcher = Join-Path $install "versions\$($current.version)\Start-Kindred.ps1"
    if (Test-Path -LiteralPath (Join-Path $install 'profiles.json')) {
        & $launcher
    } else {
        & $launcher -Server $config.server -ServerUrl $config.serverUrl
    }
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Kindred could not start') | Out-Null
    exit 1
}
