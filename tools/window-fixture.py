"""Native placement acceptance helper; operates only on the test process ID."""
import ctypes as c,json,sys,winreg,os
from ctypes import wintypes as w
if sys.argv[1].startswith('registry-'):
 keypath=r'Software\Classes\AppUserModelId\dev.kindred.personal'
 if sys.argv[1]=='registry-read':
  values={}
  try:
   with winreg.OpenKey(winreg.HKEY_CURRENT_USER,keypath) as key:
    for name in ['DisplayName','IconUri']:
     try:values[name]=winreg.QueryValueEx(key,name)
     except FileNotFoundError:pass
   present=True
  except FileNotFoundError:present=False
  print(json.dumps(dict(present=present,values=values)))
 else:
  saved=json.loads(sys.argv[2])
  if not saved['present']:
   try:winreg.DeleteKey(winreg.HKEY_CURRENT_USER,keypath)
   except FileNotFoundError:pass
  else:
   with winreg.CreateKey(winreg.HKEY_CURRENT_USER,keypath) as key:
    for name in ['DisplayName','IconUri']:
     if name in saved['values']:value,kind=saved['values'][name];winreg.SetValueEx(key,name,0,kind,value)
     else:
      try:winreg.DeleteValue(key,name)
      except FileNotFoundError:pass
  print('{}')
 sys.exit()
u=c.windll.user32
u.SetProcessDpiAwarenessContext(c.c_void_p(-4))
class Rect(c.Structure):_fields_=[('left',w.LONG),('top',w.LONG),('right',w.LONG),('bottom',w.LONG)]
class Monitor(c.Structure):_fields_=[('size',w.DWORD),('monitor',Rect),('work',Rect),('flags',w.DWORD),('name',w.WCHAR*32)]
u.GetMonitorInfoW.argtypes=[w.HMONITOR,c.POINTER(Monitor)]
u.GetWindowRect.argtypes=[w.HWND,c.POINTER(Rect)]
u.GetWindowThreadProcessId.argtypes=[w.HWND,c.POINTER(w.DWORD)]
u.SetWindowPos.argtypes=[w.HWND,w.HWND,c.c_int,c.c_int,c.c_int,c.c_int,w.UINT]
u.ShowWindow.argtypes=[w.HWND,c.c_int]
u.PostMessageW.argtypes=[w.HWND,w.UINT,w.WPARAM,w.LPARAM]
u.IsZoomed.argtypes=[w.HWND];u.IsIconic.argtypes=[w.HWND]
screens=[]
@c.WINFUNCTYPE(w.BOOL,w.HMONITOR,w.HDC,c.POINTER(Rect),w.LPARAM)
def monitor(handle,dc,rect,data):
 m=Monitor();m.size=c.sizeof(m);assert u.GetMonitorInfoW(handle,c.byref(m));r=m.work
 screens.append(dict(x=r.left,y=r.top,width=r.right-r.left,height=r.bottom-r.top,name=m.name,primary=bool(m.flags&1)));return True
u.EnumDisplayMonitors(None,None,monitor,0)
action=sys.argv[1]
if action=='screens':print(json.dumps(screens));sys.exit()
pid=int(sys.argv[2]);handles=[]
@c.WINFUNCTYPE(w.BOOL,w.HWND,w.LPARAM)
def visit(hwnd,data):
 owner=w.DWORD();u.GetWindowThreadProcessId(hwnd,c.byref(owner))
 title=c.create_unicode_buffer(512);u.GetWindowTextW(hwnd,title,512)
 if owner.value==pid and title.value==os.environ.get('KINDRED_FIXTURE_WINDOW_TITLE','Kindred'):handles.append(hwnd)
 return True
u.EnumWindows(visit,0)
assert len(handles)==1,handles
h=handles[0]
if action=='move':assert u.SetWindowPos(h,None,*map(int,sys.argv[3:7]),0x14)
elif action=='maximize':u.ShowWindow(h,3)
elif action=='minimize':u.ShowWindow(h,6)
elif action=='restore':u.ShowWindow(h,9)
elif action=='close':assert u.PostMessageW(h,0x10,0,0)
r=Rect();assert u.GetWindowRect(h,c.byref(r))
print(json.dumps(dict(x=r.left,y=r.top,width=r.right-r.left,height=r.bottom-r.top,maximized=bool(u.IsZoomed(h)),minimized=bool(u.IsIconic(h)))))
