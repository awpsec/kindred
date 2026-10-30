param([int]$OwnedPid,[string]$Kind,[double]$X,[double]$Y,[double]$TX,[double]$TY,[double]$VW,[double]$VH)
$ErrorActionPreference='Stop'
if($Kind -notin @('click','drag') -or $VW -le 0 -or $VH -le 0){throw 'Invalid owned input request'}
Add-Type @'
using System; using System.Runtime.InteropServices;
public class OwnedInput {
 [StructLayout(LayoutKind.Sequential)] public struct RECT {public int L,T,R,B;}
 [StructLayout(LayoutKind.Sequential)] public struct POINT {public int X,Y;}
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h,ref POINT p);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr info);
}
'@
$p=Get-Process -Id $OwnedPid; $p.Refresh();$h=$p.MainWindowHandle
if($h -eq [IntPtr]::Zero){throw 'NATIVE_INPUT_GAP: no owned native window'}
[void][OwnedInput]::SetForegroundWindow($h);Start-Sleep -Milliseconds 100
if([OwnedInput]::GetForegroundWindow() -ne $h){throw 'NATIVE_INPUT_GAP: owned window not foreground'}
$r=New-Object OwnedInput+RECT;$o=New-Object OwnedInput+POINT
if(-not [OwnedInput]::GetClientRect($h,[ref]$r) -or -not [OwnedInput]::ClientToScreen($h,[ref]$o)){throw 'Native geometry unavailable'}
function Move-Owned([double]$px,[double]$py){
 if($px -lt 0 -or $py -lt 0 -or $px -ge $VW -or $py -ge $VH){throw 'Pointer outside owned client'}
 if(-not [OwnedInput]::SetCursorPos([int]($o.X+$px*($r.R-$r.L)/$VW),[int]($o.Y+$py*($r.B-$r.T)/$VH))){throw 'Native move failed'}
}
Move-Owned $X $Y;Start-Sleep -Milliseconds 50
try {
 [OwnedInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
 if($Kind -eq 'drag'){foreach($i in 1..16){Move-Owned ($X+($TX-$X)*$i/16) ($Y+($TY-$Y)*$i/16);Start-Sleep -Milliseconds 15}}
}finally{[OwnedInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}
'{"passed":true,"nativeInput":true}'
