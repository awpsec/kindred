param([ValidateSet('read','on','off')][string]$Mode='read')
$ErrorActionPreference='Stop'
Add-Type @'
using System; using System.Runtime.InteropServices;
public class MotionPreference {
 [DllImport("user32.dll", SetLastError=true)] public static extern bool SystemParametersInfo(uint action,uint param,ref int value,uint flags);
 [DllImport("user32.dll", EntryPoint="SystemParametersInfoW", SetLastError=true)] public static extern bool Set(uint action,uint param,IntPtr value,uint flags);
}
'@
$value=0
if($Mode -ne 'read') {
 $enabled=if($Mode -eq 'on'){1}else{0}
 if(-not [MotionPreference]::Set(0x1043,0,[IntPtr]$enabled,3)){throw 'Could not set CI client-area animation preference'}
}
if(-not [MotionPreference]::SystemParametersInfo(0x1042,0,[ref]$value,0)){throw 'Could not read client-area animation preference'}
@{enabled=($value -ne 0)} | ConvertTo-Json -Compress
