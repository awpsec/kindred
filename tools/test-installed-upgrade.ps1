param([Parameter(Mandatory=$true)][string]$PreviousArchive,[Parameter(Mandatory=$true)][string]$ServerUrl,[Parameter(Mandatory=$true)][string]$ExpectedVersion)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot ('..\test-results\installed-upgrade-'+[Guid]::NewGuid().ToString('N'))))
$zip=[IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($PreviousArchive))
try{
    $release=$zip.GetEntry('release.json');$reader=New-Object IO.StreamReader($release.Open());try{$previous=($reader.ReadToEnd()|ConvertFrom-Json).version}finally{$reader.Dispose()}
    if($previous -notmatch '^\d+\.\d+\.\d+$' -or $ExpectedVersion -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid test version'}
    $old=Join-Path $root "versions\$previous";New-Item -ItemType Directory -Force -Path $old|Out-Null
    foreach($entry in $zip.Entries){if($entry.FullName -notmatch '^[A-Za-z0-9_.-]+$'){throw 'Unexpected archive path'};[IO.Compression.ZipFileExtensions]::ExtractToFile($entry,(Join-Path $old $entry.FullName),$false)}
}finally{$zip.Dispose()}
@{version=$previous}|ConvertTo-Json|Set-Content -Encoding UTF8 -LiteralPath (Join-Path $root 'current.json')
@{server='';serverUrl=$ServerUrl}|ConvertTo-Json|Set-Content -Encoding UTF8 -LiteralPath (Join-Path $root 'settings.json')
[IO.File]::WriteAllText((Join-Path $root 'profiles.json'),'{"entries":[],"last":"","launch_on_startup":false}')
$profileHash=(Get-FileHash -LiteralPath (Join-Path $root 'profiles.json')).Hash
$appdata=Join-Path $root 'fixture-appdata';$pins=Join-Path $appdata 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'
New-Item -ItemType Directory -Force -Path $pins|Out-Null
$pinPath=Join-Path $pins 'Kindred.lnk';$shell=New-Object -ComObject WScript.Shell;$pin=$shell.CreateShortcut($pinPath);$pin.TargetPath=Join-Path $old 'Kindred.exe';$pin.Save()
$start=New-Object Diagnostics.ProcessStartInfo
$start.FileName=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$start.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $old 'Update-Kindred.ps1')+'" -NoUi'
$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.EnvironmentVariables['APPDATA']=$appdata;$start.EnvironmentVariables['WEBVIEW2_USER_DATA_FOLDER']=Join-Path $root 'webview'
$running=$null;$updater=[Diagnostics.Process]::Start($start)
try{
    if(!$updater.WaitForExit(120000)){throw 'Installed updater timed out'}
    if($updater.ExitCode -ne 0){throw 'Installed updater failed'}
    $current=(Get-Content -Raw -LiteralPath (Join-Path $root 'current.json')|ConvertFrom-Json).version
    $status=Get-Content -Raw -LiteralPath (Join-Path $root 'update-status.json')|ConvertFrom-Json
    if($current -ne $ExpectedVersion -or $status.status -ne 'complete'){throw 'Verified upgrade did not complete'}
    $destination=Join-Path $root "versions\$ExpectedVersion";$target=Join-Path $destination 'Kindred.exe'
    $running=Get-Process -Name Kindred -ErrorAction SilentlyContinue|Where-Object Path -EQ $target|Select-Object -First 1
    if(!$running){throw 'New installed version is not running'}
    $pin=$shell.CreateShortcut($pinPath)
    if($pin.TargetPath -ne (Join-Path $env:WINDIR 'System32\wscript.exe') -or $pin.Arguments -ne ('"'+(Join-Path $root 'Launch.vbs')+'"')){throw 'Upgrade left a stale version pin'}
    foreach($name in @('Launch.ps1','Launch.vbs')){if((Get-FileHash -LiteralPath (Join-Path $root $name)).Hash -ne (Get-FileHash -LiteralPath (Join-Path $destination $name)).Hash){throw 'Stable launcher was not refreshed'}}
    if((Get-FileHash -LiteralPath (Join-Path $root 'profiles.json')).Hash -ne $profileHash){throw 'Upgrade changed saved profiles'}
    @{passed=$true;from=$previous;to=$current;signedChannel=$true;stalePinRepaired=$true;stableLauncherRefreshed=$true;profilesPreserved=$true;root=$root}|ConvertTo-Json -Compress
}finally{
    if(!$updater.HasExited){$updater.Kill()}
    if(!$running){$target=Join-Path $root "versions\$ExpectedVersion\Kindred.exe";$running=Get-Process -Name Kindred -ErrorAction SilentlyContinue|Where-Object Path -EQ $target|Select-Object -First 1}
    if($running -and !$running.HasExited){$running.CloseMainWindow()|Out-Null;if(!$running.WaitForExit(5000)){$running.Kill()}}
}
