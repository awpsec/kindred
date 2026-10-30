import json,os,plistlib,subprocess,time
from pathlib import Path
developer=Path(os.environ['DEVELOPER_DIR'])
os.environ['DEVELOPER_DIR']=str(developer)
receipt={'read_only':True,'build_performed':False,'simulator_launched':False,'developer_directory':str(developer),'applications':[],'commands':[]}
visited=set()
started=time.monotonic()
for root in [Path('/Applications'),developer.parent]:
    for current,dirs,files in os.walk(root):
        assert time.monotonic()-started<90, 'Host discovery exceeded 90 seconds'
        apps=[name for name in dirs if name.endswith('.app')]
        dirs[:]=[name for name in dirs if name not in apps]
        for name in apps:
            app=Path(current)/name
            if str(app) in visited:continue
            visited.add(str(app))
            row={'path':str(app)}
            try:
                info=plistlib.loads((app/'Contents/Info.plist').read_bytes())
                for key in ['CFBundleIdentifier','CFBundleName','CFBundleDisplayName','CFBundleExecutable','CFBundleShortVersionString']:
                    row[key]=info.get(key)
            except Exception as error:row['error']=str(error)
            receipt['applications'].append(row)
for command in [['xcode-select','-p'],['xcodebuild','-version'],['xcrun','--find','simctl'],['xcrun','--find','devicectl'],['xcrun','--find','DeviceHub'],['xcrun','--find','Simulator']]:
    try:
        result=subprocess.run(command,capture_output=True,text=True,timeout=15)
        receipt['commands'].append({'command':command,'exit_code':result.returncode,'stdout':result.stdout,'stderr':result.stderr})
    except Exception as error:receipt['commands'].append({'command':command,'error':str(error)})
receipt['elapsed_seconds']=round(time.monotonic()-started,2)
Path('ios-validation/host-discovery.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
