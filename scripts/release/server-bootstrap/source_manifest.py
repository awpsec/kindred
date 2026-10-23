"""Read pinned Git source with its declared checkout EOL policy. Never compile, fetch or bind a release automatically."""
import subprocess
import guards as g
EXTRA=('compose.yaml','compose.kvm.yaml','LICENSE','THIRD_PARTY_NOTICES.md','harness/pi/package.json','harness/pi/package-lock.json','harness/pi/worker.mjs','harness/pi/session.mjs','harness/pi/opencode-models.json','ui/fonts/LICENSE.txt','ui/fonts/SOURCE.json','ui/fonts/DMSans-LICENSE.txt','ui/fonts/DMSans-SOURCE.json','ui/fonts/Manrope-LICENSE.txt','ui/fonts/Manrope-SOURCE.json','ui/fonts/Liberation-LICENSE.txt','ui/fonts/Liberation-SOURCE.json','docs/PROVIDER_MARKS.md','docs/PROVIDER_MARKS_LICENSE.txt')
def read_source(root,commit,member):
    assert g.hexstr(commit,40) and g.safe_name(member)
    source=g.source_path(member)
    def git(*args):return subprocess.check_output(['git','-C',str(root),*args],timeout=30)
    attributes=git('check-attr','--source='+commit,'-z','text','eol','--',source).split(b'\0')
    assert len(attributes)==7 and attributes[-1]==b'' and attributes[0]==attributes[3]==source.encode() and attributes[1]==b'text' and attributes[4]==b'eol'
    data=git('show',commit+':'+source)
    if attributes[5]==b'crlf':
        assert attributes[2]==b'set', 'Unsupported checkout EOL policy'
        data=data.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n')
    return data
def derive(root,commit):
    assert g.hexstr(commit,40)
    def git(*a):return subprocess.check_output(['git','-C',str(root),*a],timeout=30)
    tracked=git('ls-tree','-r','--name-only','-z',commit).decode().split('\0')
    names={n:n for n in tracked if n.startswith(('deploy/','third-party/'))}
    names.update({n:n for n in EXTRA})
    names.update(g.SOURCE_ALIASES)
    result={}
    for output,source in names.items():
        assert g.safe_name(output) and g.safe_name(source)
        assert g.source_path(output)==source
        data=read_source(root,commit,output);result[output]={'sha256':g.sha(data),'size':len(data)}
    assert set(g.HARNESS)|{'deploy/cua-driver-manifest.json'}<=set(result)
    return result
