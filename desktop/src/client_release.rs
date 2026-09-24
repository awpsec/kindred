//! Signed GitHub Release packages, with legacy server-feed fallback. No account credentials enter this transport.
use base64::{Engine, engine::general_purpose::STANDARD};
use ring::{digest, signature};
use serde::Deserialize;
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

pub const MAX_PACKAGE: u64 = 512 * 1024 * 1024;
#[derive(Clone, Debug, Deserialize)]
pub struct Package {
    pub size: u64,
    pub sha256: String,
}
#[derive(Clone, Debug, Deserialize)]
pub struct Release {
    #[serde(skip)]
    pub github: bool,
    pub version: String,
    pub channel: String,
    pub platforms: BTreeMap<String, Package>,
}
pub fn platform() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("linux", "x86_64") => "linux-x86_64",
        ("macos", "aarch64") => "macos-aarch64",
        ("macos", "x86_64") => "macos-x86_64",
        _ => "unsupported",
    }
}
pub fn version(v: &str) -> Option<[u32; 3]> {
    let parts: Vec<_> = v.split('.').collect();
    if parts.len() != 3
        || parts
            .iter()
            .any(|p| p.is_empty() || p.len() > 5 || !p.bytes().all(|b| b.is_ascii_digit()))
    {
        return None;
    }
    Some([
        parts[0].parse().ok()?,
        parts[1].parse().ok()?,
        parts[2].parse().ok()?,
    ])
}
pub fn filename(target: &str, v: &str) -> Result<String, String> {
    version(v).ok_or("Invalid release version")?;
    let suffix = match target {
        "linux-x86_64" => "AppImage",
        "macos-aarch64" | "macos-x86_64" => "dmg",
        _ => return Err("No client package for this platform".into()),
    };
    Ok(format!("kindred-{target}-{v}.{suffix}"))
}
pub fn verified_payload(bytes: &[u8]) -> Result<Vec<u8>, String> {
    if bytes.len() > 65536 {
        return Err("Update manifest is too large".into());
    }
    let envelope: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|_| "Invalid update manifest")?;
    let decode = |s: Option<&str>| {
        STANDARD
            .decode(s.ok_or("Unsigned update manifest")?)
            .map_err(|_| "Invalid update signature".to_string())
    };
    let payload = decode(envelope["payload"].as_str())?;
    let signed = decode(envelope["signature"].as_str())?;
    let xml = include_str!("../update-public-key.xml");
    let component = |name: &str| -> Result<Vec<u8>, String> {
        let value = xml
            .split(&format!("<{name}>"))
            .nth(1)
            .and_then(|s| s.split(&format!("</{name}>")).next());
        decode(value)
    };
    let n = component("Modulus")?;
    let e = component("Exponent")?;
    signature::RsaPublicKeyComponents { n: &n, e: &e }
        .verify(&signature::RSA_PKCS1_2048_8192_SHA256, &payload, &signed)
        .map_err(|_| "The update signature is invalid. Nothing was installed.")?;
    Ok(payload)
}
impl Release {
    pub fn package(&self, target: &str) -> Result<&Package, String> {
        if self.channel != "stable" || version(&self.version).is_none() {
            return Err("Invalid release channel or version".into());
        }
        filename(target, &self.version)?;
        let p = self
            .platforms
            .get(target)
            .ok_or("This server has no signed package for this computer")?;
        if p.size == 0
            || p.size > MAX_PACKAGE
            || p.sha256.len() != 64
            || !p
                .sha256
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
        {
            return Err("Invalid client package size or checksum".into());
        }
        Ok(p)
    }
}
fn github_redirect(url: &tauri::Url) -> bool {
    url.scheme() == "https"
        && url.port_or_known_default() == Some(443)
        && url.username().is_empty()
        && url.password().is_none()
        && matches!(
            url.host_str(),
            Some(
                "github.com"
                    | "release-assets.githubusercontent.com"
                    | "objects.githubusercontent.com"
            )
        )
}
fn github_package_url(target: &str, version: &str) -> Result<tauri::Url, String> {
    filename(target, version)?;
    let label = match target {
        "linux-x86_64" => "Linux-x64.AppImage",
        "macos-aarch64" => "macOS-Apple-Silicon.dmg",
        _ => return Err("Unsupported GitHub update platform".into()),
    };
    format!("https://github.com/awpsec/kindred/releases/download/v{version}/Kindred-{version}-{label}").parse::<tauri::Url>().map_err(|e|e.to_string())
}
fn client(github: bool) -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::custom(move |attempt| {
            if github && attempt.previous().len() < 5 && github_redirect(attempt.url()) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())
}
fn url(origin: &tauri::Url, file: &str) -> Result<tauri::Url, String> {
    crate::profiles::validate_url(origin.as_str())?;
    origin
        .join(&format!("/updates/{file}"))
        .map_err(|e| e.to_string())
}
pub fn check(origin: &tauri::Url) -> Result<Release, String> {
    // Public release checks need no Kindred/GitHub login. A bad signature is a
    // hard failure; an unavailable public feed may use the legacy server feed.
    if let Ok(response) = client(true)?
        .get(
            "https://github.com/awpsec/kindred/releases/latest/download/client-stable.json",
        )
        .timeout(Duration::from_secs(15))
        .send()
    {
        if response.status().is_success() {
            let mut bytes = Vec::new();
            response
                .take(65537)
                .read_to_end(&mut bytes)
                .map_err(|e| e.to_string())?;
            let mut release: Release = serde_json::from_slice(&verified_payload(&bytes)?)
                .map_err(|_| "Invalid signed release metadata")?;
            release.package(platform())?;
            release.github = true;
            return Ok(release);
        }
    }
    let transport = client(false)?;
    let manifest = if platform() == "linux-x86_64" {
        "client-linux.json"
    } else {
        "client-stable.json"
    };
    let mut response = transport
        .get(url(origin, manifest)?)
        .timeout(Duration::from_secs(15))
        .send()
        .map_err(|_| "Could not reach this server's update feed. Retry when connected.")?;
    if manifest == "client-linux.json" && response.status() == reqwest::StatusCode::NOT_FOUND {
        response = transport
            .get(url(origin, "client-stable.json")?)
            .timeout(Duration::from_secs(15))
            .send()
            .map_err(|_| "Could not reach this server's update feed. Retry when connected.")?;
    }
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("This server has not published Mac/Linux client updates yet. Ask its administrator to stage the complete signed release.".into());
    }
    if !response.status().is_success() {
        return Err("The server did not provide an update manifest".into());
    }
    let mut bytes = Vec::new();
    response
        .take(65537)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    let r: Release = serde_json::from_slice(&verified_payload(&bytes)?)
        .map_err(|_| "Invalid signed release metadata")?;
    r.package(platform())?;
    Ok(r)
}
pub fn download(
    origin: &tauri::Url,
    r: &Release,
    path: &Path,
    cancelled: &AtomicBool,
    progress: impl Fn(u64, u64),
) -> Result<(), String> {
    let package = r.package(platform())?;
    let package_url = if r.github {
        github_package_url(platform(), &r.version)?
    } else {
        url(origin, &filename(platform(), &r.version)?)?
    };
    let mut response = client(r.github)?
        .get(package_url)
        .send()
        .map_err(|_| "Client download could not start")?;
    if !response.status().is_success() {
        return Err("The server's client package is unavailable".into());
    }
    if response.content_length().is_some_and(|n| n != package.size) {
        return Err("The downloaded package has an unexpected size".into());
    }
    let mut file = std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    let result = (|| {
        let mut hasher = digest::Context::new(&digest::SHA256);
        let mut total = 0u64;
        let mut buffer = [0u8; 65536];
        loop {
            if cancelled.load(Ordering::Relaxed) {
                return Err("Update cancelled. Your current client was kept.".to_string());
            }
            let n = response
                .read(&mut buffer)
                .map_err(|_| "Client download was interrupted")?;
            if n == 0 {
                break;
            }
            total += n as u64;
            if total > package.size {
                return Err("Client download exceeded its signed size".into());
            }
            file.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
            hasher.update(&buffer[..n]);
            progress(total, package.size);
        }
        let actual = hasher
            .finish()
            .as_ref()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        if total != package.size || actual != package.sha256 {
            return Err(
                "Client download failed checksum verification. Nothing was installed.".into(),
            );
        }
        file.sync_all().map_err(|e| e.to_string())?;
        Ok(())
    })();
    drop(file);
    if result.is_err() {
        let _ = std::fs::remove_file(path);
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paths_and_versions_never_accept_remote_urls_or_traversal() {
        assert!(
            filename("macos-aarch64", "1.2.3")
                .unwrap()
                .ends_with(".dmg")
        );
        for v in [
            "../1.2.3",
            "1.2",
            "1.2.3/../../x",
            "1.2.3?x",
            "1.2.-1",
            "999999.2.3",
        ] {
            assert!(version(v).is_none());
        }
        assert!(filename("../../x", "1.2.3").is_err());
        assert!(version("0.51.0") > version("0.50.0"));
    }
    #[test]
    fn unsigned_or_changed_feed_cannot_authorize_an_install() {
        assert!(verified_payload(br#"{"payload":"e30=","signature":"AA=="}"#).is_err());
        assert!(verified_payload(&vec![b'x'; 65537]).is_err());
    }
    #[test]
    fn released_signature_verifies_and_any_payload_change_is_rejected() {
        let bytes = include_bytes!("fixtures/stable-v0.51.0.json");
        let payload = verified_payload(bytes).unwrap();
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&payload).unwrap()["version"],
            "0.51.0"
        );
        let mut envelope: serde_json::Value = serde_json::from_slice(bytes).unwrap();
        let mut changed = payload.clone();
        changed[0] ^= 1;
        envelope["payload"] = STANDARD.encode(changed).into();
        assert!(verified_payload(&serde_json::to_vec(&envelope).unwrap()).is_err());
    }
    #[test]
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    fn downloads_verify_size_hash_and_cancellation_without_sending_credentials() {
        use std::net::TcpListener;
        let body = b"fixture native package";
        let checksum = digest::digest(&digest::SHA256, body)
            .as_ref()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        for case in [
            "valid",
            "hash",
            "size",
            "truncated",
            "cancelled",
            "redirect",
            "existing",
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let origin =
                tauri::Url::parse(&format!("http://{}", listener.local_addr().unwrap())).unwrap();
            let server = std::thread::spawn(move || {
                let (mut socket, _) = listener.accept().unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut request = Vec::new();
                while !request.ends_with(b"\r\n\r\n") {
                    let mut byte = [0];
                    socket.read_exact(&mut byte).unwrap();
                    request.push(byte[0]);
                }
                let request = String::from_utf8(request).unwrap();
                assert!(request.starts_with(&format!(
                    "GET /updates/{} HTTP/1.1",
                    filename(platform(), "1.2.3").unwrap()
                )));
                assert!(!request.to_lowercase().contains("authorization:"));
                assert!(!request.to_lowercase().contains("cookie:"));
                if case == "redirect" {
                    socket.write_all(b"HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/private\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
                } else {
                    write!(
                        socket,
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    )
                    .unwrap();
                    socket
                        .write_all(if case == "truncated" {
                            &body[..3]
                        } else {
                            body
                        })
                        .unwrap();
                }
            });
            let folder =
                std::env::temp_dir().join(format!("kindred-download-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir(&folder).unwrap();
            let target = folder.join("package");
            if case == "existing" {
                std::fs::write(&target, b"keep me").unwrap();
            }
            let release = Release {
                github: false,
                version: "1.2.3".into(),
                channel: "stable".into(),
                platforms: BTreeMap::from([(
                    platform().into(),
                    Package {
                        size: body.len() as u64 + if case == "size" { 1 } else { 0 },
                        sha256: if case == "hash" {
                            "0".repeat(64)
                        } else {
                            checksum.clone()
                        },
                    },
                )]),
            };
            let result = download(
                &origin,
                &release,
                &target,
                &AtomicBool::new(case == "cancelled"),
                |_, _| {},
            );
            if case == "valid" {
                assert!(result.is_ok(), "{result:?}");
                assert_eq!(std::fs::read(&target).unwrap(), body);
            } else {
                assert!(result.is_err(), "{case}");
                if case == "existing" {
                    assert_eq!(std::fs::read(&target).unwrap(), b"keep me");
                } else {
                    assert!(!target.exists(), "{case}");
                }
            }
            server.join().unwrap();
            std::fs::remove_dir_all(folder).unwrap();
        }
    }
    #[test]
    fn github_transport_is_pinned_and_versioned() {
        assert!(
            github_package_url("linux-x86_64", "1.2.3")
                .unwrap()
                .as_str()
                .ends_with("/v1.2.3/Kindred-1.2.3-Linux-x64.AppImage")
        );
        assert!(
            github_package_url("macos-aarch64", "1.2.3")
                .unwrap()
                .as_str()
                .ends_with("/v1.2.3/Kindred-1.2.3-macOS-Apple-Silicon.dmg")
        );
        assert!(github_package_url("linux-x86_64", "../2.3").is_err());
        for u in [
            "http://github.com/a",
            "https://evil.test/a",
            "https://user@github.com/a",
            "https://github.com:8443/a",
        ] {
            assert!(!github_redirect(&u.parse().unwrap()));
        }
        assert!(github_redirect(
            &"https://release-assets.githubusercontent.com/a"
                .parse()
                .unwrap()
        ));
    }
    #[test]
    fn manifest_cannot_choose_its_transport() {
        let r: Release = serde_json::from_str(
            r#"{"github":true,"version":"1.2.3","channel":"stable","platforms":{}}"#,
        )
        .unwrap();
        assert!(!r.github);
    }
    #[test]
    fn wrong_architecture_and_unbounded_packages_are_rejected() {
        let mut r = Release {
            github: false,
            version: "1.2.3".into(),
            channel: "stable".into(),
            platforms: BTreeMap::from([(
                "macos-aarch64".into(),
                Package {
                    size: 10,
                    sha256: "a".repeat(64),
                },
            )]),
        };
        assert!(r.package("macos-aarch64").is_ok());
        assert!(r.package("macos-x86_64").is_err());
        r.platforms.get_mut("macos-aarch64").unwrap().size = MAX_PACKAGE + 1;
        assert!(r.package("macos-aarch64").is_err());
    }
}
