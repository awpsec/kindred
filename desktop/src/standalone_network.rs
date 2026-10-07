//! Host-side port publishing; the desktop always keeps its loopback URL.
use crate::{
    network_interfaces::{
        Interface, origin, private_address, private_browser_address, usable_address,
    },
    network_plan::Plan,
};
use serde_json::{Value, json};
use std::{
    path::Path,
    process::Command,
    time::{Duration, Instant},
};
use tauri::Manager;
type Result<T> = std::result::Result<T, String>;

pub fn settings(root: &Path) -> Result<crate::network_plan::Plan> {
    match std::fs::read(root.join("network.json")) {
        Ok(bytes) => {
            let mut plan = crate::network_plan::Plan::decode(
                serde_json::from_slice(&bytes).map_err(|_| "Could not read network settings.")?,
            )?;
            plan.origins = normalize_origins_with_consent(plan.origins, &plan.confirmed_http_origins)?;
            plan.extra_origins = normalize_origins_with_consent(plan.extra_origins, &plan.confirmed_http_origins)?;
            if plan.confirmed_http_origins.iter().any(|v| !v.starts_with("http://") || !plan.origins.contains(v)) {return Err("Saved HTTP confirmation does not match the connection addresses. Confirm the addresses again before saving.".into());}
            Ok(plan)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Ok(crate::network_plan::Plan::default())
        }
        Err(e) => Err(e.to_string()),
    }
}
fn legacy_change_allowed(plan: &Plan, changing: bool, restart: bool) -> Result<()> {
    if (changing || restart) && !plan.confirmed_http_origins.is_empty() {return Err("Use Connection access in the updated app to change these confirmed HTTP settings.".into());}
    Ok(())
}
pub fn saved(root: &Path) -> Result<String> {
    Ok(settings(root)?.bind)
}
pub fn origins(root: &Path) -> Result<Vec<String>> {
    let plan=settings(root)?; normalize_origins_with_consent(plan.origins,&plan.confirmed_http_origins)
}

fn normalize_origins(values: Vec<String>) -> Result<Vec<String>> { normalize_origins_with_consent(values,&[]) }
fn normalize_origins_with_consent(values: Vec<String>, confirmed: &[String]) -> Result<Vec<String>> {
    if values.len() > 128 {
        return Err("Too many connection addresses.".into());
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
            if !private && !confirmed.contains(&url.origin().ascii_serialization()) {
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
    if result.len() > 8 {
        return Err("Kindred can allow up to 8 connection addresses. Deselect a network or remove an additional address.".into());
    }
    Ok(result)
}
fn validate(value: &str) -> Result<&str> {
    match value {
        "127.0.0.1" | "0.0.0.0" => Ok(value),
        _ => Err("Choose this computer only or All interfaces.".into()),
    }
}

fn inspect(root: &Path) -> Result<Value> {
    let output = root.join("network-inspect.json");
    std::fs::write(&output, "").map_err(|e| e.to_string())?;
    let mut command = Command::new(crate::profiles::docker_executable());
    command.args(["inspect","--format",r#"{"origins":{{json (index .Config.Labels "io.kindred.network-origins")}},"confirmed_http":{{json (index .Config.Labels "io.kindred.network-confirmed-http")}},"ports":{{json .NetworkSettings.Ports}},"files":{{json (index .Config.Labels "com.docker.compose.project.config_files")}},"directory":{{json (index .Config.Labels "com.docker.compose.project.working_dir")}}}"#,"kindred-standalone-server-1"]);
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
fn tailnet_command(disable: bool) -> Command {
    let mut command = Command::new(tailscale_executable());
    // Off retains the original flags; explicit root scope preserves siblings.
    command.args(["serve", "--bg", "--https=443", "--set-path=/"]);
    command.arg(if disable {
        "off"
    } else {
        "http://127.0.0.1:9444"
    });
    crate::profiles::hidden(&mut command);
    command
}
fn tailscale_json(root: &Path, args: &[&str]) -> Result<Value> {
    let output = root.join("tailnet-check.json");
    let mut command = Command::new(tailscale_executable());
    command.args(args);
    crate::profiles::hidden(&mut command);
    let result = crate::setup_progress::run(&mut command, &output, Duration::from_secs(10), |_| {});
    let bytes = std::fs::read(&output).unwrap_or_default();
    let _ = std::fs::remove_file(output);
    result.map_err(|_|"Open Tailscale on this computer and sign in. Check that its command-line tools are installed, then check again.".to_string())?;
    serde_json::from_slice(&bytes).map_err(|_| {
        "Tailscale returned an unreadable status. Update Tailscale and check again.".into()
    })
}
fn tailscale_executable() -> String {
    #[cfg(target_os = "macos")]
    {
        let path = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
        if Path::new(path).is_file() {
            return path.into();
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(program) = std::env::var("ProgramFiles") {
            let path = Path::new(&program).join("Tailscale").join("tailscale.exe");
            if path.is_file() {
                return path.to_string_lossy().into_owned();
            }
        }
    }
    "tailscale".into()
}
fn tailnet(root: &Path) -> Value {
    match (|| {
        let status = tailscale_json(root, &["status", "--json"])?;
        let serve = tailscale_json(root, &["serve", "status", "--json"])?;
        Ok::<_, String>(tailnet_identity(
            crate::tailnet_access::state(&status, &serve),
            &status,
        ))
    })() {
        Ok(value) => value,
        Err(message) => json!({"state":"unavailable","message":message}),
    }
}
fn tailnet_identity(mut value: Value, status: &Value) -> Value {
    if status["BackendState"] == "Running" {
        let ips: Vec<String> = status["Self"]["TailscaleIPs"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|v| v.as_str()?.parse::<std::net::IpAddr>().ok())
            .filter(|ip| private_address(*ip) && usable_address(*ip))
            .map(|ip| ip.to_string())
            .collect();
        value["private_ips"] = json!(ips);
        // state() validated this exact DNS name before exposing an address.
        if let Some(address) = value["address"].as_str() {
            if let Ok(url) = reqwest::Url::parse(address) {
                if let Some(host) = url.host_str() {
                    value["browser_address"] = json!(format!("http://{host}:9444"));
                }
            }
        }
    }
    value
}
fn enrich_tailnet(inventory: &mut [Interface], tailnet: &Value) {
    for row in inventory {
        if row.addresses.iter().any(|ip| {
            tailnet["private_ips"]
                .as_array()
                .is_some_and(|ips| ips.iter().any(|v| v.as_str() == Some(ip)))
        }) {
            row.kind = "tailnet".into();
            row.name = "Tailscale".into();
        }
    }
}
fn generated_origins(plan: &Plan, inventory: &[Interface], tailnet: &Value) -> Vec<String> {
    let mut origins = plan.generated_origins(inventory);
    if plan.all_networks
        || plan.interfaces.iter().any(|selected| {
            inventory
                .iter()
                .any(|row| row.id == selected.id && row.kind == "tailnet")
        })
    {
        if let Some(address) = tailnet["browser_address"].as_str() {
            origins.push(address.into());
        }
    }
    origins
}
fn connection_origins(plan: &Plan, inventory: &[Interface], tailnet: &Value) -> Vec<String> {
    let mut result=plan.connection_origins(inventory);
    if plan.all_networks || plan.interfaces.iter().any(|s|inventory.iter().any(|r|r.id==s.id&&r.kind=="tailnet")) {
        if let Some(address)=tailnet["browser_address"].as_str(){result.push(address.into());}
    }
    result
}
fn applied_response(plan: &Plan, actual: &[String], pending: bool, tailnet: Value, inventory: Vec<Interface>, error: Option<String>, applied: &[String]) -> Result<Value> {
    let mut addresses=std::collections::BTreeSet::new();
    for row in &inventory {if row.available {for ip in &row.addresses {if let Ok(ip)=ip.parse::<std::net::IpAddr>() {if usable_address(ip)&&bound(ip,actual) {addresses.insert(origin(ip));}}}}}
    if tailnet["state"]=="shared" {if let Some(a)=tailnet["address"].as_str(){addresses.insert(a.into());}}
    let share_active=tailnet["state"]=="shared";
    let sharing_unknown=!matches!(tailnet["state"].as_str(),Some("shared"|"not_set_up"|"not_signed_in"));
    let needs_reconcile=share_active!=plan.tailnet_https;
    let mut value=network_response(plan,actual,pending,tailnet,inventory,error)?;
    value["connection_access_supported"]=json!(true);
    value["tailnet_https"]=json!(plan.tailnet_https);
    value["active_origins"]=json!(applied);
    value["applied_addresses"]=json!(addresses.into_iter().collect::<Vec<_>>());
    value["confirmed_http_origins"]=json!(plan.confirmed_http_origins);
    value["needs_reconcile"]=json!(needs_reconcile);
    value["sharing_unknown"]=json!(sharing_unknown);
    Ok(value)
}
fn saved_access(root: &Path, _bind: &str) -> Result<String> {
    Ok(settings(root)?.access)
}
fn active_bindings(info: &Value) -> Result<Vec<String>> {
    let rows = info["ports"]["9444/tcp"]
        .as_array()
        .ok_or("The local server has no published connection address.")?;
    let mut addresses = std::collections::BTreeSet::new();
    for row in rows {
        if row["HostPort"].as_str().is_some_and(|port| port != "9444") {
            continue;
        }
        if let Some(ip) = row["HostIp"]
            .as_str()
            .and_then(|s| s.trim_matches(['[', ']']).parse::<std::net::IpAddr>().ok())
        {
            addresses.insert(ip.to_string());
        }
    }
    if addresses.is_empty() {
        return Err("The local server has no supported port binding.".into());
    }
    Ok(addresses.into_iter().collect())
}
fn matches_bindings(wanted: &[String], actual: &[String]) -> bool {
    if wanted == ["0.0.0.0"] {
        actual.iter().any(|s| s == "0.0.0.0") && actual.iter().all(|s| s == "0.0.0.0" || s == "::")
    } else {
        wanted == actual
    }
}
fn bound(ip: std::net::IpAddr, actual: &[String]) -> bool {
    actual.contains(&ip.to_string())
        || actual.iter().any(|s| {
            if ip.is_ipv4() {
                s == "0.0.0.0"
            } else {
                s == "::"
            }
        })
}
fn response(
    root: &Path,
    desired: &str,
    addresses: &[String],
    current: &str,
    pending: bool,
    tailnet: Value,
) -> Result<Value> {
    let mut plan = settings(root)?;
    plan.bind = desired.into();
    plan.origins = addresses.to_vec();
    network_response(&plan, &[current.into()], pending, tailnet, vec![], None)
}
fn network_response(
    plan: &Plan,
    actual: &[String],
    pending: bool,
    tailnet: Value,
    mut inventory: Vec<Interface>,
    discovery_error: Option<String>,
) -> Result<Value> {
    enrich_tailnet(&mut inventory, &tailnet);
    let ready = plan.access == "tailnet"
        && !plan.all_networks
        && plan.interfaces.is_empty()
        && matches_bindings(&plan.bindings()?, actual)
        && !pending
        && tailnet["state"] == "shared"
        && tailnet["address"]
            .as_str()
            .is_some_and(|a| plan.origins.iter().any(|v| v == a));
    let tailnet_address_ready = !pending
        && bound(std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST), actual)
        && tailnet["state"] == "shared"
        && tailnet["address"].as_str()
            .is_some_and(|address| plan.origins.iter().any(|origin| origin == address));
    let mut rows = vec![];
    for saved in &plan.interfaces {
        if !inventory.iter().any(|r| r.id == saved.id) {
            inventory.push(Interface {
                id: saved.id.clone(),
                name: "Other".into(),
                kind: "other".into(),
                addresses: saved.addresses.clone(),
                available: false,
            });
        }
    }
    for row in &inventory {
        let saved = plan.interfaces.iter().find(|s| s.id == row.id);
        let changed = saved.is_some_and(|s| {
            s.addresses.iter().any(|a| !row.addresses.contains(a))
                || row
                    .addresses
                    .iter()
                    .filter_map(|a| a.parse::<std::net::IpAddr>().ok())
                    .filter(|ip| usable_address(*ip))
                    .any(|ip| !s.addresses.contains(&ip.to_string()))
        });
        let mut value = serde_json::to_value(row).map_err(|e| e.to_string())?;
        value["selected"] = json!(saved.is_some());
        value["address_changed"] = json!(changed);
        rows.push(value);
    }
    let ips: Vec<String> = if plan.all_networks {
        inventory
            .iter()
            .filter(|r| r.available)
            .flat_map(|r| r.addresses.clone())
            .collect()
    } else {
        plan.interfaces
            .iter()
            .flat_map(|r| r.addresses.clone())
            .collect()
    };
    let mut connections = vec![];
    let mut seen = std::collections::BTreeSet::new();
    for address in ips {
        let Ok(ip) = address.parse::<std::net::IpAddr>() else {
            continue;
        };
        if !usable_address(ip) || (!private_browser_address(ip) && !plan.confirmed_http_origins.contains(&origin(ip))) || !seen.insert(ip) {
            continue;
        }
        let url = origin(ip);
        let interface = inventory.iter().find(|r| r.addresses.contains(&address));
        let available = interface.is_some_and(|r| r.available);
        let enabled = plan.origins.contains(&url);
        let listening = enabled
            && !pending
            && available
            && bound(ip, actual)
            && std::net::TcpStream::connect_timeout(
                &std::net::SocketAddr::new(ip, 9444),
                Duration::from_millis(300),
            )
            .is_ok();
        let (state, error) = if !available {
            (
                "error",
                Some("This network address is not available right now."),
            )
        } else if !enabled {
            (
                "error",
                Some("Address changed · save to use the new address."),
            )
        } else if pending {
            ("saved", None)
        } else if listening {
            ("listening", None)
        } else {
            (
                "error",
                Some(
                    "Could not connect to Kindred at this address. Check the network and Docker port binding.",
                ),
            )
        };
        connections.push(json!({"address":url,"phone_capable":private_address(ip)&&interface.is_some_and(|row|matches!(row.kind.as_str(),"lan"|"tailnet")),"kind":interface.map(|r|r.kind.as_str()).unwrap_or("other"),"state":state,"error":error}));
    }
    if let Some(address) = tailnet["browser_address"].as_str() {
        if plan.origins.iter().any(|s| s == address) {
            let listening = connections
                .iter()
                .any(|v| v["kind"] == "tailnet" && v["state"] == "listening");
            connections.push(json!({"address":address,"phone_capable":false,"kind":"tailnet","state":if pending {"saved"}else if listening {"listening"}else {"error"},"error":if pending||listening {None}else {Some("This Tailscale address is not listening yet.")}}));
        }
    }
    let current = if actual.iter().any(|s| s == "0.0.0.0") {
        "0.0.0.0"
    } else {
        "127.0.0.1"
    };
    Ok(
        json!({"interface_selection_supported":true,"bind":plan.bind,"access":plan.access,"addresses":plan.origins,"extra_addresses":plan.extra_origins,"active":current,"pending":pending,"tailnet":tailnet,"ready_to_pair":ready,"tailnet_address_ready":tailnet_address_ready,"interfaces":rows,"selected_interfaces":plan.interfaces.iter().map(|r|&r.id).collect::<Vec<_>>(),"all_networks":plan.all_networks,"bindings":plan.bindings()?,"active_bindings":actual,"connection_addresses":connections,"interface_error":discovery_error}),
    )
}

fn compose_version_supported(version: &str) -> bool {
    let nums: Vec<_> = version
        .trim()
        .trim_start_matches('v')
        .split('.')
        .take(3)
        .map(|s| {
            s.split('-')
                .next()
                .unwrap_or("")
                .parse::<u32>()
                .unwrap_or(0)
        })
        .collect();
    nums.len() == 3 && (nums[0], nums[1], nums[2]) >= (2, 24, 4)
}
fn compose_override(plan: &Plan) -> Result<String> {
    let origins = serde_json::to_string(&plan.origins).map_err(|e| e.to_string())?;
    let mut value = format!(
        "services:\n  server:\n    environment:\n      KINDRED_ALLOWED_ORIGINS: {}\n      KINDRED_CONFIRMED_HTTP_ORIGINS: {}\n    labels:\n      io.kindred.network-origins: {}\n      io.kindred.network-confirmed-http: {}\n    ports: !override\n",
        serde_json::to_string(&origins).unwrap(),
        serde_json::to_string(&serde_json::to_string(&plan.confirmed_http_origins).unwrap()).unwrap(),
        serde_json::to_string(&origins).unwrap(),
        serde_json::to_string(&serde_json::to_string(&plan.confirmed_http_origins).unwrap()).unwrap()
    );
    for ip in plan.bindings()? {
        value.push_str(&format!("      - target: 9444\n        published: \"9444\"\n        host_ip: {}\n        protocol: tcp\n",serde_json::to_string(&ip).unwrap()));
    }
    Ok(value)
}
fn check_compose(root: &Path) -> Result<()> {
    let mut command = Command::new(crate::profiles::docker_executable());
    command.args(["compose", "version", "--short"]);
    crate::profiles::hidden(&mut command);
    let output = root.join("network-compose-version.txt");
    let result = crate::setup_progress::run(&mut command, &output, Duration::from_secs(10), |_| {});
    let text = std::fs::read_to_string(&output).unwrap_or_default();
    let _ = std::fs::remove_file(output);
    result.map_err(|_| "Could not check Docker Compose. Open Docker and try again.".to_string())?;
    if !compose_version_supported(&text) {
        return Err(
            "Update Docker Compose to 2.24.4 or later to apply explicit network settings safely."
                .into(),
        );
    }
    Ok(())
}
pub fn prepare_override(root: &Path) -> Result<std::path::PathBuf> {
    check_compose(root)?;
    let plan = settings(root)?;
    plan.preflight(&crate::network_interfaces::discover(root)?)?;
    let file = root.join("network.override.yaml");
    crate::local_files::atomic_text(&file, &compose_override(&plan)?)?;
    Ok(file)
}

#[tauri::command]
pub async fn standalone_network(
    window: crate::surface::Surface,
    bind: Option<String>,
    addresses: Option<Vec<String>>,
    restart: Option<bool>,
    access: Option<String>,
    enable_tailnet: Option<bool>,
    disable_tailnet: Option<bool>,
    interfaces: Option<Vec<String>>,
    all_networks: Option<bool>,
    apply_access: Option<bool>,
    tailnet_https: Option<bool>,
    confirmed_http_origins: Option<Vec<String>>,
) -> Result<Value> {
    crate::profiles::local_admin(&window)?;
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let host=app.state::<crate::profiles::Host>();
        let previous={let mut state=host.setup.lock().map_err(|e|e.to_string())?;if state["status"]=="working"{return Err("Wait for the current server operation to finish.".into());}let previous=state.clone();*state=json!({"status":"working","stage":"Checking network settings"});previous};
        let result=(||{
            let root=crate::local_files::install_root()?.join("standalone");
            let info=inspect(&root)?;let actual=active_bindings(&info)?;let mut plan=settings(&root)?;
            let discovered=crate::network_interfaces::discover(&root);let discovery_error=discovered.as_ref().err().cloned();let mut inventory=discovered.unwrap_or_default();
            let mut tailnet=tailnet(&root);
            let applying=apply_access.unwrap_or(false);
            let original=plan.clone();
            let accepted=confirmed_http_origins.unwrap_or_default();
            let desired_share=applying && (access.as_deref()==Some("tailnet") || access.as_deref()==Some("lan") && tailnet_https.unwrap_or(false));
            let enable_tailnet=if applying {Some(desired_share)} else {enable_tailnet};
            let disable_tailnet=if applying {Some(!desired_share && tailnet["state"]=="shared")} else {disable_tailnet};
            let restart=if applying {Some(true)} else {restart};
            enrich_tailnet(&mut inventory,&tailnet);
            if enable_tailnet.unwrap_or(false)&&disable_tailnet.unwrap_or(false){return Err("Choose one phone access action at a time.".into());}
            let changing=disable_tailnet.unwrap_or(false)||access.is_some()||bind.is_some()||addresses.is_some()||interfaces.is_some()||all_networks.is_some()||enable_tailnet.unwrap_or(false)||applying;
            if !applying {legacy_change_allowed(&plan,changing,restart.unwrap_or(false))?;}
            if let Some(mode)=access.as_deref(){
                if !matches!(mode,"local"|"tailnet"|"lan"){return Err("Choose who can reach this Kindred.".into());}
                plan.access=mode.into();
                if mode!="lan"{plan.select(&[],false,&inventory)?;}
            }
            if let Some(bind)=bind.as_deref(){validate(bind)?;plan.select(&[],bind=="0.0.0.0",&inventory)?;if access.is_none(){plan.access=if bind=="0.0.0.0"{"lan"}else{"local"}.into();}}
            if interfaces.is_some()||all_networks.is_some(){
                if plan.access!="lan"{return Err("Choose Advanced: local network before selecting networks.".into());}
                if let Some(error)=&discovery_error{return Err(error.clone());}
                plan.select(&interfaces.unwrap_or_else(||plan.interfaces.iter().map(|r|r.id.clone()).collect()),all_networks.unwrap_or(false),&inventory)?;
            }
            if let Some(addresses)=addresses {plan.extra_origins=if applying {normalize_origins_with_consent(addresses,&accepted)?}else{normalize_origins(addresses)?};}
            if applying {
                if access.is_none(){return Err("Choose who can reach this Kindred.".into());}
                if !crate::local_server::connection_access_available(){return Err("Update the local server to match this app before changing connection access.".into());}
                if desired_share && !matches!(tailnet["state"].as_str(),Some("shared"|"not_set_up")){return Err(tailnet["message"].as_str().unwrap_or("Check Tailscale before saving.").into());}
                if !desired_share && original.tailnet_https && !matches!(tailnet["state"].as_str(),Some("shared"|"not_set_up")){return Err("Could not confirm whether Kindred is still shared. Check Tailscale before changing access.".into());}
                if plan.access!="lan" {plan.extra_origins.clear();}
                if let Some(address)=tailnet["address"].as_str(){plan.extra_origins.retain(|v|v!=address);if desired_share {plan.extra_origins.push(address.into());}}
                plan.tailnet_https=desired_share;
                let mut wanted_origins=plan.extra_origins.clone();
                if plan.access=="lan" {wanted_origins.extend(connection_origins(&plan,&inventory,&tailnet));}
                plan.origins=normalize_origins_with_consent(wanted_origins,&accepted)?;
                plan.confirm_http(&plan.origins.clone(),&accepted)?;
                plan.preflight(&inventory)?;
                check_compose(&root)?;
                for address in plan.bindings()? {if address!="0.0.0.0" {let ip:std::net::IpAddr=address.parse().map_err(|_|"Invalid listening address.")?;if !bound(ip,&actual){std::net::TcpListener::bind(std::net::SocketAddr::new(ip,9444)).map_err(|e|format!("Could not listen on {address}: {e}. Current settings were not changed."))?;}}}
            }
            if disable_tailnet.unwrap_or(false){
                if tailnet["state"]!="shared"{return Err("Only the confirmed Kindred phone share can be turned off here. Check Tailscale before trying again.".into());}
                host.setup.lock().unwrap()["stage"]=json!("Turning off Kindred sharing…");
                let mut command=tailnet_command(true);crate::setup_progress::run(&mut command,&root.join("tailnet-disable.log"),Duration::from_secs(30),|_|{}).map_err(|_|"Could not turn off private phone sharing. Check Tailscale and try again.".to_string())?;
                tailnet=self::tailnet(&root);if tailnet["state"]!="not_set_up"{return Err("Sharing could not be confirmed off. Check Tailscale before retrying.".into());}
                if !applying {plan.tailnet_https=false;if plan.access=="tailnet" {plan.access="local".into();}if let Some(address)=tailnet["address"].as_str(){plan.extra_origins.retain(|v|v!=address);}}
            }
            if enable_tailnet.unwrap_or(false){
                if plan.access!="tailnet" && !(applying && plan.access=="lan"){return Err("Choose My devices with Tailscale first.".into());}
                if !matches!(tailnet["state"].as_str(),Some("shared"|"not_set_up")){return Err(tailnet["message"].as_str().unwrap_or("Set up Tailscale first, then check again.").into());}
                let address=tailnet["address"].as_str().ok_or("Tailscale has no phone address.")?.to_owned();
                if !plan.extra_origins.contains(&address){plan.extra_origins.push(address);}
                // Validate the complete setting before touching the host share.
                normalize_origins_with_consent(plan.extra_origins.clone(),&plan.confirmed_http_origins)?;
                if tailnet["state"]!="shared"{
                    host.setup.lock().unwrap()["stage"]=json!("Setting up encrypted access…");
                    let mut command=tailnet_command(false);crate::setup_progress::run(&mut command,&root.join("tailnet-enable.log"),Duration::from_secs(30),|_|{}).map_err(|_|"Tailscale needs attention. Open a terminal and run tailscale serve --bg http://127.0.0.1:9444, follow its HTTPS consent instructions, then check again.".to_string())?;
                    tailnet=self::tailnet(&root);if tailnet["state"]!="shared"{return Err("Private phone sharing could not be confirmed. Check Tailscale and try again.".into());}
                }
            }
            if changing {
                let mut origins=plan.extra_origins.clone();if plan.access=="lan"{origins.extend(generated_origins(&plan,&inventory,&tailnet));}
                if !applying {plan.origins=normalize_origins(origins)?;plan.confirmed_http_origins.clear();plan.tailnet_https=plan.access=="tailnet"&&tailnet["state"]=="shared";}
                crate::local_files::atomic(&root.join("network.json"),&serde_json::to_value(&plan).map_err(|e|e.to_string())?)?;
            }
            let applied:Vec<String>=serde_json::from_str(info["origins"].as_str().unwrap_or("[]")).unwrap_or_default();
            let wanted=plan.bindings()?;let applied_http:Vec<String>=serde_json::from_str(info["confirmed_http"].as_str().unwrap_or("[]")).unwrap_or_default();
            let runtime_verified=if applying || crate::local_server::connection_access_available() {crate::local_server::connection_policy_matches(&applied,&applied_http)} else {true};
            let pending=!matches_bindings(&wanted,&actual)||plan.origins!=applied||plan.confirmed_http_origins!=applied_http||!runtime_verified;
            if restart.unwrap_or(false)&&pending {
                if crate::local_server::version().as_deref()!=Some(env!("CARGO_PKG_VERSION")){return Err("Update the local server to match this app before applying network settings.".into());}
                plan.preflight(&inventory)?;
                // Fail before recreation if a newly selected local port is busy.
                for address in &wanted {if address!="0.0.0.0" {let ip:std::net::IpAddr=address.parse().map_err(|_|"Invalid listening address.")?;if !bound(ip,&actual){std::net::TcpListener::bind(std::net::SocketAddr::new(ip,9444)).map_err(|e|format!("Could not listen on {address}: {e}. The current server was not restarted."))?;}}}
                let override_file=prepare_override(&root)?;
                let directory=info["directory"].as_str().ok_or("Missing Compose directory")?;let files=info["files"].as_str().ok_or("Missing Compose files")?;
                let mut command=Command::new(crate::profiles::docker_executable());command.current_dir(directory).args(["compose","--project-name","kindred-standalone"]);
                for file in files.split(',').filter(|f|!f.ends_with("network.override.json")&&!f.ends_with("network.override.yaml")){command.arg("-f").arg(file);}
                command.arg("-f").arg(&override_file).env("KINDRED_BIND",&plan.bind).env("KINDRED_PORT","9444");
                #[cfg(target_os="linux")]
                {use std::os::unix::fs::MetadataExt;if let Ok(meta)=std::fs::metadata("/dev/kvm"){command.env("KINDRED_KVM_GID",meta.gid().to_string());}}
                crate::profiles::hidden(&mut command);
                command.args(["config","--quiet"]);crate::setup_progress::run(&mut command,&root.join("network-validate.log"),Duration::from_secs(20),|_|{})?;
                // Build a separate command so validation args cannot leak into up.
                let mut up=Command::new(crate::profiles::docker_executable());up.current_dir(directory).args(command.get_args().take(command.get_args().len()-2));
                up.env("KINDRED_BIND",&plan.bind).env("KINDRED_PORT","9444");
                #[cfg(target_os="linux")]
                {use std::os::unix::fs::MetadataExt;if let Ok(meta)=std::fs::metadata("/dev/kvm"){up.env("KINDRED_KVM_GID",meta.gid().to_string());}}
                up.args(["up","-d","--no-build","--pull","never","--force-recreate","server"]);crate::profiles::hidden(&mut up);host.setup.lock().unwrap()["stage"]=json!("Restarting local server");
                crate::setup_progress::run(&mut up,&root.join("network-restart.log"),Duration::from_secs(180),|_|{})?;
                let deadline=Instant::now()+Duration::from_secs(90);
                host.setup.lock().unwrap()["stage"]=json!("Reconnecting…");
                while crate::local_server::version().is_none(){if Instant::now()>=deadline{return Err("The server has not reconnected yet. Check local server status before retrying.".into());}std::thread::sleep(Duration::from_secs(1));}
                host.setup.lock().unwrap()["stage"]=json!("Checking access…");
                let after=inspect(&root)?;let current=active_bindings(&after)?;let after_origins:Vec<String>=serde_json::from_str(after["origins"].as_str().unwrap_or("[]")).unwrap_or_default();
                if !matches_bindings(&wanted,&current)||plan.origins!=after_origins||plan.confirmed_http_origins!=serde_json::from_str::<Vec<String>>(after["confirmed_http"].as_str().unwrap_or("[]")).unwrap_or_default(){return Err("The server restarted but its listening addresses did not match the saved settings. Check again before retrying.".into());}
                if applying&&!crate::local_server::connection_policy_matches(&plan.origins,&plan.confirmed_http_origins){return Err("The server restarted but its connection policy could not be confirmed. Check again before retrying.".into());}
                return applied_response(&plan,&current,false,tailnet,inventory,discovery_error,&after_origins);
            }
            applied_response(&plan,&actual,pending,tailnet,inventory,discovery_error,&applied)
        })();*host.setup.lock().unwrap()=previous;result.map(|mut value|{value["connection_access_server_supported"]=json!(crate::local_server::connection_access_available());value})
    }).await.map_err(|e|e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn connection_access_legacy_changes_cannot_inherit_confirmed_origins() {
        let mut plan=Plan::default();plan.origins=vec!["http://203.0.113.7:9444".into()];plan.confirmed_http_origins=plan.origins.clone();let before=plan.clone();
        assert!(legacy_change_allowed(&plan,false,false).is_ok(),"read-only legacy observation remains available");
        for (changing,restart) in [(true,false),(false,true),(true,true)] {assert!(legacy_change_allowed(&plan,changing,restart).is_err());assert_eq!(plan,before);}
        assert!(legacy_change_allowed(&Plan::default(),true,true).is_ok(),"old private-network settings retain their legacy behavior");
    }
    #[test]
    fn connection_access_saved_consent_cannot_authorize_unselected_addresses() {
        let root=std::env::temp_dir().join(format!("kindred-consent-{}",uuid::Uuid::new_v4()));std::fs::create_dir(&root).unwrap();let mut plan=Plan::default();plan.access="lan".into();plan.origins=vec!["http://203.0.113.7:9444".into()];plan.confirmed_http_origins=plan.origins.clone();
        std::fs::write(root.join("network.json"),serde_json::to_vec(&plan).unwrap()).unwrap();assert_eq!(settings(&root).unwrap(),plan);
        plan.confirmed_http_origins.push("http://203.0.113.8:9444".into());std::fs::write(root.join("network.json"),serde_json::to_vec(&plan).unwrap()).unwrap();assert!(settings(&root).is_err());std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn connection_access_current_state_uses_actual_bindings_not_the_saved_plan() {
        let mut plan=Plan::default();plan.access="lan".into();plan.origins=vec!["http://192.168.1.20:9444".into()];let rows=vec![Interface{id:"wifi".into(),name:"Wi-Fi".into(),kind:"lan".into(),addresses:vec!["192.168.1.20".into()],available:true}];
        let value=applied_response(&plan,&["127.0.0.1".into()],true,json!({"state":"not_set_up"}),rows.clone(),None,&[]).unwrap();assert_eq!(value["applied_addresses"],json!([]));assert_eq!(value["active_origins"],json!([]));assert_eq!(value["pending"],true);
        let value=applied_response(&Plan::default(),&["127.0.0.1".into(),"192.168.1.20".into()],true,json!({"state":"shared","address":"https://computer.tailnet.ts.net"}),rows,None,&[]).unwrap();assert_eq!(value["applied_addresses"],json!(["http://192.168.1.20:9444","https://computer.tailnet.ts.net"]));assert_eq!(value["needs_reconcile"],true);assert_eq!(value["tailnet_address_ready"],false);
    }
    #[test]
    fn applied_https_share_stays_pairable_with_explicit_lan_bindings() {
        let mut plan = Plan::default();
        plan.access = "lan".into();
        plan.interfaces = vec![crate::network_plan::Selection {
            id: "wifi".into(), addresses: vec!["192.168.1.20".into()],
        }];
        plan.origins = vec!["https://computer.tailnet.ts.net".into()];
        let actual = plan.bindings().unwrap();
        let share = json!({"state":"shared","address":"https://computer.tailnet.ts.net"});
        let ready = network_response(&plan, &actual, false, share.clone(), vec![], None).unwrap();
        assert_eq!(ready["tailnet_address_ready"], true,
            "Adding explicit LAN listeners must not hide an applied HTTPS share");
        assert_eq!(ready["ready_to_pair"], false, "Keep the existing mode-specific status");
        assert_eq!(network_response(&plan, &actual, true, share.clone(), vec![], None).unwrap()["tailnet_address_ready"], false);
        assert_eq!(network_response(&plan, &["192.168.1.20".into()], false, share.clone(), vec![], None).unwrap()["tailnet_address_ready"], false);
        assert_eq!(network_response(&plan, &["0.0.0.0".into()], false, share.clone(), vec![], None).unwrap()["tailnet_address_ready"], true);
        assert_eq!(network_response(&plan, &actual, false, json!({"state":"problem","address":"https://computer.tailnet.ts.net"}), vec![], None).unwrap()["tailnet_address_ready"], false);
        assert_eq!(network_response(&plan, &actual, false, json!({"state":"shared","address":"https://other.tailnet.ts.net"}), vec![], None).unwrap()["tailnet_address_ready"], false);
        plan.origins.clear();
        assert_eq!(network_response(&plan, &actual, false, share, vec![], None).unwrap()["tailnet_address_ready"], false);
    }
    #[test]
    fn explicit_ports_replace_wildcard_and_keep_ipv6_and_loopback() {
        let mut plan = Plan::default();
        plan.access = "lan".into();
        plan.interfaces = vec![crate::network_plan::Selection {
            id: "wifi".into(),
            addresses: vec!["192.168.1.20".into(), "fd7a:115c::5".into()],
        }];
        plan.origins = vec!["http://192.168.1.20:9444".into()];
        let yaml = compose_override(&plan).unwrap();
        assert!(yaml.contains("ports: !override"));
        assert!(!yaml.contains("0.0.0.0"));
        for ip in ["127.0.0.1", "192.168.1.20", "fd7a:115c::5"] {
            assert!(yaml.contains(&format!("host_ip: \"{ip}\"")));
        }
        assert!(yaml.contains("io.kindred.network-origins"));
        for version in ["2.24.4", "v2.39.1", "2.24.4-desktop.1", "3.0.0"] {
            assert!(compose_version_supported(version));
        }
        for version in ["2.24.3", "1.29.2", "2.24", "unknown"] {
            assert!(!compose_version_supported(version));
        }
        assert!(!matches_bindings(
            &plan.bindings().unwrap(),
            &["0.0.0.0".into(), "::".into()]
        ));
    }
    #[test]
    fn tailnet_dns_address_requires_verified_selected_interface() {
        let status = json!({"BackendState":"Running","Self":{"DNSName":"computer.tailnet.ts.net.","TailscaleIPs":["100.101.102.103","fd7a:115c::5"]}});
        let state = tailnet_identity(crate::tailnet_access::state(&status, &json!({})), &status);
        let mut rows = vec![Interface {
            id: "utun4".into(),
            name: "Other".into(),
            kind: "other".into(),
            addresses: vec!["100.101.102.103".into()],
            available: true,
        }];
        enrich_tailnet(&mut rows, &state);
        assert_eq!(rows[0].name, "Tailscale");
        let mut plan = Plan::default();
        assert!(generated_origins(&plan, &rows, &state).is_empty());
        plan.select(&["utun4".into()], false, &rows).unwrap();
        assert_eq!(
            generated_origins(&plan, &rows, &state),
            vec![
                "http://100.101.102.103:9444",
                "http://computer.tailnet.ts.net:9444"
            ]
        );
        let invalid = tailnet_identity(
            crate::tailnet_access::state(
                &json!({"BackendState":"Running","Self":{"DNSName":"bad.test"}}),
                &json!({}),
            ),
            &json!({"BackendState":"Running"}),
        );
        assert!(invalid["browser_address"].is_null());
    }
    #[test]
    #[ignore = "requires installed Docker Compose; run explicitly under project build lock"]
    fn actual_compose_merge_replaces_all_networks_with_explicit_ports() {
        let root =
            std::env::temp_dir().join(format!("kindred-compose-plan-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join("base.yaml"),"services:\n  server:\n    image: local-fixture\n    ports:\n      - \"0.0.0.0:9444:9444\"\n").unwrap();
        let mut plan = Plan::default();
        plan.interfaces = vec![crate::network_plan::Selection {
            id: "fixture".into(),
            addresses: vec!["192.168.1.20".into(), "fd7a:115c::5".into()],
        }];
        plan.origins=vec!["http://192.168.1.20:9444".into()];plan.confirmed_http_origins=plan.origins.clone();
        std::fs::write(root.join("network.yaml"), compose_override(&plan).unwrap()).unwrap();
        let output = Command::new(crate::profiles::docker_executable())
            .args(["compose", "-f"])
            .arg(root.join("base.yaml"))
            .arg("-f")
            .arg(root.join("network.yaml"))
            .args(["config", "--format", "json"])
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let value: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(value["services"]["server"]["environment"]["KINDRED_CONFIRMED_HTTP_ORIGINS"],serde_json::to_string(&plan.confirmed_http_origins).unwrap());
        assert_eq!(value["services"]["server"]["labels"]["io.kindred.network-confirmed-http"],serde_json::to_string(&plan.confirmed_http_origins).unwrap());
        let ports = value["services"]["server"]["ports"].as_array().unwrap();
        let mut actual: Vec<_> = ports
            .iter()
            .map(|p| p["host_ip"].as_str().unwrap().to_string())
            .collect();
        actual.sort();
        assert_eq!(actual, plan.bindings().unwrap());
        assert!(
            ports
                .iter()
                .all(|p| p["target"] == 9444 && p["published"] == "9444")
        );
        std::fs::write(root.join("network.yaml"),compose_override(&Plan::default()).unwrap()).unwrap();
        let revoked=Command::new(crate::profiles::docker_executable()).args(["compose","-f"]).arg(root.join("base.yaml")).arg("-f").arg(root.join("network.yaml")).args(["config","--format","json"]).output().unwrap();assert!(revoked.status.success());let revoked:Value=serde_json::from_slice(&revoked.stdout).unwrap();assert_eq!(revoked["services"]["server"]["ports"].as_array().unwrap().len(),1);assert_eq!(revoked["services"]["server"]["ports"][0]["host_ip"],"127.0.0.1");assert_eq!(revoked["services"]["server"]["environment"]["KINDRED_ALLOWED_ORIGINS"],"[]");assert_eq!(revoked["services"]["server"]["environment"]["KINDRED_CONFIRMED_HTTP_ORIGINS"],"[]");
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn serve_commands_keep_background_https_and_explicit_root_identity() {
        // Check the actual production Command, without executing host Serve.
        // The documented off contract requires every original flag; explicitly
        // scoped root removal also prevents deleting unrelated path handlers.
        let enable = tailnet_command(false);
        let disable = tailnet_command(true);
        let enable: Vec<_> = enable.get_args().map(|v| v.to_str().unwrap()).collect();
        let disable: Vec<_> = disable.get_args().map(|v| v.to_str().unwrap()).collect();
        for args in [&enable, &disable] {
            assert_eq!(args.first(), Some(&"serve"));
            assert!(
                args.contains(&"--bg"),
                "persistent sharing must retain --bg: {args:?}"
            );
            assert!(args.contains(&"--https=443"));
            assert!(
                args.contains(&"--set-path=/"),
                "operate only on Kindred's root handler"
            );
            assert!(!args.contains(&"reset"));
        }
        let enable_flags: Vec<_> = enable.iter().filter(|a| a.starts_with("--")).collect();
        let disable_flags: Vec<_> = disable.iter().filter(|a| a.starts_with("--")).collect();
        assert_eq!(
            enable_flags, disable_flags,
            "off retains the original flags"
        );
        assert_eq!(enable.last(), Some(&"http://127.0.0.1:9444"));
        assert_eq!(disable.last(), Some(&"off"));
    }
    #[test]
    fn readiness_requires_matching_share_and_applied_loopback_settings() {
        let root = std::env::temp_dir().join(format!("kindred-ready-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let address = "https://computer.tailnet.ts.net".to_string();
        let addresses = vec![address.clone()];
        crate::local_files::atomic(
            &root.join("network.json"),
            &json!({"bind":"127.0.0.1","access":"tailnet","origins":addresses}),
        )
        .unwrap();
        let shared = json!({"state":"shared","address":address});
        assert_eq!(
            response(
                &root,
                "127.0.0.1",
                &addresses,
                "127.0.0.1",
                false,
                shared.clone()
            )
            .unwrap()["ready_to_pair"],
            true
        );
        for (current, pending, origins, share) in [
            ("0.0.0.0", false, addresses.clone(), shared.clone()),
            ("127.0.0.1", true, addresses.clone(), shared.clone()),
            ("127.0.0.1", false, vec![], shared.clone()),
            (
                "127.0.0.1",
                false,
                addresses.clone(),
                json!({"state":"not_set_up","address":address}),
            ),
        ] {
            assert_eq!(
                response(&root, "127.0.0.1", &origins, current, pending, share).unwrap()["ready_to_pair"],
                false
            );
        }
        crate::local_files::atomic(
            &root.join("network.json"),
            &json!({"bind":"127.0.0.1","access":"local","origins":addresses}),
        )
        .unwrap();
        assert_eq!(
            response(&root, "127.0.0.1", &addresses, "127.0.0.1", false, shared).unwrap()["ready_to_pair"],
            false
        );
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn invalid_saved_public_http_origins_cannot_reach_restart_or_update() {
        let root =
            std::env::temp_dir().join(format!("kindred-invalid-network-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        for value in [
            json!({"bind":"127.0.0.1","origins":["http://8.8.8.8:9444"]}),
            json!({"schema":2,"origins":[],"extra_origins":["http://8.8.8.8:9444"]}),
        ] {
            crate::local_files::atomic(&root.join("network.json"), &value).unwrap();
            assert!(settings(&root).unwrap_err().contains("HTTPS"));
            assert!(!root.join("network.override.yaml").exists());
        }
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn saved_network_survives_reload_and_replacement() {
        let root = std::env::temp_dir().join(format!("kindred-network-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        assert_eq!(saved(&root).unwrap(), "127.0.0.1");
        for bind in ["0.0.0.0", "127.0.0.1"] {
            crate::local_files::atomic(
                &root.join("network.json"),
                &json!({"bind":bind,"origins":["http://100.64.1.2:9444"]}),
            )
            .unwrap();
            assert_eq!(saved(&root).unwrap(), bind);
            assert_eq!(origins(&root).unwrap(), vec!["http://100.64.1.2:9444"]);
        }
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn limit_counts_unique_origins_and_never_discards_extra_addresses() {
        assert_eq!(
            normalize_origins(vec!["http://10.1.2.3:9444".into(); 9]).unwrap(),
            vec!["http://10.1.2.3:9444"]
        );
        assert!(
            normalize_origins((1..=9).map(|n| format!("http://10.1.2.{n}:9444")).collect())
                .unwrap_err()
                .contains("up to 8")
        );
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
