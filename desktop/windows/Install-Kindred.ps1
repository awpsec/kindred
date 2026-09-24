[CmdletBinding()]
param([string]$Server='', [string]$ServerUrl='', [switch]$Launch)
$ErrorActionPreference='Stop'
$version=(Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'release.json') | ConvertFrom-Json).version
if($version -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid release version.'}
$install=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs\Kindred'
$destination=Join-Path $install "versions\$version"
New-Item -ItemType Directory -Force -Path $destination | Out-Null
if(Test-Path -LiteralPath (Join-Path $destination 'Kindred.exe')){
    if((Get-FileHash (Join-Path $destination 'Kindred.exe')).Hash -ne (Get-FileHash (Join-Path $PSScriptRoot 'Kindred.exe')).Hash){throw 'A different build already occupies this version. Publish a new version.'}
}
Get-ChildItem -LiteralPath $PSScriptRoot | Copy-Item -Destination $destination -Recurse -Force
foreach($name in @('Launch.ps1','Launch.vbs')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $install $name) -Force}
if(!(Test-Path -LiteralPath (Join-Path $install 'settings.json'))){@{server=$Server;serverUrl=$ServerUrl}|ConvertTo-Json|Set-Content -Encoding UTF8 -LiteralPath (Join-Path $install 'settings.json')}
@{version=$version}|ConvertTo-Json|Set-Content -Encoding UTF8 -LiteralPath (Join-Path $install 'current.new.json')
$current=Join-Path $install 'current.json'
if(Test-Path -LiteralPath $current){[IO.File]::Replace((Join-Path $install 'current.new.json'),$current,(Join-Path $install 'previous.json'))}else{[IO.File]::Move((Join-Path $install 'current.new.json'),$current)}
$shortcutPath=Join-Path ([Environment]::GetFolderPath('Programs')) 'Kindred.lnk'
$shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
$shortcut.TargetPath=Join-Path $env:WINDIR 'System32\wscript.exe'
$shortcut.Arguments='"'+(Join-Path $install 'Launch.vbs')+'"'
$shortcut.WorkingDirectory=$install
$shortcut.IconLocation=(Join-Path $install "versions\$version\Kindred.exe")+',0'
$shortcut.Description='Kindred - your AI teammates'
$shortcut.Save()
& (Join-Path $destination 'Repair-Shortcuts.ps1') -InstallRoot $install
Write-Output "Installed Kindred $version. Search Kindred in Start."
if($Launch){Start-Process -FilePath $shortcutPath}
