[CmdletBinding()]
param([string]$InstallRoot=(Split-Path -Parent (Split-Path -Parent $PSScriptRoot)), [string[]]$ShortcutRoots=@(
    [Environment]::GetFolderPath('Programs'),
    [Environment]::GetFolderPath('Desktop'),
    (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar')
))
$ErrorActionPreference='Stop'
$install=[IO.Path]::GetFullPath($InstallRoot)
$current=(Get-Content -Raw -LiteralPath (Join-Path $install 'current.json')|ConvertFrom-Json).version
if($current -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid installed version.'}
$versionRoot=Join-Path $install "versions\$current"
foreach($name in @('Launch.ps1','Launch.vbs')){
    $source=Join-Path $versionRoot $name
    if(Test-Path -LiteralPath $source){Copy-Item -LiteralPath $source -Destination (Join-Path $install $name) -Force}
}
$target=Join-Path $install 'KindredLauncher.exe';$arguments=''
if(!(Test-Path -LiteralPath $target)){$target=Join-Path $env:WINDIR 'System32\wscript.exe';$arguments='"'+(Join-Path $install 'Launch.vbs')+'"'}
$shell=New-Object -ComObject WScript.Shell
$pattern='^'+[Regex]::Escape((Join-Path $install 'versions')+'\')+'\d+\.\d+\.\d+\\Kindred\.exe$'
foreach($folder in $ShortcutRoots){
    if(!(Test-Path -LiteralPath $folder)){continue}
    foreach($file in Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue){
        $shortcut=$shell.CreateShortcut($file.FullName)
        # Preserve explicitly configured custom connection shortcuts.
        if($shortcut.TargetPath -notmatch $pattern -or $shortcut.Arguments){continue}
        $shortcut.TargetPath=$target;$shortcut.Arguments=$arguments;$shortcut.WorkingDirectory=$install
        $shortcut.IconLocation=(Join-Path $versionRoot 'Kindred.exe')+',0'
        $shortcut.Save()
    }
}
