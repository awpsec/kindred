//! Host-side port publishing; the desktop always keeps its loopback URL.
use serde_json::{Value, json};
use std::{
    path::Path,
    process::Command,
    time::{Duration, Instant},
};
use tauri::Manager;
type Result<T> = std::result::Result<T, String>;

pub fn saved(root: &Path) -> Result<String> {
    match std::fs::read_to_string(root.join("network.json")) {
        Ok(v) => {
            let value: Value = serde_json::from_str(&v).map_err(|e| e.to_string())?;
            validate(value["bind"].as_str().unwrap_or("")).map(str::to_owned)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok("127.0.0.1".into()),
        Err(e) => Err(e.to_string()),
    }
}
pub fn origins(root: &Path) -> Result<Vec<String>> {
    match std::fs::read(root.join("network.json")) {
        Ok(bytes) => {
            let value: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            normalize_origins(
                value["origins"]
                    .as_array()
                    .unwrap_or(&vec![])
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect(),
            )
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(e) => Err(e.to_string()),
    }
}
fn normalize_origins(values: Vec<String>) -> Result<Vec<String>> {
    if values.len() > 8 {
        return Err("Use up to eight connection addresses.".into());
    }
    let mut result = vec![];
    for value in values {
        let url = reqwest::Url::parse(value.trim())
            .map_err(|_| "Enter a complete address, such as http://100.64.1.2:9444.")?;
        if !matches!(url.scheme(), "http" | "https")
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err("Connection addresses must be HTTP or HTTPS addresses without a path or credentials.".into());
        }
        if url.scheme() == "http" {
            let host = url.host_str().unwrap_or("").trim_matches(['[', ']']);
            let private = match host.parse::<std::net::IpAddr>() {
                Ok(std::net::IpAddr::V4(ip)) => {
                    ip.is_private()
                        || ip.is_loopback()
                        || ip.is_link_local()
                        || (ip.octets()[0] == 100 && (64..=127).contains(&ip.octets()[1]))
                }
                Ok(std::net::IpAddr::V6(ip)) => {
                    ip.is_loopback()
                        || (ip.segments()[0] & 0xfe00) == 0xfc00
                        || (ip.segments()[0] & 0xffc0) == 0xfe80
                }
                Err(_) => {
                    host == "localhost" || host.ends_with(".ts.net") || host.ends_with(".local")
                }
            };
            if !private {
                return Err(
                    "Use HTTPS for public addresses, or enter a LAN or Tailscale address.".into(),
                );
            }
        }
        let origin = url.origin().ascii_serialization();
        if !result.contains(&origin) {
            result.push(origin);
        }
    }
    Ok(result)
}
fn validate(value: &str) -> Result<&str> {
    match value {
        "127.0.0.1" | "0.0.0.0" => Ok(value),
        _ => Err("Choose this computer only or LAN and tailnet.".into()),
    }
}

fn inspect(root: &Path) -> Result<Value> {
    let output = root.join("network-inspect.json");
    std::fs::write(&output, "").map_err(|e| e.to_string())?;
    let mut command = Command::new(crate::profiles::docker_executable());
    command.args(["inspect","--format",r#"{"origins":{{json (index .Config.Labels "io.kindred.network-origins")}},"ports":{{json .NetworkSettings.Ports}},"files":{{json (index .Config.Labels "com.docker.compose.project.config_files")}},"directory":{{json (index .Config.Labels "com.docker.compose.project.working_dir")}}}"#,"kindred-standalone-server-1"]);
    crate::profiles::hidden(&mut command);
    let result = crate::setup_progress::run(&mut command, &output, Duration::from_secs(15), |_| {});
    let bytes = std::fs::read(&output).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(output);
    result?;
    serde_json::from_slice(&bytes)
        .map_err(|_| "Could not read the local server's network configuration.".into())
}
fn active(info: &Value) -> Result<String> {
    info["ports"]["9444/tcp"]
        .as_array()
        .and_then(|ports| {
            ports.iter().find_map(|p| {
                p["HostIp"]
                    .as_str()
                    .filter(|ip| *ip == "0.0.0.0" || *ip == "127.0.0.1")
            })
        })
        .map(str::to_owned)
        .ok_or_else(|| "The local server has no supported port binding.".into())
}
#[tauri::command]
pub async fn standalone_network(
    window: crate::surface::Surface,
    bind: Option<String>,
    addresses: Option<Vec<String>>,
    restart: Option<bool>,
) -> Result<Value> {
    crate::profiles::local_admin(&window)?;
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let host=app.state::<crate::profiles::Host>();
        let previous={
            let mut state=host.setup.lock().map_err(|e|e.to_string())?;
            if state["status"]=="working" {return Err("Wait for the current server operation to finish.".into());}
            let previous=state.clone();
            *state=json!({"status":"working","stage":"Checking network settings"});
            previous
        };
        let result=(|| {
            let root=crate::local_files::install_root()?.join("standalone");
            let info=inspect(&root)?;
            let current=active(&info)?;
            if let Some(bind)=bind {
                validate(&bind)?;
                // Small atomic setting outside versioned bundles survives app upgrades.
                let addresses=normalize_origins(addresses.unwrap_or(origins(&root)?))?;
                if bind=="0.0.0.0" && addresses.is_empty(){return Err("Add the address you will use to connect from your phone.".into());}
                crate::local_files::atomic(&root.join("network.json"),&json!({"bind":bind,"origins":addresses}))?;
            }
            let desired=saved(&root)?;
            let addresses=origins(&root)?;
            let applied:Vec<String>=serde_json::from_str(info["origins"].as_str().unwrap_or("[]")).unwrap_or_default();
            let pending=desired!=current || addresses!=applied;
            if restart.unwrap_or(false) && pending {
                if crate::local_server::version().as_deref()!=Some(env!("CARGO_PKG_VERSION")){
                    return Err("Update the local server to match this app before applying network settings.".into());
                }
                let directory=info["directory"].as_str().ok_or("Missing Compose directory")?;
                let files=info["files"].as_str().ok_or("Missing Compose files")?;
                let mut command=Command::new(crate::profiles::docker_executable());
                command.current_dir(directory).args(["compose","--project-name","kindred-standalone"]);
                for file in files.split(',').filter(|file|!file.ends_with("network.override.json")){command.arg("-f").arg(file);}
                command.env("KINDRED_BIND",&desired).env("KINDRED_PORT","9444");
                let override_file=root.join("network.override.json");
                let allowed=serde_json::to_string(&addresses).map_err(|e|e.to_string())?;
                crate::local_files::atomic(&override_file,&json!({"services":{"server":{"environment":{"KINDRED_ALLOWED_ORIGINS":allowed},"labels":{"io.kindred.network-origins":allowed}}}}))?;
                command.arg("-f").arg(&override_file);
                #[cfg(target_os="linux")]
                {use std::os::unix::fs::MetadataExt;if let Ok(meta)=std::fs::metadata("/dev/kvm"){command.env("KINDRED_KVM_GID",meta.gid().to_string());}}
                command.args(["up","-d","--no-build","--pull","never","--force-recreate","server"]);
                crate::profiles::hidden(&mut command);
                host.setup.lock().unwrap()["stage"]=json!("Restarting local server");
                crate::setup_progress::run(&mut command,&root.join("network-restart.log"),Duration::from_secs(180), |_|{})?;
                let deadline=Instant::now()+Duration::from_secs(90);
                while crate::local_server::version().is_none(){
                    if Instant::now()>=deadline{return Err("The server has not reconnected yet. Check the local server status before retrying.".into());}
                    std::thread::sleep(Duration::from_secs(1));
                }
                let after=inspect(&root)?;
                let actual=active(&after)?;
                let actual_origins:Vec<String>=serde_json::from_str(after["origins"].as_str().unwrap_or("[]")).unwrap_or_default();
                if actual!=desired || actual_origins!=addresses{return Err("The server restarted but its network binding did not change.".into());}
                return Ok(json!({"bind":desired,"addresses":addresses,"active":actual,"pending":false}));
            }
            Ok(json!({"bind":desired,"addresses":addresses,"active":current,"pending":pending}))
        })();
        *host.setup.lock().unwrap()=previous;
        result
    }).await.map_err(|e|e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saved_network_survives_reload_and_replacement() {
        let root=std::env::temp_dir().join(format!("kindred-network-{}",uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        assert_eq!(saved(&root).unwrap(),"127.0.0.1");
        for bind in ["0.0.0.0","127.0.0.1"] {
            crate::local_files::atomic(&root.join("network.json"),&json!({"bind":bind,"origins":["http://100.64.1.2:9444"]})).unwrap();
            assert_eq!(saved(&root).unwrap(),bind);
            assert_eq!(origins(&root).unwrap(),vec!["http://100.64.1.2:9444"]);
        }
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn connection_origins_are_exact_and_validated() {
        assert_eq!(
            normalize_origins(vec![
                "http://100.64.1.2:9444/".into(),
                "http://100.64.1.2:9444".into()
            ])
            .unwrap(),
            vec!["http://100.64.1.2:9444"]
        );
        for bad in [
            "*",
            "file:///tmp",
            "http://user:pass@host",
            "http://host/path",
            "http://host?x=1",
        ] {
            assert!(normalize_origins(vec![bad.into()]).is_err());
        }
    }
    #[test]
    fn only_supported_bindings_preserve_local_access() {
        assert!(validate("127.0.0.1").is_ok());
        assert!(validate("0.0.0.0").is_ok());
        for bad in ["", "::", "100.1.2.3", "0.0.0.0\nOTHER=x", "localhost"] {
            assert!(validate(bad).is_err());
        }
        assert_eq!(
            active(&json!({"ports":{"9444/tcp":[{"HostIp":"0.0.0.0"}]}})).unwrap(),
            "0.0.0.0"
        );
    }
}
