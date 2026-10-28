"""Finite source-bound backend test commands. Import has no product actions."""
from pathlib import Path
import os,signal,subprocess,json,time,re
def run_settings(argv,cwd,env,output,seconds):
 import time as clock
 process=subprocess.Popen(argv,cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True)
 timed_out=False;cleanup_complete=True;live_members=[];cleanup_error=None
 try: data,_=process.communicate(timeout=seconds)
 except subprocess.TimeoutExpired:
  timed_out=True;cleanup_complete=False
  try:os.killpg(process.pid,signal.SIGTERM)
  except ProcessLookupError:pass
  try:data,_=process.communicate(timeout=15)
  except subprocess.TimeoutExpired:pass
  # Parent/pipe completion does not prove its process group has ended.
  try:os.killpg(process.pid,signal.SIGKILL)
  except ProcessLookupError:pass
  data,_=process.communicate(timeout=15)
  deadline=clock.monotonic()+5
  while True:
   live_members=[]
   try:
    for proc in Path('/proc').iterdir():
     if not proc.name.isdigit():continue
     try:fields=(proc/'stat').read_text().split(') ',1)[1].split()
     except (FileNotFoundError,ProcessLookupError):continue
     if int(fields[2])==process.pid and fields[0] not in {'Z','X'}:live_members.append(int(proc.name))
   except (PermissionError,OSError,ValueError,IndexError) as e:cleanup_error=type(e).__name__;break
   if not live_members:cleanup_complete=True;break
   if clock.monotonic()>=deadline:break
   clock.sleep(0.05)
 record={'phase':'offline_settings_command','timed_out':timed_out,'exit_code':process.returncode,'maximum_seconds':seconds,'stdout_total_bytes':len(data),'stdout_truncated':len(data)>64*1024,'stdout':data[:64*1024].decode('utf-8',errors='replace'),'inner_compile_or_test_phase':'not inferred','process_group_cleanup_attempted_on_timeout':timed_out,'process_group_cleanup_complete':cleanup_complete,'live_owned_group_members':live_members,'cleanup_error':cleanup_error}
 output.write_text(json.dumps(record,indent=2)+'\n')
 assert cleanup_complete,'Owned process group cleanup could not be verified; stop continuation'
 assert not timed_out,'Settings timeout preserved; no automatic continuation'
 assert len(data)<=64*1024,'Settings output exceeds bounded receipt'
 return subprocess.CompletedProcess(argv,process.returncode,data)

def validate_output(data,exit_code,expected):
 assert type(exit_code) is int and exit_code==0, 'Backend command failed'
 assert type(expected) is list and expected and len(expected)==len(set(expected))
 assert len(data)<=64*1024, 'Backend receipt output exceeded64KiB'
 text=data.decode('utf-8',errors='strict')
 names=re.findall(r'^test ([A-Za-z0-9_:]+) \.\.\. ok$',text,re.M)
 assert sorted(names)==sorted(expected) and len(names)==len(set(names)), 'Exact selected executed names mismatch'
 summaries=re.findall(r'^test result: ok\. ([0-9]+) passed; ([0-9]+) failed; ([0-9]+) ignored; ([0-9]+) measured; ([0-9]+) filtered out; finished in ([0-9.]+)s$',text,re.M)
 assert len(summaries)==1 and int(summaries[0][0])==len(expected) and all(int(x)==0 for x in summaries[0][1:4]), 'Nonempty single binary test summary required'
 return {'executed':len(names),'names':names,'reported_test_seconds':float(summaries[0][5])}
def run_suite(root,env,groups,output,clock=time.monotonic,runner=run_settings):
 output=Path(output);assert output.is_dir() and len(groups)==5
 deadline=clock()+1200;results=[]
 for index,group in enumerate(groups):
  remaining=deadline-clock();assert remaining>0, 'Shared backend test deadline exhausted'
  seconds=min(600,remaining);argv=['cargo','test','--release','--locked','--offline','--bin','kindred',group['filter'],'--','--test-threads=1']
  if group['exact']:argv.append('--exact')
  started=clock();done=runner(argv,root,env,output/('backend-command-'+str(index)+'.json'),seconds)
  result=validate_output(done.stdout,done.returncode,group['expected_names']);elapsed=clock()-started
  assert clock()<=deadline, 'Shared backend test deadline exceeded'
  result.update(argv=argv,command_elapsed_seconds=elapsed,maximum_seconds=seconds,stdout_sha256=__import__('hashlib').sha256(done.stdout).hexdigest())
  results.append(result)
 return {'shared_maximum_seconds':1200,'commands':results,'executed':sum(x['executed'] for x in results)}
