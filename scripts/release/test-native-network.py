"""Compile the production discovery/plan/Compose functions in an isolated native harness.
Never applies settings, starts containers, or accesses an owner profile.
"""
import argparse, hashlib, json, os, subprocess, tempfile, tomllib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--target',required=True);p.add_argument('--output',required=True);a=p.parse_args()
repo=Path(__file__).resolve().parents[2];src=repo/'desktop/src';out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
lock=tomllib.loads((repo/'desktop/Cargo.lock').read_text());versions={r['name']:r['version'] for r in lock['package']}
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
receipt={'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'target':a.target,'production_module_sha256':{n:h(src/n) for n in ['network_interfaces.rs','network_plan.rs','setup_progress.rs','profiles.rs','standalone_network.rs']},'owner_state_mutated':False,'docker_desktop_forwarding_proven':False,'passed':False}
(out/'network-validation.json').write_text(json.dumps(receipt,indent=2)+'\n')
with tempfile.TemporaryDirectory(prefix='kindred-native-network-') as temp:
 root=Path(temp);(root/'src').mkdir()
 deps='\n'.join(f'{n} = {{ version = "={versions[n]}"'+(', features = ["derive"]' if n=='serde' else ', features = ["v4"]' if n=='uuid' else '')+' }' for n in ['serde','serde_json','uuid','libc'])
 (root/'Cargo.toml').write_text('[package]\nname="kindred-native-network-proof"\nversion="0.0.0"\nedition="2024"\n[dependencies]\n'+deps+'\n')
 hidden=(src/'profiles.rs').read_text();hidden=hidden[hidden.index('pub(crate) fn hidden('):hidden.index('\nfn restart(',hidden.index('pub(crate) fn hidden('))]
 compose=(src/'standalone_network.rs').read_text();compose=compose[compose.index('fn compose_override('):compose.index('\nfn check_compose(',compose.index('fn compose_override('))]
 modules='\n'.join('#[path='+json.dumps(str(src/n))+'] mod '+n[:-3]+';' for n in ['network_interfaces.rs','network_plan.rs','setup_progress.rs'])
 code=modules+'\nmod local_server {pub const ORIGIN:&str="http://127.0.0.1:9444";}\nmod profiles {use std::process::Command;'+hidden+'}\nuse network_plan::Plan;\ntype Result<T> = std::result::Result<T,String>;\n'+compose+'''
fn main() {
 let root=std::env::temp_dir().join(format!("kindred-interface-proof-{}",uuid::Uuid::new_v4())); std::fs::create_dir(&root).unwrap();
 let inventory=match network_interfaces::discover_with_diagnostics(&root) {
  Ok(inventory)=>inventory,
  Err(failure)=>{
   let temporary_directory_removed=std::fs::remove_dir_all(&root).is_ok();
   println!("{}",serde_json::json!({"actual_native_discovery_passed":false,"discovery_failure":failure,"temporary_directory_removed":temporary_directory_removed}));
   std::process::exit(1);
  }
 };
 assert!(!inventory.is_empty(),"Actual native interface inventory is empty");
 assert!(!inventory.iter().any(|r|r.id=="lo"));
 assert!(std::fs::read_dir(&root).unwrap().next().is_none(),"Discovery wrote persistent settings");
 let mut plan=Plan::default();plan.interfaces=vec![network_plan::Selection{id:"fixture".into(),addresses:vec!["192.168.1.20".into(),"fd7a:115c::5".into()]}];
 let yaml=compose_override(&plan).unwrap();assert!(yaml.contains("ports: !override"));
 let base=root.join("base.yaml");let overlay=root.join("network.yaml");std::fs::write(&base,r#"services:
  server:
    image: local-fixture
    ports:
      - "0.0.0.0:9444:9444"
"#).unwrap();std::fs::write(&overlay,yaml).unwrap();
 let docker=std::process::Command::new("docker").args(["compose","version","--short"]).output();
 let mut compose_pass=false;
 if docker.as_ref().is_ok_and(|r|r.status.success()) {
  let result=std::process::Command::new("docker").args(["compose","-f"]).arg(&base).arg("-f").arg(&overlay).args(["config","--format","json"]).output().unwrap();assert!(result.status.success(),"{}",String::from_utf8_lossy(&result.stderr));
  let value:serde_json::Value=serde_json::from_slice(&result.stdout).unwrap();let ports=value["services"]["server"]["ports"].as_array().unwrap();
  let mut actual:Vec<_>=ports.iter().map(|p|p["host_ip"].as_str().unwrap().to_string()).collect();actual.sort();let mut expected=plan.bindings().unwrap();expected.sort();assert_eq!(actual,expected);assert!(ports.iter().all(|p|p["target"]==9444&&p["published"]=="9444"));compose_pass=true;
 }
 std::fs::remove_dir_all(&root).unwrap();
 println!("{}",serde_json::json!({"actual_native_discovery_passed":true,"interface_count":inventory.len(),"explicit_compose_generation_passed":true,"actual_compose_merge_passed":compose_pass,"compose_gap":if compose_pass {""}else{"Docker Compose unavailable"},"settings_written":false}));
}
'''
 (root/'src/main.rs').write_text(code)
 env={**os.environ,'CARGO_TARGET_DIR':str(repo/'desktop/target')}
 command=['cargo','run','--release','--offline','--target',a.target,'--manifest-path',str(root/'Cargo.toml')]
 result=subprocess.run(command,env=env,capture_output=True,text=True,timeout=180)
 (out/'network-harness.log').write_text(result.stdout+result.stderr)
 receipt['exit_code']=result.returncode
 # Production failures emit safe structured metadata before returning nonzero.
 # Retain that metadata while keeping every failed gate failed.
 lines=result.stdout.strip().splitlines()
 if lines:
  try: detail=json.loads(lines[-1])
  except json.JSONDecodeError: detail=None
  if isinstance(detail,dict):
   for key in ['actual_native_discovery_passed','discovery_failure','temporary_directory_removed','interface_count','explicit_compose_generation_passed','actual_compose_merge_passed','compose_gap','settings_written']:
    if key in detail:receipt[key]=detail[key]
 receipt['passed']=result.returncode==0 and receipt.get('actual_native_discovery_passed') is True and receipt.get('explicit_compose_generation_passed') is True
 (out/'network-validation.json').write_text(json.dumps(receipt,indent=2)+'\n')
 if not receipt['passed']:raise SystemExit(result.returncode or 1)
