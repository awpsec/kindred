"""Read pinned Git blobs only. Never compile, fetch, copy or bind a release automatically."""
import subprocess
import guards as g
EXTRA=('compose.yaml','compose.kvm.yaml','LICENSE','THIRD_PARTY_NOTICES.md','harness/pi/package.json','harness/pi/package-lock.json','harness/pi/worker.mjs','harness/pi/session.mjs','harness/pi/opencode-models.json','ui/fonts/LICENSE.txt','ui/fonts/SOURCE.json','ui/fonts/DMSans-LICENSE.txt','ui/fonts/DMSans-SOURCE.json','ui/fonts/Manrope-LICENSE.txt','ui/fonts/Manrope-SOURCE.json','ui/fonts/Liberation-LICENSE.txt','ui/fonts/Liberation-SOURCE.json','docs/PROVIDER_MARKS.md','docs/PROVIDER_MARKS_LICENSE.txt')
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
        data=git('show',commit+':'+source);result[output]={'sha256':g.sha(data),'size':len(data)}
    assert set(g.HARNESS)|{'deploy/cua-driver-manifest.json'}<=set(result)
    return result
