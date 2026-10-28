"""Post-failure read-only timing diagnostic. Never converts native discovery failure to PASS."""
import argparse,json,os,subprocess,time
from pathlib import Path
COMMANDS=(
 ('fresh_powershell_start',"[Console]::Write('1')"),
 ('get_netadapter',"$v=@(Get-NetAdapter -IncludeHidden); [Console]::Write($v.Count)"),
 ('get_netipaddress',"$v=@(Get-NetIPAddress); [Console]::Write($v.Count)"),
)
def diagnose(run=subprocess.run):
 rows=[]
 for name,body in COMMANDS:
  start=time.monotonic();row={'stage':name,'timeout_seconds':10,'passed':False}
  try:
   r=run(['powershell.exe','-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; "+body],capture_output=True,timeout=10)
   value=r.stdout.strip();row.update(exit_code=r.returncode,output_bytes=len(r.stdout),stderr_bytes=len(r.stderr))
   if r.returncode==0 and value.isdigit() and len(value)<12:row.update(passed=True,count=int(value))
  except subprocess.TimeoutExpired:row['timed_out']=True
  except OSError as e:row['os_error_errno']=e.errno
  row['elapsed_ms']=round((time.monotonic()-start)*1000);rows.append(row)
 return {'diagnostic_only':True,'native_discovery_passed':False,'production_gate_replaced':False,'original_cold_state_reproduced':False,'timing_scope':'New PowerShell processes after original failed production discovery; OS/CIM caches may already be warm.','stages':rows}
def main():
 p=argparse.ArgumentParser();p.add_argument('--failed-receipt',required=True);p.add_argument('--output',required=True);a=p.parse_args()
 assert os.name=='nt','Windows only'
 receipt=json.loads(Path(a.failed_receipt).read_text());assert receipt.get('passed') is False and receipt.get('actual_native_discovery_passed') is False
 assert receipt.get('discovery_failure',{}).get('process',{}).get('kind')=='timeout','Only after actual production timeout'
 # Existing production gate must run first. This diagnostic has no warmup/retry role.
 output=Path(a.output);assert not output.exists(),'Exclusive diagnostic output'
 result=diagnose();result['source_commit']=receipt['source_commit'];result['production_module_sha256']=receipt['production_module_sha256']
 with output.open('x') as f:json.dump(result,f,indent=2);f.write('\n')
if __name__=='__main__':main()
