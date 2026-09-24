param([Parameter(Mandatory=$true)][string]$Executable)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot ('..\test-results\version-redirect-'+[Guid]::NewGuid().ToString('N'))))
$version=[version](Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot '..\desktop\tauri.conf.json')|ConvertFrom-Json).version
$future='{0}.{1}.{2}' -f $version.Major,$version.Minor,($version.Build+1)
$old=Join-Path $root "versions\$version";$current=Join-Path $root "versions\$future"
New-Item -ItemType Directory -Force -Path $old,$current|Out-Null
$source=Join-Path $old 'Kindred-OldPinFixture.exe';$target=Join-Path $current 'Kindred.exe'
Copy-Item -LiteralPath $Executable -Destination $source
Copy-Item -LiteralPath $Executable -Destination $target
foreach($directory in @($old,$current)){Copy-Item -LiteralPath (Join-Path (Split-Path -Parent $Executable) 'WebView2Loader.dll') -Destination $directory}
# Windows PowerShell's installed manifest includes a UTF-8 BOM.
[IO.File]::WriteAllText((Join-Path $root 'current.json'),(@{version=$future}|ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($true)))
$start=New-Object Diagnostics.ProcessStartInfo
$start.FileName=$source;$start.Arguments='--profiles';$start.WorkingDirectory=$old;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
$start.EnvironmentVariables['WEBVIEW2_USER_DATA_FOLDER']=Join-Path $root 'webview'
foreach($name in @('KINDRED_ACCESS_TOKEN','KINDRED_SERVER_URL','KINDRED_PROFILE_SCOPE','KINDRED_PROFILE_ID','KINDRED_LEGACY_LOCAL_ACCESS','WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS')){$start.EnvironmentVariables.Remove($name)}
$launched=[Diagnostics.Process]::Start($start);$running=$null
try{
    $deadline=[DateTime]::UtcNow.AddSeconds(15)
    while([DateTime]::UtcNow -lt $deadline){$running=Get-Process -Name Kindred -ErrorAction SilentlyContinue|Where-Object Path -EQ $target|Select-Object -First 1;if($running){break};Start-Sleep -Milliseconds 100}
    if(!$running){throw 'The stale pin did not forward to the current version'}
    if(!$launched.WaitForExit(5000)){throw 'The obsolete process did not exit'}
    Start-Sleep -Seconds 2
    $running.Refresh();if($running.HasExited){throw 'The current version exited or redirected recursively'}
    @{passed=$true;staleBinaryForwarded=$true;bomManifest=$true;noRedirectLoop=$true;root=$root}|ConvertTo-Json -Compress
}finally{
    if($running -and !$running.HasExited){$running.CloseMainWindow()|Out-Null;if(!$running.WaitForExit(5000)){$running.Kill()}}
    if(!$launched.HasExited){$launched.Kill()}
}
