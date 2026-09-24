"""Real Linux GTK clipboard and OS screenshot-file drag regression.
Start native-image-input-fixture.cjs with KINDRED_TEST_ARTIFACTS set, then run
this script under isolated Xvfb/DBus with Openbox and KINDRED_NATIVE_EXE set.
Requires GTK/GdkPixbuf Python GI and xdotool. Uses only synthetic API data.
"""
import os,time,subprocess,json,urllib.request,threading,base64
from pathlib import Path
import gi
gi.require_version('Gtk','3.0');gi.require_version('Gdk','3.0');gi.require_version('GdkPixbuf','2.0')
from gi.repository import Gtk,Gdk,GdkPixbuf,GLib
out=Path(os.environ['KINDRED_TEST_ARTIFACTS']);url=(out/'url').read_text()
def api(path,body=None):
 r=urllib.request.Request(url+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'});return json.load(urllib.request.urlopen(r))
def wait(predicate,seconds=35):
 end=time.time()+seconds
 while time.time()<end:
  s=api('/test-state')
  if predicate(s):return s
  time.sleep(.2)
 raise Exception('Timed out: '+json.dumps(s))
def x(*args):return subprocess.check_output(['xdotool',*map(str,args)]).decode().strip()
pix=GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB,False,8,320,180);pix.fill(0x2475ffff);image=out/'screenshot.png';pix.savev(str(image),'png',[],[])
clipboard=Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD);clipboard.set_image(pix)
source=Gtk.Window(title='Screenshot drag source');source.set_default_size(220,200);source.move(0,0);widget=Gtk.EventBox();widget.add(Gtk.Image.new_from_pixbuf(pix.scale_simple(180,100,GdkPixbuf.InterpType.BILINEAR)));source.add(widget);widget.drag_source_set(Gdk.ModifierType.BUTTON1_MASK,[Gtk.TargetEntry.new('text/uri-list',0,0)],Gdk.DragAction.COPY)
widget.connect('drag-data-get',lambda w,c,data,info,t:data.set_uris([image.as_uri()]));source.show_all()
env=dict(os.environ,XDG_CONFIG_HOME=str(out/'config'),XDG_DATA_HOME=str(out/'data'),XDG_CACHE_HOME=str(out/'cache'),KINDRED_CLIENT_ONLY='1',KINDRED_ACCESS_TOKEN='native-test-token-only',KINDRED_PROFILE_SCOPE='image-input-test')
app=subprocess.Popen([os.environ['KINDRED_NATIVE_EXE'],url],env=env,stdout=open(out/'app.log','w'),stderr=subprocess.STDOUT)
passed=False
def run():
 global passed
 try:
  wait(lambda s:s['snapshot'].get('ready'));windows=x('search','--onlyvisible','--class','kindred').split();wid=windows[-1] if windows else x('search','--onlyvisible','--name','^Kindred$').split()[-1]
  x('windowmove',wid,240,0);x('windowsize',wid,1100,860);x('windowactivate','--sync',wid);api('/test-phase',{'phase':'focus'});time.sleep(.5);x('key','ctrl+v');s=wait(lambda s:len(s['uploads'])==1 and s['snapshot']['previews']==[320]);assert s['snapshot']['files']==1 and s['snapshot']['prompt']=='Please inspect this screenshot.',s;assert not s['sends'];
  api('/test-phase',{'phase':'send'});s=wait(lambda s:len(s['sends'])==1);assert len(s['sends'][0]['files'])==1
  api('/test-phase',{'phase':'clear'});wait(lambda s:s['snapshot']['files']==0);time.sleep(.5)
  x('mousemove',100,120);x('mousedown',1);x('mousemove',115,125);time.sleep(.4)
  for i in range(1,13):x('mousemove',115+i*65,125+i*25);time.sleep(.06)
  time.sleep(.5);x('mouseup',1);s=wait(lambda s:len(s['uploads'])==2 and s['snapshot']['previews']==[320]);assert s['uploads'][1]['name']=='screenshot.png',s;assert base64.b64decode(s['uploads'][1]['data'])==image.read_bytes();assert not s['snapshot']['errors']
  assert len(s['sends'])==1
  s=wait(lambda s:not s['snapshot'].get('dragOverlay'));assert s['snapshot']['previews']==[320],s
  time.sleep(.5)
  def capture():
   root=Gdk.get_default_root_window();Gdk.pixbuf_get_from_window(root,240,0,1100,860).savev(str(out/'native-dropped-draft.png'),'png',[],[]);return False
  GLib.idle_add(capture);time.sleep(.5)
  api('/test-phase',{'phase':'send'});s=wait(lambda s:len(s['sends'])==2);assert len(s['sends'][1]['files'])==1
  (out/'result.json').write_text(json.dumps({'passed':True,'actualLinuxClipboard':True,'actualOSFileDrag':True,'uploads':len(s['uploads']),'sends':len(s['sends']),'events':s['snapshot']['events']},indent=2));passed=True;print('PASS',flush=True)
 except Exception as e:
  (out/'failure.json').write_text(json.dumps({'error':str(e),'state':api('/test-state')},indent=2));print(str(e),flush=True)
 finally:
  app.terminate()
  try:app.wait(timeout=10)
  except subprocess.TimeoutExpired:app.kill();app.wait()
  GLib.idle_add(Gtk.main_quit)
threading.Thread(target=run,daemon=True).start();Gtk.main();raise SystemExit(0 if passed else 1)
