"""Local receipt gate fault tests; no native Mac or clipboard proof."""
import ast,copy,unittest
from pathlib import Path
source=Path(__file__).with_name('test-macos-package.py').read_text()
node=next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name=='validate_paste_receipt')
namespace={};exec(compile(ast.Module(body=[node],type_ignores=[]),'<actual-paste-receipt-gate>','exec'),namespace)
validate=namespace['validate_paste_receipt']
def receipt(text='Aé中😀\nZ'):
 events=[]
 for character in text:
  point=ord(character);key=0xff0d if character=='\n' else point if point<=255 else 0x01000000|point
  for down in [True,False]:events.append(dict(key=key,down=down,sequence=len(events)+1,processed=100,outcome='browser-dispatched',connectionID='fixture-connection'))
 return dict(nativeCalls=[dict(command='read_clipboard_text',completed=True,error=False)],browserClipboardCalls=0,manualDialogOpen=False),dict(text=text,submits=0,enterDown=text.count('\n'),events=events,keyEvents=len(events),receivedSequence=len(events),processedSequence=len(events),inputSequence=len(events),processedInputSequence=len(events))
class Evidence(unittest.TestCase):
 def test_exact_unicode_multiline(self):n,a=receipt();validate('Aé中😀\nZ',n,a)
 def test_empty_clipboard(self):n,a=receipt('');validate('',n,a)
 def test_real_native_oversize_error(self):
  n,a=receipt('');n['nativeCalls'][0].update(error=True,errorMessage='Paste up to 16,000 characters at a time.');validate('',n,a,native_error=True)
 def test_wrong_native_error(self):
  n,a=receipt('');n['nativeCalls'][0].update(error=True,errorMessage='Wrong origin')
  with self.assertRaises(AssertionError):validate('',n,a,native_error=True)
 def test_disabled_no_control(self):n,a=receipt('');n['nativeCalls']=[];validate('',n,a,reads=0)
 def refuse(self,modify):
  n,a=receipt();modify(n,a)
  with self.assertRaises((AssertionError,KeyError)):validate('Aé中😀\nZ',n,a)
 def test_wrong_dom(self):self.refuse(lambda n,a:a.update(text='fabricated'))
 def test_trailing_enter(self):self.refuse(lambda n,a:a.update(text=a['text']+'\n'))
 def test_submit(self):self.refuse(lambda n,a:a.update(submits=1))
 def test_extra_return(self):self.refuse(lambda n,a:a.update(enterDown=2))
 def test_native_read_missing(self):self.refuse(lambda n,a:n.update(nativeCalls=[]))
 def test_double_native_read(self):self.refuse(lambda n,a:n['nativeCalls'].append(copy.deepcopy(n['nativeCalls'][0])))
 def test_native_error(self):self.refuse(lambda n,a:n['nativeCalls'][0].update(error=True))
 def test_incomplete_native_read(self):self.refuse(lambda n,a:n['nativeCalls'][0].update(completed=False))
 def test_browser_fallback(self):self.refuse(lambda n,a:n.update(browserClipboardCalls=1))
 def test_manual_dialog(self):self.refuse(lambda n,a:n.update(manualDialogOpen=True))
 def test_pending_event(self):self.refuse(lambda n,a:a['events'][-1].update(processed=None,outcome=None))
 def test_sequence_undrained(self):self.refuse(lambda n,a:a.update(processedSequence=0))
 def test_input_undrained(self):self.refuse(lambda n,a:a.update(processedInputSequence=0))
 def test_stale_connection(self):self.refuse(lambda n,a:a['events'][-1].update(connectionID='stale-other'))
 def test_reordered_sequence(self):self.refuse(lambda n,a:a['events'][-1].update(sequence=1))
 def test_wrong_unicode_key(self):self.refuse(lambda n,a:a['events'][0].update(key=66))
 def test_missing_key_up(self):self.refuse(lambda n,a:a['events'].pop())
 def test_unprocessed_key(self):self.refuse(lambda n,a:a['events'][0].update(outcome='cancelled-before-dispatch'))
if __name__=='__main__':unittest.main()
