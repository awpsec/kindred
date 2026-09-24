"""Test and render only the setup process created by this fixture."""
from pathlib import Path
import argparse,ctypes as C,ctypes.wintypes as W,json,os,re,subprocess,time,uuid
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--installer',type=Path,required=True);a=p.parse_args()
match=re.search(r'Kindred-(\d+\.\d+\.\d+)-Setup',a.installer.name);assert match;version=match[1]
root=Path(__file__).resolve().parents[1]/'test-results'/('installer-ui-'+uuid.uuid4().hex);root.mkdir(parents=True);install=root/'Kindred'
u=C.WinDLL('user32',use_last_error=True);g=C.WinDLL('gdi32',use_last_error=True)
enum=C.WINFUNCTYPE(W.BOOL,W.HWND,W.LPARAM)
u.GetWindowThreadProcessId.argtypes=[W.HWND,C.POINTER(W.DWORD)];u.GetWindowTextW.argtypes=[W.HWND,W.LPWSTR,C.c_int];u.GetClassNameW.argtypes=[W.HWND,W.LPWSTR,C.c_int]
u.SendMessageW.argtypes=[W.HWND,W.UINT,W.WPARAM,W.LPARAM];u.SendMessageW.restype=W.LPARAM
u.IsWindowEnabled.argtypes=[W.HWND];u.IsWindowEnabled.restype=W.BOOL
u.GetDlgCtrlID.argtypes=[W.HWND];u.GetDlgCtrlID.restype=C.c_int
u.SetWindowPos.argtypes=[W.HWND,W.HWND,C.c_int,C.c_int,C.c_int,C.c_int,W.UINT]
u.ShowWindow.argtypes=[W.HWND,C.c_int]
u.GetWindowRect.argtypes=[W.HWND,C.POINTER(W.RECT)];u.GetDC.argtypes=[W.HWND];u.GetDC.restype=W.HDC
u.ReleaseDC.argtypes=[W.HWND,W.HDC];u.PrintWindow.argtypes=[W.HWND,W.HDC,W.UINT]
g.CreateCompatibleDC.argtypes=[W.HDC];g.CreateCompatibleDC.restype=W.HDC
g.CreateCompatibleBitmap.argtypes=[W.HDC,C.c_int,C.c_int];g.CreateCompatibleBitmap.restype=W.HBITMAP
g.SelectObject.argtypes=[W.HDC,W.HGDIOBJ];g.SelectObject.restype=W.HGDIOBJ
g.DeleteObject.argtypes=[W.HGDIOBJ];g.DeleteDC.argtypes=[W.HDC]
def text(hwnd,classname=False):
 b=C.create_unicode_buffer(2048);(u.GetClassNameW if classname else u.GetWindowTextW)(hwnd,b,len(b));return b.value
def windows(parent=None):
 rows=[]
 @enum
 def collect(hwnd,_):rows.append(hwnd);return True
 (u.EnumChildWindows(parent,collect,0) if parent else u.EnumWindows(collect,0));return rows
def wait(fn,seconds=45):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  result=fn()
  if result:return result
  time.sleep(.1)
 raise TimeoutError('Setup UI did not reach the expected state')
def find_window():
 for h in windows():
  pid=W.DWORD();u.GetWindowThreadProcessId(h,C.byref(pid))
  if pid.value==process.pid and 'Kindred' in text(h):return h
def button(label):return next((h for h in windows(window) if text(h,True)=='Button' and text(h).replace('&','')==label),None)
def click(label):
 h=wait(lambda:(h if (h:=button(label)) and u.IsWindowEnabled(h) else None))
 # BM_CLICK can be ignored for an inactive dialog. Deliver this owned control's
 # BN_CLICKED command to its dialog without activating the user's desktop.
 u.SendMessageW(window,0x111,u.GetDlgCtrlID(h),h)
def capture(name):
 rect=W.RECT();assert u.GetWindowRect(window,C.byref(rect));width=rect.right-rect.left;height=rect.bottom-rect.top
 assert 200<width<1800 and 100<height<1400
 dc=u.GetDC(window);mem=g.CreateCompatibleDC(dc);bitmap=g.CreateCompatibleBitmap(dc,width,height);old=g.SelectObject(mem,bitmap)
 try:
  assert u.PrintWindow(window,mem,2)
  # BITMAPINFOHEADER with negative height requests rows in display order.
  header=C.create_string_buffer(40);C.c_uint32.from_buffer(header,0).value=40;C.c_int32.from_buffer(header,4).value=width;C.c_int32.from_buffer(header,8).value=-height;C.c_uint16.from_buffer(header,12).value=1;C.c_uint16.from_buffer(header,14).value=32
  pixels=C.create_string_buffer(width*height*4)
  g.GetDIBits.argtypes=[W.HDC,W.HBITMAP,W.UINT,W.UINT,C.c_void_p,C.c_void_p,W.UINT]
  assert g.GetDIBits(mem,bitmap,0,height,pixels,header,0)==height
  Image.frombuffer('RGB',(width,height),pixels.raw,'raw','BGRX',0,1).save(root/name)
 finally:g.SelectObject(mem,old);g.DeleteObject(bitmap);g.DeleteDC(mem);u.ReleaseDC(window,dc)
env={k:v for k,v in os.environ.items() if k.upper()!='PSMODULEPATH'}
startup=subprocess.STARTUPINFO();startup.dwFlags=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
command=subprocess.list2cmdline([str(a.installer.resolve()),'/NOSHORTCUTS'])+' /D='+str(install)
process=subprocess.Popen(command,env=env,startupinfo=startup)
try:
 window=wait(find_window)
 # Let NSIS paint outside the virtual desktop; no foreground focus is stolen.
 rect=W.RECT();u.GetWindowRect(window,C.byref(rect))
 u.SetWindowPos(window,None,u.GetSystemMetrics(76)-(rect.right-rect.left)-100,u.GetSystemMetrics(77),0,0,0x15)
 u.ShowWindow(window,4)
 wait(lambda:any('Welcome to Kindred' in text(h) for h in windows(window)));time.sleep(.3);capture('welcome.png')
 if button('Next >'):click('Next >')
 elif button('Install'):click('Install')
 else:raise AssertionError([text(h) for h in windows(window)])
 wait(lambda:any('Kindred is ready' in text(h) for h in windows(window)),90);capture('finished.png')
 opening=wait(lambda:button('Open Kindred'));assert u.SendMessageW(opening,0xF0,0,0)==1;u.SendMessageW(opening,0xF1,0,0)
 click('Finish');assert process.wait(timeout=10)==0
 assert json.loads((install/'current.json').read_text())['version']==version
 cmd=subprocess.list2cmdline([str(install/'Uninstall-Kindred.exe'),'/S'])+' _?='+str(install)
 assert subprocess.run(cmd,env=env,creationflags=subprocess.CREATE_NO_WINDOW,timeout=60).returncode==0
 result={'passed':True,'welcomeAndFinish':True,'defaultOpenAppChoice':True,'noTerminalWindow':True,'root':str(root)}
 (root/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 if 'window' in globals():
  capture('failed.png');(root/'failed-controls.json').write_text(json.dumps([text(h) for h in windows(window)],indent=2))
 raise
finally:
 if process.poll() is None:process.kill();process.wait()
