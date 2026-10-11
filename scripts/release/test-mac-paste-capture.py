"""Actual capture-loop boundary tests; recorded Mac OCR is optional, no native execution inferred."""
import ast,json,os,re,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
SOURCE=Path(os.environ.get('KINDRED_TEST_MAC_PACKAGE_SOURCE',str(Path(__file__).with_name('test-macos-package.py'))))
tree=ast.parse(SOURCE.read_text())
node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='capture')
call=next(n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='capture' and len(n.args)==3 and isinstance(n.args[1],ast.Name) and n.args[1].id=='phase')
words=ast.literal_eval(call.args[2])
recorded=os.environ.get('KINDRED_TEST_MAC_PASTE_WINDOWS')
rows=json.loads(Path(recorded).read_text()) if recorded else [{'title':'Kindred','text':["Piper's screen",'Paste','Return control','Disposable Paste destination']}]
class Capture(unittest.TestCase):
 def run_capture(self,observed,code=0):
  with tempfile.TemporaryDirectory() as tmp:
   out=Path(tmp);folder=out/'mac-paste-text';folder.mkdir();(folder/'windows.json').write_text(json.dumps(observed))
   def command(*args,**kwargs):return SimpleNamespace(returncode=code,stdout=json.dumps({'observation':'no_visible_test_app_window','pid':123}) if code==2 else '',stderr='')
   ns={'re':re,'out':out,'json':json,'command':command,'time':SimpleNamespace(monotonic=lambda:0)}
   exec(compile(ast.Module(body=[node],type_ignores=[]),str(SOURCE),'exec'),ns)
   result=ns['capture'](SimpleNamespace(pid=123,poll=lambda:None),'mac-paste-text',words)
   validator=next((n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='validate_paste_capture'),None)
   if validator:
    exec(compile(ast.Module(body=[validator],type_ignores=[]),str(SOURCE),'exec'),ns);ns['validate_paste_capture'](result)
   return result
 def test_recorded_current_pane(self):self.assertEqual(self.run_capture(rows),rows)
 def test_missing_paste_fails(self):
  with self.assertRaises(AssertionError):self.run_capture([{'title':'Kindred','text':['Return control','Disposable Paste destination']}])
 def test_missing_control_fails(self):
  with self.assertRaises(AssertionError):self.run_capture([{'title':'Kindred','text':['Paste','Disposable Paste destination']}])
 def test_missing_destination_fails(self):
  with self.assertRaises(AssertionError):self.run_capture([{'title':'Kindred','text':['Paste','Return control']}])
 def test_heading_does_not_substitute_for_button(self):
  with self.assertRaises(AssertionError):self.run_capture([{'title':'Kindred','text':['Cannot Paste','Return control','Disposable Paste destination']}])
 def test_no_visible_window_fails(self):
  with self.assertRaisesRegex(AssertionError,'No visible'):self.run_capture([],2)
 def test_capture_error_fails(self):
  with self.assertRaisesRegex(AssertionError,'command failed'):self.run_capture([],1)
if __name__=='__main__':unittest.main()
