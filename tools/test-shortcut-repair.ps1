$ErrorActionPreference='Stop'
$root=Join-Path $PSScriptRoot ('..\test-results\shortcuts-'+[Guid]::NewGuid().ToString('N'))
$root=[IO.Path]::GetFullPath($root);$install=Join-Path $root 'Kindred';$links=Join-Path $root 'Links';$version=Join-Path $install 'versions\0.48.3'
New-Item -ItemType Directory -Force -Path $version,$links|Out-Null
'{"version":"0.48.3"}'|Set-Content -LiteralPath (Join-Path $install 'current.json')
foreach($name in @('Launch.ps1','Launch.vbs','Kindred.exe')){'fixture'|Set-Content -LiteralPath (Join-Path $version $name)}
$shell=New-Object -ComObject WScript.Shell
function Link($name,$target,$arguments=''){$s=$shell.CreateShortcut((Join-Path $links ($name+'.lnk')));$s.TargetPath=$target;$s.Arguments=$arguments;$s.Save()}
$old=Join-Path $install 'versions\0.24.0\Kindred.exe'
Link 'Pinned Kindred' $old
Link 'Custom connection' $old 'https://custom.example.test'
Link 'Another install' (Join-Path $root 'Other\versions\0.24.0\Kindred.exe')
$script=Join-Path $PSScriptRoot '..\desktop\windows\Repair-Shortcuts.ps1'
& $script -InstallRoot $install -ShortcutRoots @($links)
$pin=$shell.CreateShortcut((Join-Path $links 'Pinned Kindred.lnk'))
if($pin.TargetPath -ne (Join-Path $env:WINDIR 'System32\wscript.exe') -or $pin.Arguments -ne ('"'+(Join-Path $install 'Launch.vbs')+'"')){throw 'Stable script launcher was not installed'}
if($shell.CreateShortcut((Join-Path $links 'Custom connection.lnk')).TargetPath -ne $old){throw 'Custom connection was changed'}
if($shell.CreateShortcut((Join-Path $links 'Another install.lnk')).TargetPath -notlike '*\Other\*'){throw 'Another installation was changed'}
if((Get-Content -Raw -LiteralPath (Join-Path $install 'Launch.ps1')).Trim() -ne 'fixture'){throw 'Stable launcher was not refreshed'}
'fixture'|Set-Content -LiteralPath (Join-Path $install 'KindredLauncher.exe')
Link 'Pinned Kindred' $old
& $script -InstallRoot $install -ShortcutRoots @($links)
& $script -InstallRoot $install -ShortcutRoots @($links)
$pin=$shell.CreateShortcut((Join-Path $links 'Pinned Kindred.lnk'))
if($pin.TargetPath -ne (Join-Path $install 'KindredLauncher.exe') -or $pin.Arguments){throw 'Stable native launcher was not preserved'}
@{passed=$true;stalePinMigrated=$true;nativeAndScriptLaunchers=$true;customConnectionsPreserved=$true;unrelatedInstallPreserved=$true;idempotent=$true;root=$root}|ConvertTo-Json -Compress
