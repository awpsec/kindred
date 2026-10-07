//! Read the host's interfaces, rather than the Docker VM's interfaces.
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, net::IpAddr};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Interface {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub addresses: Vec<String>,
    pub available: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DiscoveryFailureKind {
    Enumeration,
    Command,
    OutputRead,
    OutputTooLarge,
    OutputInvalid,
}

#[derive(Clone, Debug, Serialize)]
pub struct DiscoveryFailure {
    pub kind: DiscoveryFailureKind,
    pub elapsed_ms: u64,
    pub process: Option<crate::setup_progress::RunFailure>,
    pub output_bytes: Option<u64>,
    pub output_removed: bool,
    pub io_error_kind: Option<String>,
}

impl std::fmt::Display for DiscoveryFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        use crate::setup_progress::RunFailureKind;
        let message = match self.process.as_ref().map(|p| &p.kind) {
            Some(RunFailureKind::Timeout) => {
                "Reading this computer's networks took too long. Try again."
            }
            Some(RunFailureKind::Spawn) => {
                "The system network reader could not start. Check the system network settings."
            }
            Some(RunFailureKind::Nonzero) => {
                "The system network reader failed. Check the system network settings, then try again."
            }
            _ => "Could not read this computer's networks. Check the system network settings.",
        };
        f.write_str(message)
    }
}

fn discovery_failure(kind: DiscoveryFailureKind, start: std::time::Instant) -> DiscoveryFailure {
    DiscoveryFailure {
        kind,
        elapsed_ms: u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
        process: None,
        output_bytes: None,
        output_removed: true,
        io_error_kind: None,
    }
}

#[cfg(unix)]
pub fn discover_with_diagnostics(
    root: &std::path::Path,
) -> Result<Vec<Interface>, DiscoveryFailure> {
    let start = std::time::Instant::now();
    discover(root).map_err(|_| discovery_failure(DiscoveryFailureKind::Enumeration, start))
}

pub fn private_address(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            v.is_private() || (v.octets()[0] == 100 && (64..=127).contains(&v.octets()[1]))
        }
        IpAddr::V6(v) => (v.segments()[0] & 0xff00) == 0xfd00,
    }
}

pub fn private_browser_address(ip: IpAddr) -> bool {
    private_address(ip) || matches!(ip, IpAddr::V6(v) if (v.segments()[0] & 0xfe00) == 0xfc00)
}

pub fn usable_address(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            !v.is_loopback()
                && !v.is_unspecified()
                && !v.is_link_local()
                && !v.is_multicast()
                && v != std::net::Ipv4Addr::BROADCAST
        }
        IpAddr::V6(v) => {
            !v.is_loopback()
                && !v.is_unspecified()
                && !v.is_multicast()
                && (v.segments()[0] & 0xffc0) != 0xfe80
                && v.to_ipv4().is_none()
        }
    }
}

pub fn origin(ip: IpAddr) -> String {
    match ip {
        IpAddr::V4(_) => format!("http://{ip}:9444"),
        IpAddr::V6(_) => format!("http://[{ip}]:9444"),
    }
}

fn kind(id: &str, description: &str) -> (&'static str, &'static str) {
    let value = format!("{id} {description}").to_lowercase();
    if value.contains("tailscale") {
        ("tailnet", "Tailscale")
    } else if value.contains("docker") {
        ("other", "Docker")
    } else if [
        "veth",
        "virbr",
        "vbox",
        "vmnet",
        "vethernet",
        "bridge",
        "br-",
    ]
    .iter()
    .any(|s| value.contains(s))
    {
        ("other", "Virtual machine network")
    } else if id.starts_with("wl")
        || value.contains("wi-fi")
        || value.contains("wireless")
        || value.contains("wifi")
    {
        ("lan", "Wi-Fi")
    } else if id.starts_with("eth") || id.starts_with("en") || value.contains("ethernet") {
        ("lan", "Ethernet")
    } else {
        ("other", "Other")
    }
}

fn finish(raw: BTreeMap<String, Vec<String>>) -> Vec<Interface> {
    let mut result = Vec::new();
    for (id, mut addresses) in raw {
        addresses = addresses
            .into_iter()
            .filter_map(|s| s.parse::<IpAddr>().ok())
            .filter(|ip| !ip.is_loopback() && !ip.is_unspecified())
            .map(|ip| ip.to_string())
            .collect();
        addresses.sort();
        addresses.dedup();
        if id == "lo" || id.to_lowercase().contains("loopback") {
            continue;
        }
        let (kind, name) = kind(&id, "");
        let available = !addresses.is_empty();
        result.push(Interface {
            id,
            name: name.into(),
            kind: kind.into(),
            addresses,
            available,
        });
    }
    result.sort_by_key(|v| (v.kind == "other", v.name.clone(), v.id.clone()));
    result
}

#[cfg(unix)]
pub fn discover(_root: &std::path::Path) -> Result<Vec<Interface>, String> {
    let mut head: *mut libc::ifaddrs = std::ptr::null_mut();
    // getifaddrs owns this list until freeifaddrs. sockaddr family determines
    // the cast; no pointer is retained after the list is freed.
    if unsafe { libc::getifaddrs(&mut head) } != 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    struct List(*mut libc::ifaddrs);
    impl Drop for List {
        fn drop(&mut self) {
            unsafe { libc::freeifaddrs(self.0) };
        }
    }
    let _list = List(head);
    let mut raw: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut up = BTreeMap::new();
    let mut current = head;
    while !current.is_null() {
        let row = unsafe { &*current };
        if !row.ifa_addr.is_null()
            && !row.ifa_name.is_null()
            && row.ifa_flags & libc::IFF_LOOPBACK as u32 == 0
        {
            let name = unsafe { std::ffi::CStr::from_ptr(row.ifa_name) }
                .to_string_lossy()
                .into_owned();
            up.insert(name.clone(), row.ifa_flags & libc::IFF_UP as u32 != 0);
            raw.entry(name.clone()).or_default();
            let family = unsafe { (*row.ifa_addr).sa_family } as i32;
            let ip = if family == libc::AF_INET {
                let v = unsafe { &*(row.ifa_addr as *const libc::sockaddr_in) };
                Some(IpAddr::V4(std::net::Ipv4Addr::from(
                    v.sin_addr.s_addr.to_ne_bytes(),
                )))
            } else if family == libc::AF_INET6 {
                let v = unsafe { &*(row.ifa_addr as *const libc::sockaddr_in6) };
                Some(IpAddr::V6(std::net::Ipv6Addr::from(v.sin6_addr.s6_addr)))
            } else {
                None
            };
            if let Some(ip) = ip {
                raw.entry(name).or_default().push(ip.to_string());
            }
        }
        current = row.ifa_next;
    }
    let mut rows = finish(raw);
    for row in &mut rows {
        row.available &= up.get(&row.id).copied().unwrap_or(false);
    }
    #[cfg(target_os = "macos")]
    {
        let mut command = std::process::Command::new("/usr/sbin/networksetup");
        command.arg("-listallhardwareports");
        for row in &mut rows {
            if row.id.starts_with("en") {
                row.kind = "other".into();
                row.name = "Other".into();
            }
        }
        if let Ok((bytes, _removed)) = read_command(_root, command) {
            for block in String::from_utf8_lossy(&bytes).split("\n\n") {
                let device = block.lines().find_map(|l| l.strip_prefix("Device: "));
                let hardware = block
                    .lines()
                    .find_map(|l| l.strip_prefix("Hardware Port: "));
                if let (Some(device), Some(hardware)) = (device, hardware) {
                    if let Some(row) = rows.iter_mut().find(|r| r.id == device) {
                        let (kind, name) = kind(device, hardware);
                        row.kind = kind.into();
                        row.name = name.into();
                    }
                }
            }
        }
    }
    rows.sort_by_key(|v| (v.kind == "other", v.name.clone(), v.id.clone()));
    Ok(rows)
}

#[cfg(windows)]
pub fn discover(_root: &std::path::Path) -> Result<Vec<Interface>, String> {
    discover_with_diagnostics(_root).map_err(|e| e.to_string())
}

#[cfg(windows)]
pub fn discover_with_diagnostics(
    _root: &std::path::Path,
) -> Result<Vec<Interface>, DiscoveryFailure> {
    let start = std::time::Instant::now();
    let script = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $adapters=@(Get-NetAdapter -IncludeHidden); ConvertTo-Json -Depth 4 -Compress -InputObject @((Get-NetIPAddress | Group-Object InterfaceIndex | ForEach-Object { $index=[int]$_.Name; $a=$adapters|Where-Object { $_.ifIndex -eq $index }|Select-Object -First 1; [pscustomobject]@{id=$_.Group[0].InterfaceAlias; addresses=@($_.Group.IPAddress); description=$a.InterfaceDescription; up=($a.Status -eq 'Up')} }))";
    let mut command = std::process::Command::new("powershell.exe");
    command.args(["-NoProfile", "-NonInteractive", "-Command", script]);
    let (bytes, removed) = read_command(_root, command)?;
    let values = parse_network_output(&bytes, removed, start)?;
    let mut raw = BTreeMap::new();
    for row in &values {
        if let (Some(id), Some(addresses)) = (row["id"].as_str(), row["addresses"].as_array()) {
            raw.insert(
                id.into(),
                addresses
                    .iter()
                    .filter_map(|v| v.as_str().map(str::to_owned))
                    .collect(),
            );
        }
    }
    let mut result = finish(raw);
    for row in &mut result {
        if let Some(value) = values.iter().find(|v| v["id"].as_str() == Some(&row.id)) {
            let (kind, name) = kind(&row.id, value["description"].as_str().unwrap_or(""));
            row.kind = kind.into();
            row.name = name.into();
            row.available &= value["up"] == true;
        }
    }
    Ok(result)
}

#[cfg(any(windows, test))]
fn parse_network_output(
    bytes: &[u8],
    output_removed: bool,
    start: std::time::Instant,
) -> Result<Vec<serde_json::Value>, DiscoveryFailure> {
    serde_json::from_slice(bytes).map_err(|_| {
        let mut failure = discovery_failure(DiscoveryFailureKind::OutputInvalid, start);
        failure.output_bytes = Some(bytes.len() as u64);
        failure.output_removed = output_removed;
        failure
    })
}

#[cfg(any(windows, target_os = "macos", test))]
fn read_command(
    root: &std::path::Path,
    mut command: std::process::Command,
) -> Result<(Vec<u8>, bool), DiscoveryFailure> {
    let start = std::time::Instant::now();
    let output = root.join(format!("network-enumeration-{}.txt", uuid::Uuid::new_v4()));
    crate::profiles::hidden(&mut command);
    let result = crate::setup_progress::run_detailed(
        &mut command,
        &output,
        std::time::Duration::from_secs(10),
        |_| {},
    );
    let metadata = std::fs::metadata(&output);
    let output_bytes = metadata.as_ref().ok().map(|m| m.len());
    let bytes = match result {
        Err(process) => {
            let mut failure = discovery_failure(DiscoveryFailureKind::Command, start);
            failure.process = Some(process);
            Err(failure)
        }
        Ok(_) => match metadata {
            Ok(m) if m.len() <= 262144 => std::fs::read(&output).map_err(|e| {
                let mut failure = discovery_failure(DiscoveryFailureKind::OutputRead, start);
                failure.io_error_kind = Some(format!("{:?}", e.kind()));
                failure
            }),
            Ok(_) => Err(discovery_failure(
                DiscoveryFailureKind::OutputTooLarge,
                start,
            )),
            Err(e) => {
                let mut failure = discovery_failure(DiscoveryFailureKind::OutputRead, start);
                failure.io_error_kind = Some(format!("{:?}", e.kind()));
                Err(failure)
            }
        },
    };
    let removed = match std::fs::remove_file(&output) {
        Ok(()) => true,
        Err(e) => e.kind() == std::io::ErrorKind::NotFound,
    };
    bytes.map(|bytes| (bytes, removed)).map_err(|mut failure| {
        failure.output_bytes = output_bytes;
        failure.output_removed = removed;
        failure
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "linux")]
    #[test]
    fn actual_linux_inventory_and_selected_private_listener() {
        use std::io::{Read, Write};
        let root =
            std::env::temp_dir().join(format!("kindred-host-network-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let rows = discover(&root).unwrap();
        assert!(!rows.iter().any(|r| r.id == "lo"));
        assert!(
            std::fs::read_dir(&root).unwrap().next().is_none(),
            "Discovery must not save settings"
        );
        let row = rows
            .iter()
            .find(|r| {
                r.available
                    && r.addresses.iter().any(|s| {
                        s.parse::<IpAddr>()
                            .is_ok_and(|ip| usable_address(ip) && private_address(ip))
                    })
            })
            .expect("Fixture needs one actual private host interface");
        let ip = row
            .addresses
            .iter()
            .filter_map(|s| s.parse::<IpAddr>().ok())
            .find(|ip| usable_address(*ip) && private_address(*ip))
            .unwrap();
        let mut plan = crate::network_plan::Plan::default();
        plan.select(&[row.id.clone()], false, &rows).unwrap();
        plan.preflight(&rows).unwrap();
        assert!(plan.bindings().unwrap().contains(&ip.to_string()));
        assert!(plan.bindings().unwrap().contains(&"127.0.0.1".into()));
        // A disposable listener on a system-assigned private address and ephemeral
        // port proves the address is bindable. It does not prove Docker forwarding.
        let listener = std::net::TcpListener::bind(std::net::SocketAddr::new(ip, 0)).unwrap();
        let endpoint = listener.local_addr().unwrap();
        let task = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(2)))
                .unwrap();
            let mut value = [0; 7];
            stream.read_exact(&mut value).unwrap();
            assert_eq!(&value, b"fixture");
            stream.write_all(b"observed").unwrap();
        });
        let mut stream =
            std::net::TcpStream::connect_timeout(&endpoint, std::time::Duration::from_secs(2))
                .unwrap();
        stream
            .set_read_timeout(Some(std::time::Duration::from_secs(2)))
            .unwrap();
        stream.write_all(b"fixture").unwrap();
        let mut value = [0; 8];
        stream.read_exact(&mut value).unwrap();
        assert_eq!(&value, b"observed");
        drop(stream);
        task.join().unwrap();
        println!(
            "actual_linux_interfaces={}",
            serde_json::to_string(&rows).unwrap()
        );
        println!("disposable_listener={endpoint}; preserved_loopback=true; saved_files=0");
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn phone_addresses_are_private_exact_and_ipv6_bracketed() {
        for s in [
            "192.168.1.20",
            "172.16.0.3",
            "10.1.2.3",
            "100.64.1.2",
            "fd7a:115c::5",
        ] {
            assert!(private_address(s.parse().unwrap()));
            assert!(usable_address(s.parse().unwrap()));
        }
        assert_eq!(
            origin("fd7a:115c::5".parse().unwrap()),
            "http://[fd7a:115c::5]:9444"
        );
        for s in [
            "127.0.0.1",
            "::1",
            "0.0.0.0",
            "::",
            "169.254.1.2",
            "fe80::5",
            "224.0.0.1",
            "::ffff:192.168.1.2",
        ] {
            assert!(!usable_address(s.parse().unwrap()), "{s}");
        }
        for s in ["8.8.8.8", "100.128.0.1", "2001:4860::1"] {
            assert!(!private_address(s.parse().unwrap()), "{s}");
        }
    }
    #[test]
    fn interfaces_are_grouped_without_exposing_loopback_as_a_choice() {
        let rows = finish(BTreeMap::from([
            (
                "wlp2s0".into(),
                vec!["192.168.1.2".into(), "192.168.1.2".into()],
            ),
            ("docker0".into(), vec!["172.17.0.1".into()]),
            ("lo".into(), vec!["127.0.0.1".into(), "::1".into()]),
        ]));
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].name, "Wi-Fi");
        assert_eq!(rows[0].addresses.len(), 1);
        assert_eq!(rows[1].name, "Docker");
    }
}

#[cfg(all(test, unix))]
mod discovery_diagnostics_regression {
    use super::*;
    #[test]
    fn invalid_json_preserves_the_actual_removal_outcome() {
        for removed in [false, true] {
            let error = parse_network_output(b"invalid-json", removed, std::time::Instant::now())
                .unwrap_err();
            let value = serde_json::to_value(error).unwrap();
            assert_eq!(value["kind"], "output_invalid");
            assert_eq!(value["output_removed"], removed);
            assert_eq!(value["output_bytes"], 12);
        }
        assert!(
            parse_network_output(b"[]", false, std::time::Instant::now())
                .unwrap()
                .is_empty()
        );
    }

    fn root() -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!(
            "kindred-discovery-regression-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir(&p).unwrap();
        p
    }
    #[test]
    fn discovery_diagnostics_nonzero_cause_survives_cleanup() {
        let p = root();
        let mut command = std::process::Command::new("sh");
        command.args(["-c", "printf PRIVATE_FIXTURE_STDERR >&2; exit 17"]);
        let error = read_command(&p, command).unwrap_err();
        let value = serde_json::to_value(&error).unwrap();
        assert!(std::fs::read_dir(&p).unwrap().next().is_none());
        std::fs::remove_dir_all(&p).unwrap();
        assert!(!value.to_string().contains("PRIVATE_FIXTURE_STDERR"));
        assert_eq!(value["kind"], "command");
        assert_eq!(value["process"]["kind"], "nonzero");
        assert_eq!(value["process"]["exit_code"], 17);
        assert!(value["elapsed_ms"].as_u64().unwrap() < 10000);
        assert_eq!(value["output_removed"], true);
    }
    #[test]
    fn discovery_diagnostics_spawn_cause_survives_cleanup() {
        let p = root();
        let command = std::process::Command::new(p.join("missing-owned-fixture"));
        let error = read_command(&p, command).unwrap_err();
        let value = serde_json::to_value(&error).unwrap();
        assert!(std::fs::read_dir(&p).unwrap().next().is_none());
        std::fs::remove_dir_all(&p).unwrap();
        assert_eq!(value["kind"], "command");
        assert_eq!(value["process"]["kind"], "spawn");
        assert!(value["elapsed_ms"].as_u64().unwrap() < 10000);
        assert_eq!(value["output_removed"], true);
    }
    #[test]
    fn discovery_diagnostics_actual_ten_second_timeout_cleans_output() {
        let p = root();
        let mut command = std::process::Command::new("sh");
        command.args(["-c", "exec sleep 30"]);
        let error = read_command(&p, command).unwrap_err();
        let value = serde_json::to_value(&error).unwrap();
        assert_eq!(value["kind"], "command");
        assert_eq!(value["process"]["kind"], "timeout");
        assert!((10000..13000).contains(&value["elapsed_ms"].as_u64().unwrap()));
        assert_eq!(value["process"]["cleanup"]["reaped"], true);
        assert_eq!(value["output_removed"], true);
        assert!(std::fs::read_dir(&p).unwrap().next().is_none());
        std::fs::remove_dir_all(&p).unwrap();
    }
    #[test]
    fn discovery_diagnostics_output_cap_and_success_preserve_cleanup() {
        let p = root();
        let mut command = std::process::Command::new("sh");
        command.args(["-c", "head -c 262145 /dev/zero"]);
        let value = serde_json::to_value(read_command(&p, command).unwrap_err()).unwrap();
        assert_eq!(value["kind"], "output_too_large");
        assert_eq!(value["output_bytes"], 262145);
        assert_eq!(value["output_removed"], true);
        let mut command = std::process::Command::new("sh");
        command.args(["-c", "printf fixture-success"]);
        assert_eq!(
            read_command(&p, command).unwrap(),
            (b"fixture-success".to_vec(), true)
        );
        assert!(std::fs::read_dir(&p).unwrap().next().is_none());
        std::fs::remove_dir_all(&p).unwrap();
    }
}
