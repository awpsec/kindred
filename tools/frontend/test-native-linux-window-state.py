"""Native Linux saved-window regression. Run under isolated Xvfb/DBus as a test user.
KINDRED_NATIVE_EXE: built executable/launcher; KINDRED_TEST_ARTIFACTS: output directory.
No real profiles or servers are used. Openbox, AT-SPI and xdotool are required.
"""
import json, os, subprocess, time, tempfile
from pathlib import Path
import gi
gi.require_version('Atspi','2.0')
gi.require_version('Gdk','3.0')
from gi.repository import Atspi, Gdk

assert os.geteuid() != 0, 'Use an unprivileged test user'
out=Path(os.environ['KINDRED_TEST_ARTIFACTS'])
out.mkdir(parents=True,exist_ok=True)
Atspi.set_timeout(1000,1000)
wm=subprocess.Popen(['openbox'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(.5)
def nodes():
    pending=[Atspi.get_desktop(0)]
    for _ in range(2000):
        if not pending: return
        n=pending.pop()
        try:
            yield n
            pending.extend(n.get_child_at_index(i) for i in range(n.get_child_count()))
        except Exception: pass
results=[]
try:
    for name, saved in [('fresh',None),('normal',(560,620)),('tiny',(5,400)),('recovery',(5,400))]:
        if os.environ.get('KINDRED_PROBE_CASE') and name != os.environ['KINDRED_PROBE_CASE']: continue
        with tempfile.TemporaryDirectory(prefix=name+'-',dir=out) as folder:
            home=Path(folder)
            placement=home/'data/kindred/window-state/profile-home.json'
            if saved:
                placement.parent.mkdir(parents=True)
                placement.write_text(json.dumps(dict(x=50,y=50,width=saved[0],height=saved[1],scale=1.,monitor=None,maximized=False)))
            env=dict(os.environ,HOME=str(home),XDG_DATA_HOME=str(home/'data'),XDG_CONFIG_HOME=str(home/'config'),XDG_CACHE_HOME=str(home/'cache'),KINDRED_CLIENT_ONLY='1')
            if name == 'recovery':
                helper = Path(__file__).resolve().parents[2]/'desktop/linux/update.py'
                original = placement.read_bytes()
                subprocess.run(['python3', str(helper), '--reset-window-state'], env=env, check=True)
                assert not placement.exists()
                backups = list((home/'data/kindred/linux/window-state-backups').glob('*/profile-home.json'))
                assert len(backups)==1 and backups[0].read_bytes()==original
            with (out/(name+'.log')).open('w') as log:
                app=subprocess.Popen([os.environ['KINDRED_NATIVE_EXE'],'--profiles'],env=env,stdout=log,stderr=log)
                try:
                    end=time.monotonic()+30
                    names=[]
                    while time.monotonic()<end:
                        names=[n.get_name() for n in nodes()]
                        if 'Continue' in names and 'Set up this computer' in names: break
                        if app.poll() is not None: break
                        time.sleep(.2)
                    windows=subprocess.run(['xdotool','search','--onlyvisible','--name','Kindred · Accounts'],capture_output=True,text=True)
                    geometry=[]
                    for wid in windows.stdout.split():
                        geometry.append(subprocess.run(['xdotool','getwindowgeometry','--shell',wid],capture_output=True,text=True).stdout)
                    w=Gdk.get_default_root_window()
                    Gdk.pixbuf_get_from_window(w,0,0,w.get_width(),w.get_height()).savev(str(out/(name+'.png')),'png',[],[])
                    result=dict(case=name,exit=app.poll(),geometry=geometry,controls=names)
                    assert app.poll() is None, result
                    assert 'Continue' in names and 'Set up this computer' in names, result
                    assert geometry, result
                    for description in geometry:
                        dims=dict(line.split('=',1) for line in description.splitlines())
                        assert int(dims['WIDTH']) >= 420 and int(dims['HEIGHT']) >= 480, result
                    results.append(result)
                    print(json.dumps(result),flush=True)
                finally:
                    app.terminate()
                    try: app.wait(timeout=10)
                    except subprocess.TimeoutExpired: app.kill();app.wait()
finally:
    wm.terminate();wm.wait(timeout=10)
    (out/'results.json').write_text(json.dumps(results,indent=2))
