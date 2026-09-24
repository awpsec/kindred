[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9_.@-]*$')][string]$Server = '',
    [ValidateRange(1024,65535)][int]$LocalPort = 7340,
    [string]$ServerUrl = '',
    [switch]$PassThru
)
$ErrorActionPreference = 'Stop'
$profileRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if(Test-Path -LiteralPath (Join-Path $profileRoot 'current.json')) {
    try { & (Join-Path $PSScriptRoot 'Repair-Shortcuts.ps1') -InstallRoot $profileRoot } catch { Write-Warning 'Some Kindred shortcuts could not be refreshed.' }
}
if (Test-Path -LiteralPath (Join-Path $profileRoot 'profiles.json')) {
    $Server = ''
    $ServerUrl = ''
}
$exe = Join-Path $PSScriptRoot 'Kindred.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw 'Keep this launcher beside Kindred.exe and WebView2Loader.dll.' }
# New installations use account sign-in in the native profile window.
# SSH remains available only when explicitly configured by an existing owner.
if (-not $Server) {
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $exe
    $start.WorkingDirectory = $PSScriptRoot
    $start.UseShellExecute = $false
    $start.EnvironmentVariables.Remove('KINDRED_ACCESS_TOKEN')
    $start.EnvironmentVariables.Remove('KINDRED_SERVER_URL')
    $start.EnvironmentVariables.Remove('KINDRED_PROFILE_SCOPE')
    $start.EnvironmentVariables.Remove('KINDRED_PROFILE_ID')
    $start.EnvironmentVariables.Remove('KINDRED_LEGACY_LOCAL_ACCESS')
    if ($ServerUrl) { $start.EnvironmentVariables['KINDRED_SERVER_URL'] = $ServerUrl }
    $launched = [System.Diagnostics.Process]::Start($start)
    if ($PassThru) { Write-Output $launched }
    return
}
$ssh = (Get-Command ssh.exe -ErrorAction Stop).Source
$url = "http://127.0.0.1:$LocalPort"
if ($ServerUrl) {
    $address = [Uri]$ServerUrl
    if (-not $address.IsAbsoluteUri -or $address.Scheme -ne 'https' -or $address.UserInfo -or $address.Query -or $address.Fragment -or $address.AbsolutePath -ne '/') { throw 'ServerUrl must be an HTTPS origin without credentials or a path.' }
    $url = $address.GetLeftPart([System.UriPartial]::Authority)
}
# A custom Origin also requires public_url or allowed_origins in the server configuration.
try { $healthy = (Invoke-RestMethod "$url/health" -TimeoutSec 2).status -eq 'ok' } catch { $healthy = $false }
if (-not $healthy) {
    if ($ServerUrl) { throw 'The HTTPS server is unreachable. Check Tailscale and kindred.service.' }
    $tunnel = Start-Process -FilePath $ssh -WindowStyle Hidden -PassThru -ArgumentList @(
        '-N','-oBatchMode=yes','-oStrictHostKeyChecking=yes','-oExitOnForwardFailure=yes',
        '-oServerAliveInterval=30','-oServerAliveCountMax=3',
        '-L',"127.0.0.1:${LocalPort}:127.0.0.1:7340",'--',$Server
    )
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 250
        try { $healthy = (Invoke-RestMethod "$url/health" -TimeoutSec 1).status -eq 'ok' } catch { $healthy = $false }
        if ($healthy -or $tunnel.HasExited) { break }
    }
    if (-not $healthy) { throw 'The SSH tunnel could not connect. Check existing SSH access and kindred.service on the server.' }
}
# Capture only the application bearer token; never display it or write a token file.
$tokenLines = & $ssh '-oBatchMode=yes' '-oStrictHostKeyChecking=yes' '--' $Server 'sed -n ''s/^KINDRED_TOKEN=//p'' /etc/kindred/kindred.env'
if ($LASTEXITCODE -ne 0) { throw 'Could not read the Kindred server token with the existing SSH account.' }
$token = ($tokenLines -join '').Trim()
if ($token -notmatch '^[a-fA-F0-9]{64}$') { throw 'Expected the generated 64-character Kindred access token.' }
# Authenticate before giving a webview the credential. No bearer token appears in argv.
$null = Invoke-RestMethod "$url/api/status" -Headers @{Authorization="Bearer $token"} -TimeoutSec 5
$start = New-Object System.Diagnostics.ProcessStartInfo
$start.FileName = $exe
$start.WorkingDirectory = $PSScriptRoot
$start.UseShellExecute = $false
$start.EnvironmentVariables['KINDRED_SERVER_URL'] = $url
$start.EnvironmentVariables['KINDRED_ACCESS_TOKEN'] = $token
$launched = [System.Diagnostics.Process]::Start($start)
if($PassThru){Write-Output $launched}
$token = $null
$tokenLines = $null
