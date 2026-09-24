[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$InstallRoot,[ValidateSet('Install','Remove')][string]$Action='Install',[switch]$NoShortcuts)
$ErrorActionPreference='Stop'
$env:PSModulePath=(Join-Path $PSHOME 'Modules')+';'+(Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$resultPath=Join-Path $PSScriptRoot 'result.ini'
$utf8=New-Object Text.UTF8Encoding($false)
function Result([string]$message,[int]$code=0){
    [IO.File]::WriteAllText($resultPath,"[Result]`r`nMessage="+($message -replace '[\r\n]',' ')+"`r`nRegistryKey=$registryKey`r`n",$utf8)
    Write-Output $message
    exit $code
}
function Hash([string]$path){
    $stream=[IO.File]::OpenRead($path);$hash=[Security.Cryptography.SHA256]::Create()
    try{return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$hash.Dispose()}
}
function NoLinks([string]$path){
    $item=[IO.DirectoryInfo]$path
    while($item){if($item.Exists -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'The installation path contains a link. Choose a regular folder.'};$item=$item.Parent}
}
function AtomicText([string]$path,[string]$text){
    $temp=$path+'.setup-new';[IO.File]::WriteAllText($temp,$text,$utf8)
    if([IO.File]::Exists($path)){
        $backup=$path+'.setup-previous';[IO.File]::Replace($temp,$path,$backup);Remove-Item -LiteralPath $backup -Force
    }else{[IO.File]::Move($temp,$path)}
}
function RuntimeInstalled {
    $key='Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
    foreach($path in @("HKCU:\Software\$key","HKLM:\Software\WOW6432Node\$key","HKLM:\Software\$key")){
        $v=(Get-ItemProperty -LiteralPath $path -Name pv -ErrorAction SilentlyContinue).pv
        if($v -and [version]$v -gt [version]'0.0.0.0'){return $true}
    }
    return $false
}
$stage=$null;$held=$false;$mutex=$null;$registryKey=''
try{
    if(![Environment]::Is64BitOperatingSystem){throw 'Kindred requires 64-bit Windows.'}
    if($InstallRoot -notmatch '^[A-Za-z]:\\' -or $InstallRoot.IndexOfAny([char[]]'"<>|') -ge 0){throw 'Choose a local installation folder.'}
    $install=[IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
    if($install.Length -lt 8 -or $install -eq [Environment]::GetFolderPath('UserProfile') -or $install -eq $env:WINDIR){throw 'Choose a dedicated Kindred installation folder.'}
    NoLinks $install
    $hasher=[Security.Cryptography.SHA256]::Create()
    try{$id=[BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($install.ToLowerInvariant()))).Replace('-','').Substring(0,16)}finally{$hasher.Dispose()}
    $registryKey='Software\Microsoft\Windows\CurrentVersion\Uninstall\Kindred-'+$id
    $mutex=New-Object Threading.Mutex($false,'Local\KindredDesktopUpdater')
    try{$held=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true}
    if(!$held){Result 'Another Kindred installation or update is running. Wait for it to finish, then retry.' 20}
    $prefix=$install+'\'
    $running=Get-CimInstance Win32_Process -Filter "Name='Kindred.exe' OR Name='kindred-desktop.exe'" | Where-Object {$_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath).StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)}
    if($running){Result 'Close Kindred, then click Retry to continue. Your profiles and settings will be kept.' 20}
    if($Action -eq 'Remove'){
        $metadataPath=Join-Path $install 'installer-files.json'
        $metadata=Get-Content -Raw -LiteralPath $metadataPath|ConvertFrom-Json
        if($metadata.root -ne $install){throw 'The installation record does not match this folder.'}
        $files=@($metadata.files)
        foreach($name in $files){if($name -notmatch '^[A-Za-z0-9_.-]+$'){throw 'Invalid installation file record.'}}
        $versions=Join-Path $install 'versions';NoLinks $versions
        foreach($folder in Get-ChildItem -LiteralPath $versions -Directory -ErrorAction SilentlyContinue){
            if($folder.Name -notmatch '^\d+\.\d+\.\d+$'){continue};NoLinks $folder.FullName
            foreach($name in $files){$p=Join-Path $folder.FullName $name;if(Test-Path -LiteralPath $p -PathType Leaf){Remove-Item -LiteralPath $p -Force}}
            if(!(Get-ChildItem -LiteralPath $folder.FullName -Force)){Remove-Item -LiteralPath $folder.FullName}
        }
        foreach($name in @('Launch.ps1','Launch.vbs','current.json','previous.json','installer-files.json')){
            $p=Join-Path $install $name;if(Test-Path -LiteralPath $p -PathType Leaf){Remove-Item -LiteralPath $p -Force}
        }
        $shortcutPath=Join-Path ([Environment]::GetFolderPath('Programs')) 'Kindred.lnk'
        if(Test-Path -LiteralPath $shortcutPath){$shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath);if($shortcut.Arguments -eq ('"'+(Join-Path $install 'Launch.vbs')+'"')){Remove-Item -LiteralPath $shortcutPath}}
        Result 'Kindred was uninstalled. Your saved profiles and local server data were kept.'
    }
    # Verify the same signed payload used by the in-app updater before writing the installation.
    $envelope=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'stable.json')|ConvertFrom-Json
    $payload=[Convert]::FromBase64String($envelope.payload);$signature=[Convert]::FromBase64String($envelope.signature)
    $rsa=New-Object Security.Cryptography.RSACryptoServiceProvider
    try{$rsa.FromXmlString((Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'update-public-key.xml')));if(!$rsa.VerifyData($payload,'SHA256',$signature)){throw 'The package signature is invalid. Nothing was installed.'}}finally{$rsa.Dispose()}
    $release=[Text.Encoding]::UTF8.GetString($payload)|ConvertFrom-Json
    if($release.version -notmatch '^\d+\.\d+\.\d+$' -or $release.platform -ne 'windows-x86_64' -or $release.channel -ne 'stable' -or $release.sha256 -notmatch '^[a-f0-9]{64}$' -or $release.size -le 0 -or $release.size -gt 67108864){throw 'Unsupported package manifest.'}
    $archivePath=Join-Path $PSScriptRoot 'package.zip'
    if((Get-Item -LiteralPath $archivePath).Length -ne $release.size -or (Hash $archivePath) -ne $release.sha256){throw 'The package failed its integrity check. Download setup again.'}
    $currentPath=Join-Path $install 'current.json';$previous=$null
    if(Test-Path -LiteralPath $currentPath){
        $previous=Get-Content -Raw -LiteralPath $currentPath|ConvertFrom-Json
        if($previous.version -notmatch '^\d+\.\d+\.\d+$'){throw 'The current installation needs inspection before updating.'}
        if([version]$previous.version -gt [version]$release.version){throw 'A newer version of Kindred is already installed. Use the latest setup file.'}
    }
    if(!(RuntimeInstalled)){
        Write-Output 'Installing Microsoft Edge WebView2. An internet connection is needed for this first setup.'
        $bootstrapper=Join-Path $PSScriptRoot 'MicrosoftEdgeWebview2Setup.exe';$signed=Get-AuthenticodeSignature -LiteralPath $bootstrapper
        if($signed.Status -ne 'Valid' -or $signed.SignerCertificate.Subject -notmatch '(^|, )O=Microsoft Corporation(,|$)'){throw 'Microsoft WebView2 setup could not be authenticated.'}
        $child=Start-Process -FilePath $bootstrapper -ArgumentList '/silent','/install' -WindowStyle Hidden -PassThru
        if(!$child.WaitForExit(300000)){throw 'Microsoft WebView2 setup is still running. Wait for it to finish, then retry Kindred setup.'}
        if(!(RuntimeInstalled)){throw 'Microsoft Edge WebView2 could not be installed. Check your internet connection or contact your IT administrator, then retry.'}
    }
    $stage=Join-Path $install ('staging\setup-'+[Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $stage|Out-Null;NoLinks $stage
    $archive=[IO.Compression.ZipFile]::OpenRead($archivePath);$names=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    try{
        $size=0L
        foreach($entry in $archive.Entries){
            $size+=$entry.Length
            if($size -gt 134217728 -or $entry.FullName -notmatch '^[A-Za-z0-9_.-]+$' -or !$names.Add($entry.FullName)){throw 'Unexpected package file or size.'}
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,(Join-Path $stage $entry.FullName),$false)
        }
    }finally{$archive.Dispose()}
    foreach($name in @('Kindred.exe','WebView2Loader.dll','Launch.ps1','Launch.vbs','Start-Kindred.ps1','Update-Kindred.ps1','Repair-Shortcuts.ps1','update-public-key.xml','release.json')){if(!$names.Contains($name)){throw "Package is missing $name."}}
    if((Get-Content -Raw -LiteralPath (Join-Path $stage 'release.json')|ConvertFrom-Json).version -ne $release.version){throw 'Package version mismatch.'}
    $versions=Join-Path $install 'versions';NoLinks $versions;New-Item -ItemType Directory -Force -Path $versions|Out-Null
    $destination=Join-Path $versions $release.version;NoLinks $destination
    if(Test-Path -LiteralPath $destination){
        foreach($name in $names){$p=Join-Path $destination $name;if(!(Test-Path -LiteralPath $p -PathType Leaf) -or (Hash $p) -ne (Hash (Join-Path $stage $name))){throw 'This version is already present with different files. Your existing installation was kept.'}}
    }else{[IO.Directory]::Move($stage,$destination);$stage=$null}
    $settings=Join-Path $install 'settings.json'
    if(!(Test-Path -LiteralPath $settings)){AtomicText $settings '{"server":"","serverUrl":""}'}
    foreach($name in @('Launch.ps1','Launch.vbs')){AtomicText (Join-Path $install $name) ([IO.File]::ReadAllText((Join-Path $destination $name)))}
    if(!$previous -or $previous.version -ne $release.version){
        if($previous){AtomicText (Join-Path $install 'previous.json') ($previous|ConvertTo-Json -Compress)}
        AtomicText $currentPath (@{version=$release.version}|ConvertTo-Json -Compress)
    }
    AtomicText (Join-Path $install 'installer-files.json') (@{root=$install;files=@($names)}|ConvertTo-Json -Compress)
    if(!$NoShortcuts){
        $shortcutPath=Join-Path ([Environment]::GetFolderPath('Programs')) 'Kindred.lnk';$shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
        $shortcut.TargetPath=Join-Path $env:WINDIR 'System32\wscript.exe';$shortcut.Arguments='"'+(Join-Path $install 'Launch.vbs')+'"';$shortcut.WorkingDirectory=$install
        $shortcut.IconLocation=(Join-Path $destination 'Kindred.exe')+',0';$shortcut.Description='Kindred';$shortcut.Save()
        & (Join-Path $destination 'Repair-Shortcuts.ps1') -InstallRoot $install
    }
    Result ('Kindred '+$release.version+' is installed. Your profiles and settings were kept.')
}catch{Result $_.Exception.Message 1}
finally{
    if($stage -and (Test-Path -LiteralPath $stage)){
        $resolved=[IO.Path]::GetFullPath($stage);$allowed=[IO.Path]::GetFullPath((Join-Path $install 'staging'))+'\'
        if($resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($resolved) -match '^setup-[a-f0-9]{32}$'){
            NoLinks $resolved;Remove-Item -LiteralPath $resolved -Recurse -Force
        }
    }
    if($held){$mutex.ReleaseMutex()};if($mutex){$mutex.Dispose()}
}
