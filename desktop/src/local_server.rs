//! Observe the running managed server version, with a legacy UI fallback.
use std::{io::Read, time::Duration};
pub const ORIGIN: &str = "http://127.0.0.1:9444";

pub fn is_origin(address: &str) -> bool {
    tauri::Url::parse(address).is_ok_and(|url| {
        url.scheme() == "http"
            && url.port() == Some(9444)
            && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
    })
}

pub fn local_admin_allowed(label:&str,url:&tauri::Url,installed:bool)->bool {
    label=="main" && installed && is_origin(url.as_str()) && url.path()=="/" && url.username().is_empty() && url.password().is_none()
}

fn numbers(version: &str) -> Option<[u32; 3]> {
    let mut result = [0; 3];
    let parts: Vec<_> = version.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    for (part, output) in parts.into_iter().zip(result.iter_mut()) {
        if part.is_empty() || part.len() > 5 || !part.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        *output = part.parse().ok()?;
    }
    Some(result)
}
pub fn newer(candidate: &str, installed: &str) -> bool {
    matches!((numbers(candidate), numbers(installed)), (Some(a), Some(b)) if a > b)
}
fn parse_ui_version(source: &str) -> Option<String> {
    let value = source
        .split_once("const UI_VERSION")?
        .1
        .trim_start()
        .strip_prefix('=')?
        .trim_start();
    let quote = value.chars().next()?;
    if quote != '\'' && quote != '"' {
        return None;
    }
    let version = value[1..].split_once(quote)?.0;
    numbers(version)?;
    Some(version.to_owned())
}
fn version_at(origin: &str) -> Option<String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(3))
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .build()
        .ok()?;
    // Identity metadata reports the executable version. A stale UI_VERSION
    // constant must not cause a successful Docker upgrade to fail readiness.
    if let Some(bytes) = read_prefix(&client, &format!("{origin}/identity/meta")) {
        if let Ok(meta) = serde_json::from_slice::<serde_json::Value>(&bytes) {
            if let Some(version) = meta["version"].as_str().filter(|v| numbers(v).is_some()) {
                return Some(version.to_owned());
            }
        }
    }
    // Older servers did not expose a version in identity metadata.
    let bytes = read_prefix(&client, &format!("{origin}/app.js"))?;
    parse_ui_version(&String::from_utf8_lossy(&bytes))
}
fn read_prefix(client: &reqwest::blocking::Client, url: &str) -> Option<Vec<u8>> {
    let response = client
        .get(url)
        .header("Cache-Control", "no-cache")
        .send()
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    // Neither endpoint needs credentials, redirects or unbounded response reads.
    let mut bytes = Vec::new();
    response.take(8192).read_to_end(&mut bytes).ok()?;
    Some(bytes)
}
pub fn version() -> Option<String> {
    version_at(ORIGIN)
}
fn connection_access_at(origin: &str) -> bool {
    let Ok(client)=reqwest::blocking::Client::builder().timeout(Duration::from_secs(3)).redirect(reqwest::redirect::Policy::none()).no_proxy().build() else {return false;};
    let Some(bytes)=read_prefix(&client,&format!("{origin}/identity/meta")) else {return false;};
    let Ok(meta)=serde_json::from_slice::<serde_json::Value>(&bytes) else {return false;};
    meta["connection_access"]==true && meta["version"].as_str()==Some(env!("CARGO_PKG_VERSION"))
}
pub fn connection_access_available() -> bool { connection_access_at(ORIGIN) }


#[cfg(test)]
mod tests {
    use super::*;
    use std::{io::Write, net::TcpListener};
    #[test]
    fn local_management_requires_the_installed_main_loopback_workspace() {
        for address in ["http://127.0.0.1:9444/","http://localhost:9444/","http://[::1]:9444/"]{let url=tauri::Url::parse(address).unwrap();assert!(local_admin_allowed("main",&url,true));assert!(!local_admin_allowed("profile-home",&url,true));assert!(!local_admin_allowed("main",&url,false));}
        for address in ["https://computer.tailnet.ts.net/","http://127.0.0.1:9445/","http://localhost:9444/admin","http://user@localhost:9444/"]{assert!(!local_admin_allowed("main",&tauri::Url::parse(address).unwrap(),true));}
    }
    #[test]
    fn only_the_managed_loopback_origin_is_blocked_during_setup() {
        for origin in [ORIGIN, "http://localhost:9444", "http://[::1]:9444"] {
            assert!(is_origin(origin));
        }
        for origin in [
            "https://server:9444",
            "http://localhost:9445",
            "http://127.0.0.1.example:9444",
        ] {
            assert!(!is_origin(origin));
        }
    }
    #[test]
    fn ui_version_is_explicit_and_numeric() {
        assert_eq!(
            parse_ui_version("import x;\nconst UI_VERSION = \"0.48.34\";\n"),
            Some("0.48.34".into())
        );
        assert_eq!(
            parse_ui_version("const UI_VERSION='0.48.35';"),
            Some("0.48.35".into())
        );
        for bad in [
            "version: 0.48.34",
            "const UI_VERSION='0.48.35-beta';",
            "const UI_VERSION='bad';",
        ] {
            assert_eq!(parse_ui_version(bad), None);
        }
        assert!(newer("0.48.35", "0.48.34"));
        assert!(newer("0.49.0", "0.48.99"));
        assert!(!newer("0.48.35", "0.48.35"));
        assert!(!newer("0.48.35", "0.49.0"));
        assert!(!newer("0.48.35", "unknown"));
    }
    #[test]
    fn reads_actual_server_and_rejects_redirects() {
        for (status, body, expected) in [
            (
                "200 OK",
                "const UI_VERSION = \"0.48.34\";",
                Some("0.48.34".into()),
            ),
            ("302 Found", "const UI_VERSION = \"0.48.35\";", None),
            ("503 Unavailable", "const UI_VERSION = \"0.48.35\";", None),
        ] {
            let server = TcpListener::bind("127.0.0.1:0").unwrap();
            let origin = format!("http://{}", server.local_addr().unwrap());
            let worker = std::thread::spawn(move || {
                let (mut metadata, _) = server.accept().unwrap();
                let mut request = [0u8; 4096];
                let n = metadata.read(&mut request).unwrap();
                assert!(String::from_utf8_lossy(&request[..n]).starts_with("GET /identity/meta "));
                write!(
                    metadata,
                    "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                )
                .unwrap();
                drop(metadata);
                let (mut socket, _) = server.accept().unwrap();
                let mut request = [0u8; 4096];
                let n = socket.read(&mut request).unwrap();
                let request = String::from_utf8_lossy(&request[..n]);
                assert!(request.starts_with("GET /app.js "));
                assert!(!request.to_ascii_lowercase().contains("authorization:"));
                write!(socket, "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\nLocation: https://example.invalid/\r\n\r\n{body}",body.len()).unwrap();
            });
            assert_eq!(version_at(&origin), expected);
            worker.join().unwrap();
        }
    }
    #[test]
    fn actual_server_version_wins_without_fetching_stale_ui() {
        let server = TcpListener::bind("127.0.0.1:0").unwrap();
        let origin = format!("http://{}", server.local_addr().unwrap());
        let worker = std::thread::spawn(move || {
            let (mut socket, _) = server.accept().unwrap();
            let mut request = [0u8; 4096];
            let n = socket.read(&mut request).unwrap();
            let request = String::from_utf8_lossy(&request[..n]);
            assert!(request.starts_with("GET /identity/meta "));
            assert!(!request.to_ascii_lowercase().contains("authorization:"));
            let body = r#"{"profiles":true,"version":"0.53.0"}"#;
            write!(
                socket,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
            .unwrap();
        });
        assert_eq!(version_at(&origin), Some("0.53.0".into()));
        worker.join().unwrap();
    }
}

pub fn connection_policy_matches(origins: &[String], confirmed: &[String]) -> bool { connection_policy_matches_at(ORIGIN,origins,confirmed) }
fn connection_policy_matches_at(origin: &str, origins: &[String], confirmed: &[String]) -> bool {
    let Ok(client)=reqwest::blocking::Client::builder().timeout(Duration::from_secs(3)).redirect(reqwest::redirect::Policy::none()).no_proxy().build() else {return false;};
    let Some(bytes)=read_prefix(&client,&format!("{origin}/identity/meta")) else {return false;};
    let Ok(meta)=serde_json::from_slice::<serde_json::Value>(&bytes) else {return false;};
    let bytes=serde_json::to_vec(&(origins,confirmed)).unwrap();
    let digest=ring::digest::digest(&ring::digest::SHA256,&bytes).as_ref().iter().map(|b|format!("{b:02x}")).collect::<String>();
    meta["connection_access"]==true && meta["version"].as_str()==Some(env!("CARGO_PKG_VERSION")) && meta["connection_policy_digest"].as_str()==Some(digest.as_str())
}

#[cfg(test)]
mod connection_access_tests {
 use super::*;
 use std::{io::Write,net::TcpListener};
 fn served(body:String,status:&str,check:impl FnOnce(&str)) {
  let listener=TcpListener::bind("127.0.0.1:0").unwrap();let origin=format!("http://{}",listener.local_addr().unwrap());let status=status.to_owned();
  let worker=std::thread::spawn(move || {let(mut socket,_)=listener.accept().unwrap();let mut bytes=[0;4096];let n=socket.read(&mut bytes).unwrap();let req=String::from_utf8_lossy(&bytes[..n]);assert!(req.starts_with("GET /identity/meta "));assert!(!req.to_ascii_lowercase().contains("authorization:"));write!(socket,"HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\nLocation: https://example.invalid/\r\n\r\n{body}",body.len()).unwrap();});check(&origin);worker.join().unwrap();
 }
 #[test] fn connection_access_requires_actual_supported_metadata_without_redirects() {
  for (meta,status,expected) in [(serde_json::json!({"version":env!("CARGO_PKG_VERSION"),"connection_access":true}),"200 OK",true),(serde_json::json!({"version":"0.85.7","connection_access":true}),"200 OK",false),(serde_json::json!({"version":env!("CARGO_PKG_VERSION")}),"200 OK",false),(serde_json::json!({"version":env!("CARGO_PKG_VERSION"),"connection_access":true}),"302 Found",false)] {served(meta.to_string(),status,|origin|assert_eq!(connection_access_at(origin),expected));}
 }
 #[test] fn connection_access_policy_receipt_must_match_the_applied_exact_origins() {
  let origins=vec!["http://203.0.113.7:9444".to_owned()];let confirmed=origins.clone();let bytes=serde_json::to_vec(&(&origins,&confirmed)).unwrap();let hash=ring::digest::digest(&ring::digest::SHA256,&bytes).as_ref().iter().map(|b|format!("{b:02x}")).collect::<String>();
  served(serde_json::json!({"connection_access":true,"version":env!("CARGO_PKG_VERSION"),"connection_policy_digest":hash}).to_string(),"200 OK",|origin|assert!(connection_policy_matches_at(origin,&origins,&confirmed)));
  for body in [serde_json::json!({"connection_access":true,"version":env!("CARGO_PKG_VERSION"),"connection_policy_digest":"old-policy"}),serde_json::json!({"connection_access":true,"version":"0.85.7","connection_policy_digest":hash}),serde_json::json!({"allowed_origins":origins,"confirmed_http_origins":confirmed})] {served(body.to_string(),"200 OK",|origin|assert!(!connection_policy_matches_at(origin,&origins,&confirmed)));}
 }
}
