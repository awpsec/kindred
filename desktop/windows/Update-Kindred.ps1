[CmdletBinding()]
param([int]$AppPid=0, [switch]$CheckOnly, [switch]$VerifyOnly, [switch]$NoUi)
$ErrorActionPreference='Stop'
$env:PSModulePath=(Join-Path $PSHOME 'Modules')+';'+(Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules')
function Get-Sha256([string]$path){
    $stream=[IO.File]::OpenRead($path);$hash=[Security.Cryptography.SHA256]::Create()
    try{return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$hash.Dispose()}
}
Add-Type -AssemblyName System.Windows.Forms,System.Drawing,System.IO.Compression.FileSystem
$env:KINDRED_ACCESS_TOKEN=$null
$install=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$mutex=New-Object Threading.Mutex($false,'Local\KindredDesktopUpdater')
try{if(!$mutex.WaitOne(0)){exit 0}}catch [Threading.AbandonedMutexException]{}
$script:cancelled=$false
$script:committed=$false
$form=New-Object Windows.Forms.Form
$form.Text='Kindred update';$form.Size=New-Object Drawing.Size(460,265)
$form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
$form.BackColor=[Drawing.Color]::FromArgb(22,23,24);$form.ForeColor=[Drawing.Color]::White
$form.Font=New-Object Drawing.Font('Segoe UI',10)
$title=New-Object Windows.Forms.Label;$title.Text='Checking for updates';$title.Location=New-Object Drawing.Point(28,26);$title.Size=New-Object Drawing.Size(398,32);$title.Font=New-Object Drawing.Font('Segoe UI Semibold',16)
$detail=New-Object Windows.Forms.Label;$detail.Text='Connecting to your Kindred release stream...';$detail.Location=New-Object Drawing.Point(30,70);$detail.Size=New-Object Drawing.Size(392,62)
$progress=New-Object Windows.Forms.ProgressBar;$progress.Location=New-Object Drawing.Point(30,143);$progress.Size=New-Object Drawing.Size(390,8);$progress.Style='Marquee'
$close=New-Object Windows.Forms.Button;$close.Text='Cancel';$close.Location=New-Object Drawing.Point(326,176);$close.Size=New-Object Drawing.Size(94,32);$close.FlatStyle='Flat';$close.Add_Click({$script:cancelled=$true;$form.Close()})
$form.Controls.AddRange(@($title,$detail,$progress,$close))
$form.Add_FormClosing({if(!$script:committed){$script:cancelled=$true}})
function Status([string]$phase,[string]$message,[int]$percent=0){
    $status=@{time=[DateTime]::UtcNow.ToString('o');status=$phase;message=$message;progress=$percent;version=$script:targetVersion}|ConvertTo-Json
    $path=Join-Path $install 'update-status.json';$temp=Join-Path $install 'update-status.new.json'
    [IO.File]::WriteAllText($temp,$status,(New-Object Text.UTF8Encoding($false)))
    if(Test-Path -LiteralPath $path){[IO.File]::Replace($temp,$path,(Join-Path $install "update-status.previous.json"))}else{[IO.File]::Move($temp,$path)}
}
function Tick { if(!$NoUi){[Windows.Forms.Application]::DoEvents()};if($NoUi -and (Test-Path -LiteralPath (Join-Path $install 'update.cancel'))){$script:cancelled=$true};if($script:cancelled){throw 'Update cancelled. Your installed version was kept.'} }
function Download([string]$url,[string]$path,[long]$limit,[long]$expected=0){
    $request=[Net.HttpWebRequest]::Create($url);$request.UserAgent='Kindred-Updater';$request.Timeout=15000;$request.ReadWriteTimeout=15000;$request.AllowAutoRedirect=$false
    $response=$request.GetResponse()
    for($redirects=0;[int]$response.StatusCode -in @(301,302,303,307,308);$redirects++){
        if($redirects -ge 5){$response.Dispose();throw 'Too many update redirects.'}
        $next=[Uri]::new([Uri]$url,[string]$response.Headers['Location']);$response.Dispose()
        if($next.Scheme -ne 'https' -or $next.Port -ne 443 -or $next.UserInfo -or $next.Host -notin @('github.com','release-assets.githubusercontent.com','objects.githubusercontent.com')){throw 'Untrusted update redirect.'}
        $url=$next.AbsoluteUri;$request=[Net.HttpWebRequest]::Create($url);$request.UserAgent='Kindred-Updater';$request.Timeout=15000;$request.ReadWriteTimeout=15000;$request.AllowAutoRedirect=$false
        $response=$request.GetResponse()
    }
    try{
        if([int]$response.StatusCode -ne 200){throw 'The update server did not return a release.'}
        if($response.ContentLength -gt $limit){throw 'The download is too large.'}
        $input=$response.GetResponseStream();$output=[IO.File]::Create($path)
        try{
            $buffer=New-Object byte[] 65536;$received=0L
            while(($count=$input.Read($buffer,0,$buffer.Length)) -gt 0){
                $received+=$count;if($received -gt $limit){throw 'The download exceeded its size limit.'}
                $output.Write($buffer,0,$count)
                if($expected -gt 0){$progress.Style='Continuous';$progress.Value=[Math]::Min(100,[int](100*$received/$expected));$detail.Text=('{0:N1} MB of {1:N1} MB' -f ($received/1MB),($expected/1MB))}
                if($expected -gt 0){Status 'downloading' $detail.Text $progress.Value}
                Tick
            }
            if($expected -gt 0 -and $received -ne $expected){throw 'The download was incomplete. Please try again.'}
        }finally{$output.Dispose();$input.Dispose()}
    }finally{$response.Dispose()}
}
function Set-Current([string]$version){
    $next=Join-Path $install 'current.update.json';@{version=$version}|ConvertTo-Json|Set-Content -Encoding UTF8 -LiteralPath $next
    [IO.File]::Replace($next,(Join-Path $install 'current.json'),(Join-Path $install 'previous.json'))
}
$work=$null
try{
    if(!$CheckOnly -and !$VerifyOnly -and !$NoUi){$form.Show();$form.Hide();$form.Show();$form.Activate()};Tick
    $base='https://github.com/awpsec/kindred/releases'
    Status 'checking' 'Checking the signed stable release'
    $current=(Get-Content -Raw -LiteralPath (Join-Path $install 'current.json')|ConvertFrom-Json).version
    if($current -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid installed version.'}
    $work=Join-Path $install ('staging\'+[Guid]::NewGuid().ToString('N'));New-Item -ItemType Directory -Force -Path $work|Out-Null
    $feed=Join-Path $work 'feed.json';Download "$base/latest/download/stable.json" $feed 65536
    $envelope=Get-Content -Raw -LiteralPath $feed|ConvertFrom-Json
    $payload=[Convert]::FromBase64String($envelope.payload);$signature=[Convert]::FromBase64String($envelope.signature)
    $rsa=New-Object Security.Cryptography.RSACryptoServiceProvider
    try{$rsa.FromXmlString((Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'update-public-key.xml')));if(!$rsa.VerifyData($payload,'SHA256',$signature)){throw 'The update signature is invalid. Nothing was installed.'}}finally{$rsa.Dispose()}
    $release=[Text.Encoding]::UTF8.GetString($payload)|ConvertFrom-Json
    if($release.version -notmatch '^\d+\.\d+\.\d+$' -or $release.platform -ne 'windows-x86_64' -or $release.channel -ne 'stable' -or $release.sha256 -notmatch '^[a-f0-9]{64}$' -or $release.size -le 0 -or $release.size -gt 67108864){throw 'The signed release description is not supported.'}
    $script:targetVersion=$release.version
    if(!$VerifyOnly -and [version]$release.version -le [version]$current){if($CheckOnly -and !$VerifyOnly){Write-Output "Verified current release $current";exit 0};if($NoUi){Status 'current' "Kindred $current is the latest installed version." 100;exit 0};$title.Text="You're up to date";$detail.Text="Kindred $current is the latest installed version.";$progress.Style='Continuous';$progress.Value=100;$close.Text='Close';$form.Activate();while($form.Visible){[Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 50};exit 0}
    if($CheckOnly -and !$VerifyOnly){Write-Output "Verified release $($release.version)";exit 0}
    Status 'downloading' 'Downloading the signed release'
    $title.Text='Downloading update';Tick
    $zip=Join-Path $work 'release.zip';Download "$base/download/v$($release.version)/Kindred-$($release.version)-Windows-Update.zip" $zip 67108864 $release.size
    Status 'verifying' 'Checking the download and preparing the new version' 100
    $title.Text='Verifying download';$detail.Text='Checking the signed release and preparing the new version.';Tick
    if((Get-Sha256 $zip) -ne $release.sha256){throw 'The download failed its integrity check. Nothing was installed.'}
    $unpacked=Join-Path $work 'unpacked';New-Item -ItemType Directory -Path $unpacked|Out-Null
    $archive=[IO.Compression.ZipFile]::OpenRead($zip)
    try{
        $total=0L;$seen=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
        foreach($entry in $archive.Entries){
            $total+=$entry.Length;if($total -gt 134217728){throw 'The extracted release exceeds its size limit.'}
            if($entry.FullName -notmatch '^[A-Za-z0-9_.-]+$' -or !$seen.Add($entry.FullName)){throw 'Unexpected or duplicate release file path.'}
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,(Join-Path $unpacked $entry.FullName),$false)
        }
    }finally{$archive.Dispose()}
    foreach($required in @('Kindred.exe','WebView2Loader.dll','Start-Kindred.ps1','Update-Kindred.ps1','update-public-key.xml','release.json')){if(!(Test-Path -LiteralPath (Join-Path $unpacked $required))){throw "Release is missing $required."}}
    if((Get-Content -Raw -LiteralPath (Join-Path $unpacked 'release.json')|ConvertFrom-Json).version -ne $release.version){throw 'Package and manifest versions do not match.'}
    if($VerifyOnly){Write-Output "Verified signature, download, archive and version $($release.version)";exit 0}
    $destination=Join-Path $install "versions\$($release.version)"
    if(Test-Path -LiteralPath $destination){
        foreach($file in Get-ChildItem -LiteralPath $unpacked -File){
            $existing=Join-Path $destination $file.Name
            if(!(Test-Path -LiteralPath $existing) -or (Get-Sha256 $existing) -ne (Get-Sha256 $file.FullName)){throw 'An existing version directory differs from the verified release.'}
        }
    }else{[IO.Directory]::Move($unpacked,$destination)}
    Status 'restarting' 'The download is verified. Restarting Kindred...' 100
    $title.Text='Ready to restart';$detail.Text='The download is verified. Restarting Kindred...';$progress.Value=100;Tick
    # Only the exact app process that requested this update may be stopped.
    if($AppPid -gt 0){
        $process=Get-Process -Id $AppPid -ErrorAction SilentlyContinue
        if($process){if($process.Path -ne (Join-Path $install "versions\$current\Kindred.exe")){throw 'The requesting app is not this installed version.'};$deadline=[DateTime]::UtcNow.AddSeconds(10);while(!$process.HasExited -and [DateTime]::UtcNow -lt $deadline){$process.Refresh();$process.CloseMainWindow()|Out-Null;$process.WaitForExit(500)|Out-Null};if(!$process.HasExited){throw 'Kindred has not closed. Finish any open dialogs and try again.'}}
    }
    Set-Current $release.version;$script:committed=$true
    try{
        & (Join-Path $destination 'Start-Kindred.ps1') -Server $config.server -ServerUrl $config.serverUrl -PassThru | ForEach-Object {$script:started=$_}
        Start-Sleep -Seconds 3
        if(!$script:started -or $script:started.HasExited){throw 'The new app exited during startup.'}
    }catch{
        Set-Current $current
        & (Join-Path $install "versions\$current\Start-Kindred.ps1") -Server $config.server -ServerUrl $config.serverUrl
        throw 'The new app could not start. The previous version has been restored.'
    }
    Status 'complete' 'Kindred was updated and restarted.' 100
    $form.Close()
}catch{
    Status $(if($script:cancelled){'cancelled'}else{'error'}) $_.Exception.Message
    if(!$script:cancelled -and !$CheckOnly -and !$VerifyOnly -and !$NoUi){$title.Text='Update could not finish';$detail.Text=$_.Exception.Message;$progress.Style='Continuous';$progress.Value=0;$close.Text='Close';while($form.Visible){[Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 50}}
    if($CheckOnly -or $VerifyOnly -or $NoUi){throw $_}
}finally{
    # Remove only this updater's checked staging directory; keep installed versions.
    if($work -and [IO.Path]::GetFullPath($work).StartsWith([IO.Path]::GetFullPath((Join-Path $install 'staging'))+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue}
    $form.Dispose();$mutex.ReleaseMutex();$mutex.Dispose()
}
