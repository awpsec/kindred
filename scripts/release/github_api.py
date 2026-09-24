"""GitHub release operations using the same local credential helper as Git push.
Credentials remain in memory and are only sent to GitHub API hosts.
"""
import json,os,subprocess,urllib.request,urllib.error,urllib.parse
_credential=None
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
def credential():
    global _credential
    if _credential is None:
        env={**os.environ,'GIT_TERMINAL_PROMPT':'0','GCM_INTERACTIVE':'never'}
        p=subprocess.run(['git','-c','credential.interactive=false','credential','fill'],input='protocol=https\nhost=github.com\n\n',text=True,capture_output=True,env=env,check=True)
        fields=dict(line.split('=',1) for line in p.stdout.splitlines() if '=' in line)
        _credential=fields['password']
    return _credential
def request(path,method='GET',data=None,content_type='application/json'):
    url=path if path.startswith('https://') else 'https://api.github.com/'+path.lstrip('/')
    assert urllib.parse.urlsplit(url).hostname in ('api.github.com','uploads.github.com')
    body=json.dumps(data).encode() if isinstance(data,(dict,list)) else data
    headers={'Authorization':'Bearer '+credential(),'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Kindred-release','Content-Type':content_type}
    req=urllib.request.Request(url,data=body,headers=headers,method=method)
    try:
        with urllib.request.build_opener(NoRedirect).open(req,timeout=90) as r:
            raw=r.read();return json.loads(raw) if 'json' in r.headers.get('Content-Type','') else raw
    except urllib.error.HTTPError as e:
        if e.code in (301,302,303,307,308):
            target=e.headers['Location'];assert urllib.parse.urlsplit(target).scheme=='https'
            assert method=='GET'
            with urllib.request.urlopen(urllib.request.Request(target,headers={'User-Agent':'Kindred-release'}),timeout=90) as r:return r.read()
        raise RuntimeError('GitHub API returned HTTP '+str(e.code)+' for '+urllib.parse.urlsplit(url).path) from None
