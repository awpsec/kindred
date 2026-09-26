//! Bundled onboarding owns server changes. Remote pages can only remember their
//! own verified session or open this local window; they cannot retrieve secrets.
use crate::{desktop::Desktop, local_files};
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::Manager;
type Result<T> = std::result::Result<T, String>;

#[derive(Default)]
pub struct Host {
    pub setup: Mutex<Value>,
    pub entries: Mutex<Value>,
    pub intent: Mutex<Value>,
}
pub fn hardware_acceleration() -> bool {
    static ACTIVE: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *ACTIVE.get_or_init(|| {
        load()
            .ok()
            .is_none_or(|v| v["hardware_acceleration"] != false)
    })
}

#[tauri::command]
pub fn set_hardware_acceleration(
    window: crate::surface::Surface,
    host: tauri::State<'_, Host>,
    enabled: bool,
) -> Result<Value> {
    profile_surface(&window)?;
    if !cfg!(windows) {
        return Err("The hardware acceleration switch currently requires the Windows app".into());
    }
    let mut directory = host.entries.lock().map_err(error)?;
    if directory.is_null() {
        *directory = load()?;
    }
    directory["hardware_acceleration"] = json!(enabled);
    save(&directory)?;
    Ok(json!({"enabled":enabled,"restart_required":enabled != hardware_acceleration()}))
}
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn root() -> Result<PathBuf> {
    local_files::install_root()
}
fn path() -> Result<PathBuf> {
    Ok(root()?.join("profiles.json"))
}
pub(crate) fn key(origin: &str, profile: &str) -> String {
    ring::digest::digest(
        &ring::digest::SHA256,
        format!("{origin}\n{profile}").as_bytes(),
    )
    .as_ref()
    .iter()
    .map(|b| format!("{b:02x}"))
    .collect()
}
pub fn profile_id() -> String {
    std::env::var("KINDRED_PROFILE_ID").unwrap_or_default()
}
pub fn scope() -> String {
    std::env::var("KINDRED_PROFILE_SCOPE")
        .ok()
        .filter(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()))
        .unwrap_or_else(|| "unassigned".into())
}
pub fn data_root() -> Result<PathBuf> {
    let scope = scope();
    if std::env::var("KINDRED_LEGACY_LOCAL_ACCESS").as_deref() == Ok("1") {
        return root();
    }
    let p = root()?.join("profiles").join(scope);
    std::fs::create_dir_all(&p).map_err(error)?;
    Ok(p)
}
fn load() -> Result<Value> {
    let path = path()?;
    if !path.exists() {
        return Ok(json!({"entries":[],"last":"","launch_on_startup":false}));
    }
    let bytes = std::fs::read(path).map_err(error)?;
    if bytes.len() > 1024 * 1024 {
        return Err("Profile directory is too large".into());
    }
    let mut value: Value = serde_json::from_slice(&bytes).map_err(error)?;
    if value["entries"].as_array().is_none_or(|v| v.len() > 128) {
        return Err("Invalid profile directory".into());
    }
    for entry in value["entries"].as_array_mut().unwrap() {
        if let Some(protected) = entry["protected_token"].as_str() {
            entry["token"] = json!(unprotect(protected).unwrap_or_default());
        }
        entry
            .as_object_mut()
            .ok_or("Invalid profile entry")?
            .remove("protected_token");
    }
    Ok(value)
}
#[cfg(windows)]
fn crypt(bytes: &[u8], encrypt: bool) -> Result<Vec<u8>> {
    use windows_sys::Win32::{Foundation::LocalFree, Security::Cryptography::*};
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    let ok = unsafe {
        if encrypt {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        }
    };
    if ok == 0 {
        return Err(error(std::io::Error::last_os_error()));
    }
    let result =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        LocalFree(output.pbData as _);
    }
    Ok(result)
}
fn unprotect(value: &str) -> Result<String> {
    #[cfg(windows)]
    {
        if value.len() % 2 != 0 {
            return Err("Invalid protected session".into());
        }
        let bytes = (0..value.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&value[i..i + 2], 16).map_err(error))
            .collect::<Result<Vec<_>>>()?;
        String::from_utf8(crypt(&bytes, false)?).map_err(error)
    }
    #[cfg(not(windows))]
    {
        let _ = value;
        Err("This session belongs to a different operating system. Sign in again.".into())
    }
}
fn save(value: &Value) -> Result<()> {
    #[cfg(windows)]
    {
        let mut protected = value.clone();
        for entry in protected["entries"]
            .as_array_mut()
            .ok_or("Invalid directory")?
        {
            let token = entry["token"].as_str().unwrap_or("");
            if !token.is_empty() {
                entry["protected_token"] = json!(
                    crypt(token.as_bytes(), true)?
                        .iter()
                        .map(|b| format!("{b:02x}"))
                        .collect::<String>()
                );
            }
            entry
                .as_object_mut()
                .ok_or("Invalid entry")?
                .remove("token");
        }
        local_files::atomic(&path()?, &protected)
    }
    #[cfg(not(windows))]
    {
        local_files::atomic(&path()?, value)
    }
}
fn profile_surface(window: &crate::surface::Surface) -> Result<()> {
    if native(window).is_ok() {
        return Ok(());
    }
    crate::desktop::trusted(window, &window.state::<Desktop>())
}
pub fn initial() -> Result<Option<Value>> {
    if std::env::args().any(|s| s == "--profiles") {
        return Ok(None);
    }
    let value = load()?;
    Ok(value["entries"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["key"] == value["last"])
        .cloned())
}
pub fn update_handoff(app: &tauri::AppHandle) -> Result<Option<crate::session_handoff::Handoff>> {
    let desktop = app.state::<Desktop>();
    let token = desktop.session_token();
    let profile_id = profile_id();
    if token.is_empty() || !(profile_id == "legacy" || uuid::Uuid::parse_str(&profile_id).is_ok()) {
        return Ok(None);
    }
    let server = desktop.origin.origin().ascii_serialization();
    let host = app.state::<Host>();
    let mut directory = host.entries.lock().map_err(error)?;
    if directory.is_null() {
        *directory = load()?;
    }
    let remember = directory["entries"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["key"] == key(&server, &profile_id))
        .is_some_and(|e| e["token"].as_str().is_some_and(|t| !t.is_empty()));
    Ok(Some(crate::session_handoff::Handoff {
        server,
        profile_id,
        token,
        remember,
        expires: crate::session_handoff::now() + 900,
    }))
}
pub fn validate_url(address: &str) -> Result<tauri::Url> {
    let u = address.trim().parse::<tauri::Url>().map_err(error)?;
    if !u.username().is_empty()
        || u.password().is_some()
        || u.query().is_some()
        || u.fragment().is_some()
        || u.path() != "/"
        || !(u.scheme() == "https"
            || (u.scheme() == "http"
                && matches!(u.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))))
    {
        return Err("Enter an HTTPS server address, or HTTP on localhost.".into());
    }
    Ok(u)
}
fn native(window: &crate::surface::Surface) -> Result<()> {
    let url = window.url().map_err(error)?;
    if matches!(window.label(), "profile-home" | "profile-home-settings")
        && url.path() == "/profile-home.html"
        && (url.scheme() == "tauri"
            || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost")))
    {
        Ok(())
    } else {
        Err("Only the bundled profile window can change servers".into())
    }
}
pub fn needs_local_start(url: &tauri::Url) -> bool {
    if url.origin().ascii_serialization() != "http://127.0.0.1:9444"
        || !root().is_ok_and(|p| p.join("standalone").is_dir())
    {
        return false;
    }
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(3))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .ok()
        .and_then(|c| c.get("http://127.0.0.1:9444/health").send().ok())
        .is_none_or(|r| !r.status().is_success())
}
pub fn show(app: &tauri::AppHandle) -> Result<()> { show_context(app, None) }
fn show_context(app: &tauri::AppHandle, context: Option<(&crate::surface::Surface, &str, &str)>) -> Result<()> {
    let prepare = |home: &tauri::WebviewWindow| -> Result<()> {
        if let Some((parent, theme, section)) = context {
            home.set_skip_taskbar(true).map_err(error)?;
            home.set_title(if section=="standalone"{"Kindred · Local server"}else{"Kindred · Accounts"}).map_err(error)?;
            let origin=parent.outer_position().map_err(error)?;let size=parent.outer_size().map_err(error)?;let child=home.outer_size().map_err(error)?;
            home.set_position(tauri::PhysicalPosition::new(origin.x+(size.width as i32-child.width as i32)/2,origin.y+(size.height as i32-child.height as i32)/2)).map_err(error)?;
            home.eval(&format!("window.dispatchEvent(new CustomEvent('kindred-account-context',{{detail:{}}}))",json!({"theme":theme,"section":section}))).map_err(error)?;
        } else {
            home.eval("window.dispatchEvent(new CustomEvent('kindred-account-context',{detail:{section:'setup'}}))").map_err(error)?;
        }
        Ok(())
    };
    if let Some(window) = app.get_webview_window("profile-home") {
        prepare(&window)?;
        window.show().map_err(error)?;
        window.set_focus().map_err(error)?;
        window
            .eval("window.dispatchEvent(new Event('kindred-dialog-refresh'))")
            .map_err(error)?;
        return Ok(());
    }
    let builder = tauri::WebviewWindowBuilder::new(
        app,
        "profile-home",
        tauri::WebviewUrl::App(context.map(|(_,theme,section)|format!("profile-home.html?theme={theme}&section={section}")).unwrap_or_else(||"profile-home.html".into()).into()),
    )
    .title("Kindred · Accounts")
    .visible(false)
    .skip_taskbar(context.is_some())
    .decorations(cfg!(target_os = "macos"))
    .initialization_script(if cfg!(target_os = "macos") {
        "window.__KINDRED_NATIVE_FRAME=true;"
    } else {
        ""
    })
    .inner_size(560.0, 620.0)
    .min_inner_size(420.0, 480.0)
    .center()
    .on_navigation(|u| {
        u.scheme() == "tauri" || (u.scheme() == "http" && u.host_str() == Some("tauri.localhost"))
    })
    .on_new_window(|u, _| {
        if u.scheme() == "https" && u.username().is_empty() && u.password().is_none() {
            let _ = open::that_detached(u.as_str());
        }
        tauri::webview::NewWindowResponse::Deny
    })
    ;
    let builder=if context.is_some(){if let Some(parent)=app.get_webview_window("main"){builder.parent(&parent).map_err(error)?}else{builder}}else{builder};
    let window=builder.build().map_err(error)?;
    if context.is_none(){crate::window_state::restore(&window);}
    prepare(&window)?;
    window.show().map_err(error)?;
    Ok(())
}
#[tauri::command]
pub async fn open_profile_home(
    window: crate::surface::Surface,
    state: tauri::State<'_, Desktop>,
    bounds: Option<crate::local_access::PermissionBounds>,
    theme: Option<String>,
    section: Option<String>,
) -> Result<()> {
    crate::desktop::trusted(&window, &state)?;
    *window.state::<Host>().intent.lock().map_err(error)? = Value::Null;
    #[cfg(target_os = "linux")]
    let bounds = {
        let _ = bounds;
        None
    };
    if let Some(bounds) = bounds {
        let (position, size) = account_bounds(&window, &bounds)?;
        if let Some(view) = window.app_handle().get_webview("profile-home-settings") {
            view.close().map_err(error)?;
        }
        let theme = if theme.as_deref() == Some("light") {
            "light"
        } else {
            "dark"
        };
        let builder = tauri::webview::WebviewBuilder::new(
            "profile-home-settings",
            tauri::WebviewUrl::App(format!("profile-home.html?embedded=1&theme={theme}").into()),
        )
        .on_navigation(|u| {
            u.path() == "/profile-home.html"
                && (u.scheme() == "tauri"
                    || (u.scheme() == "http" && u.host_str() == Some("tauri.localhost")))
        });
        window.add_child(builder, position, size).map_err(error)?;
        return Ok(());
    }
    let theme=if theme.as_deref()==Some("light"){"light"}else{"dark"};
    let section=if section.as_deref()==Some("standalone"){
        if window.url().map_err(error)?.origin().ascii_serialization()!="http://127.0.0.1:9444"{return Err("Local server administration is only available on this device's standalone account".into());}
        "standalone"
    }else{"accounts"};
    show_context(window.app_handle(),Some((&window,theme,section)))
}
fn account_bounds(
    window: &crate::surface::Surface,
    bounds: &crate::local_access::PermissionBounds,
) -> Result<(tauri::PhysicalPosition<i32>, tauri::PhysicalSize<u32>)> {
    crate::local_access::validate_bounds(bounds, window.inner_size().map_err(error)?)?;
    Ok((
        tauri::PhysicalPosition::new(bounds.x.round() as i32, bounds.y.round() as i32),
        tauri::PhysicalSize::new(bounds.width.round() as u32, bounds.height.round() as u32),
    ))
}
#[tauri::command]
pub async fn position_profile_home(
    window: crate::surface::Surface,
    state: tauri::State<'_, Desktop>,
    bounds: Option<crate::local_access::PermissionBounds>,
    section: Option<String>,
) -> Result<()> {
    crate::desktop::trusted(&window, &state)?;
    let script = match section.as_deref() {
        None | Some("accounts") => {
            "window.dispatchEvent(new CustomEvent('kindred-account-section',{detail:'accounts'}))"
        }
        Some("standalone") => {
            "window.dispatchEvent(new CustomEvent('kindred-account-section',{detail:'standalone'}))"
        }
        _ => return Err("Unknown account settings page".into()),
    };
    if let Some(bounds) = bounds {
        let (position, size) = account_bounds(&window, &bounds)?;
        if let Some(view) = window.app_handle().get_webview("profile-home-settings") {
            view.set_bounds(tauri::Rect {
                position: position.into(),
                size: size.into(),
            })
            .map_err(error)?;
            view.eval(script).map_err(error)?;
        }
    } else if let Some(view) = window.app_handle().get_webview("profile-home-settings") {
        view.close().map_err(error)?;
    }
    Ok(())
}
#[tauri::command]
pub fn close_profile_home(window: crate::surface::Surface) -> Result<()> {
    native(&window)?;
    if window.label() != "profile-home-settings" {
        return Err("Use the embedded account settings view".into());
    }
    if let Some(main) = window.app_handle().get_webview("main") {
        main.eval("document.getElementById('account-manager-dialog')?.close()")
            .map_err(error)?;
    }
    Ok(())
}
fn hidden(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let _ = command;
}
fn restart(app: &tauri::AppHandle, url: &str, token: &str, profile: &str) -> Result<()> {
    let mut command = Command::new(std::env::current_exe().map_err(error)?);
    command
        .arg(url)
        .env("KINDRED_PROFILE_ID", profile)
        .env_remove("KINDRED_ACCESS_TOKEN")
        .env_remove("KINDRED_LEGACY_LOCAL_ACCESS")
        .env("KINDRED_PROFILE_SCOPE", key(url, profile));
    if !token.is_empty() {
        command.env("KINDRED_ACCESS_TOKEN", token);
    }
    if profile == "legacy" {
        command.env("KINDRED_LEGACY_LOCAL_ACCESS", "1");
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hidden(&mut command);
    crate::local_access::cancel_for_profile_change(app)?;
    crate::window_state::flush(app);
    command.spawn().map_err(error)?;
    app.exit(0);
    Ok(())
}
#[tauri::command]
pub async fn remember_profile(
    window: crate::surface::Surface,
    state: tauri::State<'_, Desktop>,
    host: tauri::State<'_, Host>,
    token: String,
    profile_id: String,
    name: String,
    remember: bool,
    theme: Option<String>,
) -> Result<()> {
    crate::desktop::trusted(&window, &state)?;
    if token.len() > 256
        || name.len() > 80
        || !(profile_id == "legacy" || uuid::Uuid::parse_str(&profile_id).is_ok())
    {
        return Err("Invalid profile".into());
    }
    let origin = state.origin.origin().ascii_serialization();
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(error)?
        .get(format!("{origin}/identity/profiles"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(error)?;
    if !response.status().is_success() {
        return Err("Sign in before remembering this profile".into());
    }
    let verified: Value = response.json().await.map_err(error)?;
    if verified["active"] != profile_id {
        return Err("The session belongs to a different profile".into());
    }
    let name = verified["profiles"]
        .as_array()
        .and_then(|items| items.iter().find(|p| p["id"] == profile_id))
        .and_then(|p| p["name"].as_str())
        .unwrap_or(&name)
        .to_owned();
    let id = key(&origin, &profile_id);
    {
        let mut directory = host.entries.lock().map_err(error)?;
        if directory.is_null() {
            *directory = load()?;
        }
        let entries = directory["entries"]
            .as_array_mut()
            .ok_or("Invalid profile directory")?;
        if entries.len() >= 128 && !entries.iter().any(|p| p["key"] == id) {
            return Err("At most 128 profiles can be remembered".into());
        }
        // A rotated server session supersedes previous tokens for this account on
        // this device. Other profile entries are navigational bookmarks and use
        // this current session to ask the server to switch when selected.
        let account = verified["account_id"].as_str().unwrap_or("");
        for entry in entries
            .iter_mut()
            .filter(|e| e["server"] == origin && e["account"] == account)
        {
            entry["token"] = json!(if remember { &token } else { "" });
        }
        let username = verified["username"].as_str().unwrap_or("");
        let entry = json!({"key":id,"server":origin,"profile_id":profile_id,"name":name,"username":username,"account":account,"token":if remember{&token}else{""},"legacy":profile_id=="legacy"});
        if let Some(old) = entries.iter_mut().find(|e| e["key"] == id) {
            *old = entry;
        } else {
            entries.push(entry);
        }
        for profile in verified["profiles"]
            .as_array()
            .ok_or("Invalid server profiles")?
        {
            let pid = profile["id"].as_str().ok_or("Invalid profile")?;
            let k = key(&origin, pid);
            if let Some(entry) = entries.iter_mut().find(|e| e["key"] == k) {
                entry["name"] = profile["name"].clone();
                entry["username"] = json!(username);
            }
            if !entries.iter().any(|e| e["key"] == k) && entries.len() < 128 {
                entries.push(json!({"key":k,"server":origin,"profile_id":pid,"name":profile["name"],"username":username,"account":account,"token":if remember{&token}else{""},"legacy":pid=="legacy"}));
            }
        }
        if directory["pending_profile"]["server"] == origin {
            directory.as_object_mut().unwrap().remove("pending_profile");
        }
        if let Some(theme) = theme.filter(|t| matches!(t.as_str(), "dark" | "light")) {
            directory["theme"] = json!(theme);
        }
        directory["last"] = json!(id);
        save(&directory)?;
    }
    let actual = scope();
    if actual != id {
        restart(window.app_handle(), &origin, &token, &profile_id)?;
    }
    Ok(())
}
#[tauri::command]
pub fn profile_home_state(
    window: crate::surface::Surface,
    host: tauri::State<'_, Host>,
) -> Result<Value> {
    profile_surface(&window)?;
    let mut directory = host.entries.lock().map_err(error)?;
    if directory.is_null() {
        *directory = load()?;
    }
    let mut public = directory.clone();
    for entry in public["entries"].as_array_mut().unwrap() {
        entry["session_available"] = json!(entry["token"].as_str().is_some_and(|t| !t.is_empty()));
        entry.as_object_mut().unwrap().remove("token");
        entry["account_key"] = json!(key(
            entry["server"].as_str().unwrap_or(""),
            entry["account"]
                .as_str()
                .or_else(|| entry["profile_id"].as_str())
                .unwrap_or("")
        ));
        entry.as_object_mut().unwrap().remove("account");
        entry.as_object_mut().unwrap().remove("protected_token");
    }
    public["platform"] = json!(std::env::consts::OS);
    public["linux_client_updates"] = json!(cfg!(target_os = "linux"));
    public["version"] = json!(env!("CARGO_PKG_VERSION"));
    public["hardware_acceleration"] = json!(directory["hardware_acceleration"] != false);
    public["hardware_acceleration_supported"] = json!(cfg!(windows));
    public["hardware_acceleration_active"] = json!(hardware_acceleration());
    public["intent"] = host.intent.lock().map_err(error)?.clone();
    Ok(public)
}
#[tauri::command]
pub async fn connect_profile_server(
    window: crate::surface::Surface,
    address: String,
    profile_name: Option<String>,
) -> Result<()> {
    profile_surface(&window)?;
    let url = validate_url(&address)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(error)?;
    let response = client
        .get(url.join("/health").map_err(error)?)
        .send()
        .await
        .map_err(|_| {
            "Could not reach this server. Check its address and HTTPS certificate.".to_owned()
        })?;
    if !response.status().is_success()
        || response.json::<Value>().await.map_err(error)?["status"] != "ok"
    {
        return Err("This address did not respond as a Kindred server".into());
    }
    // Synchronize only this user-selected server address to the account we are
    // leaving. The new server receives no token from the previous server.
    let old = window.state::<Desktop>();
    let old_origin = old.origin.origin().ascii_serialization();
    let old_token = old.session_token();
    if !old_token.is_empty() && old_origin != url.origin().ascii_serialization() {
        client.post(format!("{old_origin}/identity/directory")).bearer_auth(old_token).json(&json!({"name":url.host_str().unwrap_or("Kindred"),"server":url.origin().ascii_serialization()})).send().await.map_err(|_|"Could not save this server address to your profile. Retry when the current server is reachable.".to_owned())?.error_for_status().map_err(error)?;
    }
    {
        let host = window.state::<Host>();
        let mut directory = host.entries.lock().map_err(error)?;
        if directory.is_null() {
            *directory = load()?;
        }
        if let Some(name) = profile_name {
            let name = name.trim();
            if name.is_empty() || name.len() > 80 || name.chars().any(char::is_control) {
                return Err("Enter a profile name of up to 80 characters".into());
            }
            directory["pending_profile"] = json!({"server":url.origin().ascii_serialization(),"name":name,"request_id":uuid::Uuid::new_v4().to_string()});
        } else {
            directory.as_object_mut().unwrap().remove("pending_profile");
        }
        save(&directory)?;
    }
    restart(
        window.app_handle(),
        &url.origin().ascii_serialization(),
        "",
        "unassigned",
    )
}
#[tauri::command]
pub async fn switch_native_profile(
    window: crate::surface::Surface,
    host: tauri::State<'_, Host>,
    key: String,
) -> Result<()> {
    profile_surface(&window)?;
    let entry = {
        let mut directory = host.entries.lock().map_err(error)?;
        if directory.is_null() {
            *directory = load()?;
        }
        directory["entries"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["key"] == key)
            .cloned()
            .ok_or("Profile unavailable")?
    };
    let url = validate_url(entry["server"].as_str().unwrap_or(""))?;
    if crate::local_server::is_origin(url.as_str()) {
        let setup = host.setup.lock().map_err(error)?;
        if setup["status"] == "working" || setup["status"] == "error" {
            return Err(format!(
                "Local server {}. {} Open Accounts to see setup progress or retry.",
                if setup["status"] == "working" {
                    "is still being prepared"
                } else {
                    "setup needs attention"
                },
                setup["message"].as_str().unwrap_or("")
            ));
        }
    }
    let mut token = entry["token"].as_str().unwrap_or("").to_owned();
    let profile = entry["profile_id"].as_str().ok_or("Invalid profile")?;
    if !token.is_empty() && profile != "legacy" {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(12))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(error)?;
        let response = client
            .post(url.join("/identity/switch").map_err(error)?)
            .bearer_auth(&token)
            .json(&json!({"profile_id":profile}))
            .send()
            .await
            .map_err(|_| "This profile's server is unavailable".to_owned())?;
        if response.status().is_success() {
            token = response.json::<Value>().await.map_err(error)?["token"]
                .as_str()
                .ok_or("Invalid server session")?
                .to_owned();
        } else if matches!(response.status().as_u16(), 401 | 403) {
            token.clear();
        } else {
            return Err("The server could not open this profile. Your saved sign-in is unchanged; try again when the server is available.".into());
        }
    }
    crate::local_access::cancel_for_profile_change(window.app_handle())?;
    {
        let mut directory = host.entries.lock().map_err(error)?;
        directory["last"] = json!(key);
        for e in directory["entries"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .filter(|e| e["server"] == entry["server"] && e["account"] == entry["account"])
        {
            e["token"] = json!(token);
        }
        save(&directory)?;
    }
    restart(
        window.app_handle(),
        &url.origin().ascii_serialization(),
        &token,
        profile,
    )
}
#[tauri::command]
pub fn forget_profile(
    window: crate::surface::Surface,
    host: tauri::State<'_, Host>,
    key: String,
) -> Result<()> {
    native(&window)?;
    let mut directory = host.entries.lock().map_err(error)?;
    if directory.is_null() {
        *directory = load()?;
    }
    directory["entries"]
        .as_array_mut()
        .unwrap()
        .retain(|e| e["key"] != key);
    if directory["last"] == key {
        directory["last"] = json!("");
    }
    save(&directory)
}
#[tauri::command]
pub async fn profile_activity(
    window: crate::surface::Surface,
    host: tauri::State<'_, Host>,
) -> Result<Value> {
    profile_surface(&window)?;
    let entries = {
        let mut d = host.entries.lock().map_err(error)?;
        if d.is_null() {
            *d = load()?;
        }
        d["entries"].as_array().unwrap().clone()
    };
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(error)?;
    let mut result = serde_json::Map::new();
    let mut requests = std::collections::HashMap::new();
    for entry in &entries {
        let server = entry["server"].as_str().unwrap_or("");
        let token = entry["token"].as_str().unwrap_or("");
        if token.is_empty() {
            continue;
        }
        requests
            .entry(format!("{}\n{}", server, entry["account"]))
            .or_insert((server.to_owned(), token.to_owned()));
    }
    let mut pending = Vec::new();
    for (cache_key, (server, token)) in requests {
        let client = client.clone();
        pending.push(tauri::async_runtime::spawn(async move {
            let url = validate_url(&server).ok()?;
            let response = client
                .get(url.join("/identity/profiles").ok()?)
                .bearer_auth(token)
                .send()
                .await
                .ok()?;
            if !response.status().is_success() {
                return None;
            }
            Some((cache_key, response.json::<Value>().await.ok()?))
        }));
    }
    let mut caches = std::collections::HashMap::new();
    for request in pending {
        if let Ok(Some((key, value))) = request.await {
            caches.insert(key, value);
        }
    }
    for entry in &entries {
        let cache_key = format!(
            "{}\n{}",
            entry["server"].as_str().unwrap_or(""),
            entry["account"]
        );
        if let Some(v) = caches.get(&cache_key) {
            if let Some(profile) = v["profiles"]
                .as_array()
                .and_then(|rows| rows.iter().find(|p| p["id"] == entry["profile_id"]))
            {
                result.insert(
                    entry["key"].as_str().unwrap_or("").into(),
                    profile["unread"].clone(),
                );
            }
        }
    }
    Ok(Value::Object(result))
}
fn docker_executable() -> PathBuf {
    #[cfg(windows)]
    {
        if let Some(base) = std::env::var_os("ProgramFiles") {
            let p = PathBuf::from(base).join("Docker/Docker/resources/bin/docker.exe");
            if p.is_file() {
                return p;
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        for p in [
            "/usr/local/bin/docker",
            "/Applications/Docker.app/Contents/Resources/bin/docker",
        ] {
            if Path::new(p).is_file() {
                return PathBuf::from(p);
            }
        }
    }
    PathBuf::from("docker")
}
fn unpack(source: &Path, destination: &Path) -> Result<()> {
    let file = std::fs::File::open(source).map_err(error)?;
    let mut archive = zip::ZipArchive::new(file).map_err(error)?;
    if archive.len() > 256 {
        return Err("Invalid standalone bundle".into());
    }
    std::fs::create_dir_all(destination).map_err(error)?;
    let mut total = 0u64;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(error)?;
        let name = entry.enclosed_name().ok_or("Invalid standalone path")?;
        if entry.is_symlink() {
            return Err("Standalone bundle contains a link".into());
        }
        total += entry.size();
        if total > 128 * 1024 * 1024 {
            return Err("Standalone bundle is too large".into());
        }
        let target = destination.join(name);
        if entry.is_dir() {
            std::fs::create_dir_all(&target).map_err(error)?;
            continue;
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(error)?;
        }
        let mut output = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map_err(error)?;
        std::io::copy(&mut entry, &mut output).map_err(error)?;
    }
    Ok(())
}
#[tauri::command]
pub fn start_standalone(
    window: crate::surface::Surface,
    host: tauri::State<'_, Host>,
) -> Result<()> {
    native(&window)?;
    let _ = host;
    start_setup(window.app_handle().clone())
}
// Only the managed loopback workspace may operate its local installation.
fn local_admin(window: &crate::surface::Surface) -> Result<()> {
    let url = window.url().map_err(error)?;
    if window.label() == "main"
        && url.origin().ascii_serialization() == crate::local_server::ORIGIN
        && url.path() == "/"
        && root()?.join("standalone").is_dir()
    {
        Ok(())
    } else {
        Err("Local server controls are only available in the local workspace".into())
    }
}
#[tauri::command]
pub fn prepare_local_server(window: crate::surface::Surface) -> Result<()> {
    local_admin(&window)?;
    start_setup_mode(window.app_handle().clone(), true, false)
}
#[tauri::command]
pub fn restart_local_server(window: crate::surface::Surface) -> Result<()> {
    local_admin(&window)?;
    start_setup_mode(window.app_handle().clone(), false, true)
}
pub fn start_setup(app: tauri::AppHandle) -> Result<()> {
    start_setup_mode(app, false, false)
}
fn start_setup_mode(app: tauri::AppHandle, prepare_only: bool, activate_only: bool) -> Result<()> {
    let host = app.state::<Host>();
    let mut status = host.setup.lock().map_err(error)?;
    if status["status"] == "working" {
        return Ok(());
    }
    if activate_only && status["status"] != "awaiting_restart" {
        return Err("Prepare the local server update before restarting".into());
    }
    *status = crate::setup_progress::begin();
    if activate_only {
        crate::setup_progress::stage(&mut status, 3);
    }
    drop(status);
    drop(host);
    std::thread::spawn(move || {
        let set_stage = |index| {
            crate::setup_progress::stage(&mut app.state::<Host>().setup.lock().unwrap(), index);
        };
        let result = (|| -> Result<()> {
            let root = root()?.join("standalone");
            std::fs::create_dir_all(&root).map_err(error)?;
            let log_path = root.join("setup.log");
            #[cfg(not(target_os = "linux"))]
            for args in [
                vec!["compose", "version"],
                vec!["info", "--format", "{{.ServerVersion}}"],
            ] {
                let mut command = Command::new(docker_executable());
                command.args(args);
                hidden(&mut command);
                crate::setup_progress::run(
                    &mut command,
                    &log_path,
                    Duration::from_secs(10),
                    |tail| {
                        app.state::<Host>().setup.lock().unwrap()["detail"] = json!(tail);
                    },
                )?;
            }
            #[cfg(target_os = "linux")]
            if let Some(message) = crate::linux_setup::prerequisite_error() {
                return Err(message.into());
            }
            if !activate_only {
                set_stage(1);
            }
            let context = root.join(env!("CARGO_PKG_VERSION"));
            if !context.join("bundle.complete").exists() {
                let temporary = root.join(format!("setup-{}", uuid::Uuid::new_v4()));
                let source = app
                    .path()
                    .resource_dir()
                    .map_err(error)?
                    .join("standalone.zip");
                let source = if source.exists() {
                    source
                } else {
                    std::env::current_exe()
                        .map_err(error)?
                        .parent()
                        .unwrap()
                        .join("standalone.zip")
                };
                unpack(&source, &temporary)?;
                std::fs::write(temporary.join("bundle.complete"), env!("CARGO_PKG_VERSION"))
                    .map_err(error)?;
                if context.exists() {
                    return Err("An incomplete local setup needs inspection. Your existing server data is preserved.".into());
                }
                std::fs::rename(temporary, &context).map_err(error)?;
            }
            for (index, args) in [(2, vec!["build"]), (3, vec!["up", "-d", "--no-build"])] {
                if activate_only && index == 2 {
                    continue;
                }
                if prepare_only && index == 3 {
                    return Ok(());
                }
                set_stage(index);
                let mut command = Command::new(docker_executable());
                command
                    .args([
                        "compose",
                        "--progress",
                        "plain",
                        "--project-name",
                        "kindred-standalone",
                        "-f",
                    ])
                    .arg(context.join("compose.yaml"));
                #[cfg(target_os = "linux")]
                {
                    use std::os::unix::fs::MetadataExt;
                    if unsafe { libc::access(c"/dev/kvm".as_ptr(), libc::R_OK | libc::W_OK) } == 0 {
                        if let Ok(meta) = std::fs::metadata("/dev/kvm") {
                            command
                                .arg("-f")
                                .arg(context.join("compose.kvm.yaml"))
                                .env("KINDRED_KVM_GID", meta.gid().to_string());
                        }
                    }
                }
                command.args(args);
                if activate_only && index == 3 {
                    command.arg("--force-recreate");
                }
                hidden(&mut command);
                crate::setup_progress::run(
                    &mut command,
                    &log_path,
                    Duration::from_secs(if index == 2 { 1800 } else { 180 }),
                    |tail| {
                        app.state::<Host>().setup.lock().unwrap()["detail"] = json!(tail);
                    },
                )?;
            }
            set_stage(4);
            let deadline = Instant::now() + Duration::from_secs(90);
            loop {
                if crate::local_server::version().as_deref() == Some(env!("CARGO_PKG_VERSION")) {
                    break;
                }
                if Instant::now() >= deadline {
                    return Err("Docker finished, but the local server has not reported this app's version. Your data is preserved. Check setup.log before retrying.".into());
                }
                std::thread::sleep(Duration::from_secs(1));
            }
            Ok(())
        })();
        let success = result.is_ok();
        {
            let host = app.state::<Host>();
            let mut status = host.setup.lock().unwrap();
            if success && prepare_only {
                status["status"] = json!("awaiting_restart");
                status["completed_stages"] = json!(3);
                status["message"] = json!("Update prepared. Restart to apply it.");
            } else {
                crate::setup_progress::finish(&mut status, result);
            }
        }
        if success && activate_only {
            // Only the server changed. Keep the desktop process and its session alive.
            if let Some(view) = app.get_webview("main") {
                if let Err(error) = view.reload() {
                    crate::setup_progress::finish(
                        &mut app.state::<Host>().setup.lock().unwrap(),
                        Err(format!(
                            "The server restarted, but the window could not reconnect: {error}. Reopen Kindred."
                        )),
                    );
                }
            }
        }
    });
    Ok(())
}
#[tauri::command]
pub async fn standalone_status(
    window: crate::surface::Surface,
    host: tauri::State<'_, Host>,
) -> Result<Value> {
    native(&window).or_else(|_| local_admin(&window))?;
    let mut value = {
        let status = host.setup.lock().map_err(error)?;
        if status.is_null() {
            json!({"status":"idle","message":""})
        } else {
            status.clone()
        }
    };
    let saved_local = host.entries.lock().map_err(error)?["entries"]
        .as_array()
        .is_some_and(|entries| {
            entries
                .iter()
                .any(|entry| crate::local_server::is_origin(entry["server"].as_str().unwrap_or("")))
        });
    if value["status"] != "working" && (saved_local || root()?.join("standalone").is_dir()) {
        let version = tauri::async_runtime::spawn_blocking(crate::local_server::version)
            .await
            .map_err(error)?;
        let current = host.setup.lock().map_err(error)?.clone();
        if !current.is_null() {
            value = current;
        }
        if value["status"] != "working" {
            if let Some(version) = version {
                value["local_server"] = json!({"version":version,"desktop_version":env!("CARGO_PKG_VERSION"),"update_available":crate::local_server::newer(env!("CARGO_PKG_VERSION"), &version)});
            } else if value["status"] == "ready" {
                value = json!({"status":"idle","message":"Your local server is offline. Start it again below."});
            }
        }
    }
    #[cfg(target_os = "linux")]
    let value = {
        let mut value = value;
        let image = crate::linux_setup::current_appimage();
        value["linux_recovery"] = json!({
            "command":crate::linux_setup::recovery_command(image.as_deref(), std::env::current_exe().ok().and_then(|p| p.to_str().map(str::to_owned)).as_deref()),
            "appimage":image.is_some(),
            "note":"Run this in your terminal as your normal user. It installs prerequisites on Ubuntu, Debian or Fedora and may add you to the docker group, which grants administrator-level access. After a group change, sign out of the desktop completely and sign back in; newgrp does not refresh an already-running app."
        });
        value
    };
    Ok(value)
}
#[tauri::command]
pub fn set_launch_on_startup(
    window: crate::surface::Surface,
    host: tauri::State<'_, Host>,
    enabled: bool,
) -> Result<()> {
    profile_surface(&window)?;
    let exe = std::env::current_exe().map_err(error)?;
    #[cfg(windows)]
    {
        let (run, _) = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
            .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
            .map_err(error)?;
        if enabled {
            let launcher = root()?.join("Launch.vbs");
            let command = if launcher.exists() {
                format!("wscript.exe \"{}\"", launcher.display())
            } else {
                format!("\"{}\"", exe.display())
            };
            run.set_value("Kindred", &command).map_err(error)?;
        } else {
            let _ = run.delete_value("Kindred");
        }
    }
    #[cfg(target_os = "linux")]
    {
        let base = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(std::env::var_os("HOME").unwrap()).join(".config"))
            .join("autostart");
        std::fs::create_dir_all(&base).map_err(error)?;
        let file = base.join("kindred.desktop");
        if enabled {
            let managed = root()?.join("bin/kindred");
            let executable = if root()?.join("linux/current/launch").is_file() && managed.is_file()
            {
                managed.to_string_lossy().into_owned()
            } else {
                std::env::var("APPIMAGE").unwrap_or_else(|_| exe.to_string_lossy().into_owned())
            };
            let executable = crate::linux_update::desktop_exec_arg(&executable)?;
            std::fs::write(file,format!("[Desktop Entry]\nType=Application\nName=Kindred\nExec={executable}\nX-GNOME-Autostart-enabled=true\n")).map_err(error)?;
        } else if file.exists() {
            std::fs::remove_file(file).map_err(error)?;
        }
    }
    #[cfg(target_os = "macos")]
    {
        let base = PathBuf::from(std::env::var_os("HOME").ok_or("Home unavailable")?)
            .join("Library/LaunchAgents");
        std::fs::create_dir_all(&base).map_err(error)?;
        let file = base.join("dev.kindred.startup.plist");
        if enabled {
            let path = exe
                .to_string_lossy()
                .replace('&', "&amp;")
                .replace('<', "&lt;")
                .replace('>', "&gt;");
            std::fs::write(file,format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?><plist version=\"1.0\"><dict><key>Label</key><string>dev.kindred.startup</string><key>ProgramArguments</key><array><string>{path}</string></array><key>RunAtLoad</key><true/></dict></plist>")).map_err(error)?;
        } else if file.exists() {
            std::fs::remove_file(file).map_err(error)?;
        }
    }
    let mut directory = host.entries.lock().map_err(error)?;
    if directory.is_null() {
        *directory = load()?;
    }
    directory["launch_on_startup"] = json!(enabled);
    save(&directory)
}

#[tauri::command]
pub async fn open_profile_transfer(
    window: crate::surface::Surface,
    state: tauri::State<'_, Desktop>,
    host: tauri::State<'_, Host>,
) -> Result<()> {
    crate::desktop::trusted(&window, &state)?;
    let origin = state.origin.origin().ascii_serialization();
    let mut directory = host.entries.lock().map_err(error)?;
    if directory.is_null() {
        *directory = load()?;
    }
    let source = directory["entries"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["server"] == origin && e["profile_id"] == profile_id())
        .ok_or("Reconnect this profile before moving it")?;
    *host.intent.lock().map_err(error)? =
        json!({"mode":"transfer","source":source["key"],"name":source["name"],"server":origin});
    drop(directory);
    show(window.app_handle())
}
async fn transfer_json(
    client: &reqwest::Client,
    server: &str,
    route: &str,
    token: &str,
    body: Option<Value>,
) -> Result<Value> {
    let url = validate_url(server)?.join(route).map_err(error)?;
    let mut request = if let Some(body) = body {
        client.post(url).json(&body)
    } else {
        client.get(url)
    };
    if !token.is_empty() {
        request = request.bearer_auth(token);
    }
    let mut response = request.send().await.map_err(|_| {
        "Could not reach the server. Your original workspace is retained; retry the transfer."
            .to_owned()
    })?;
    let ok = response.status().is_success();
    if response
        .content_length()
        .is_some_and(|n| n > 256 * 1024 * 1024)
    {
        return Err("Workspace transfer exceeds 256 MB".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(error)? {
        if bytes.len() + chunk.len() > 256 * 1024 * 1024 {
            return Err("Workspace transfer exceeds 256 MB".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| {
        "This server does not support workspace transfers. Update Kindred on both servers."
            .to_owned()
    })?;
    if !ok {
        return Err(value["error"]
            .as_str()
            .unwrap_or("The server could not complete the transfer")
            .to_owned());
    }
    Ok(value)
}
fn source_entry(window: &crate::surface::Surface, host: &Host) -> Result<Value> {
    let mut directory = host.entries.lock().map_err(error)?;
    if directory.is_null() {
        *directory = load()?;
    }
    let intent = host.intent.lock().map_err(error)?;
    let key = intent["source"]
        .as_str()
        .ok_or("Open Move to another server from the profile's settings")?;
    let mut source = directory["entries"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["key"] == key)
        .cloned()
        .ok_or("Source profile is no longer saved")?;
    let desktop = window.state::<Desktop>();
    if source["server"] == desktop.origin.origin().ascii_serialization() {
        let token = desktop.session_token();
        if !token.is_empty() {
            source["token"] = json!(token);
        }
    }
    if source["token"].as_str().unwrap_or("").is_empty() {
        return Err("Sign in to the source profile before moving it".into());
    }
    Ok(source)
}
#[tauri::command]
pub async fn transfer_profile(
    window: crate::surface::Surface,
    host: tauri::State<'_, Host>,
    address: String,
    username: String,
    password: String,
    register: bool,
    remember: bool,
) -> Result<Value> {
    native(&window)?;
    crate::local_access::cancel_for_profile_change(window.app_handle())?;
    let source = source_entry(&window, &host)?;
    let source_server = source["server"].as_str().ok_or("Missing source server")?;
    let source_token = source["token"].as_str().unwrap();
    let destination = validate_url(&address)?.origin().ascii_serialization();
    if source_server == destination {
        return Err(
            "Choose a different server. Use Create a profile for another workspace on this server."
                .into(),
        );
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(error)?;
    let verified = transfer_json(
        &client,
        source_server,
        "/identity/profiles",
        source_token,
        None,
    )
    .await?;
    if verified["active"] != source["profile_id"] || verified["legacy"] == true {
        return Err("Sign in to the account that owns this exact profile before moving it".into());
    }
    let previous = transfer_json(
        &client,
        source_server,
        "/identity/transfer",
        source_token,
        None,
    )
    .await?;
    if previous["state"] == "moved" && previous["destination"] != destination {
        return Err(format!(
            "This workspace was already moved to {}",
            previous["destination"].as_str().unwrap_or("another server")
        ));
    }
    let transfer_id = {
        let mut directory = host.entries.lock().map_err(error)?;
        let pending = &directory["transfer_request"];
        if !pending.is_null()
            && pending["source"] == source["key"]
            && (pending["destination"] != destination || pending["username"] != username)
        {
            return Err("Resume the pending transfer with its original server and username, or cancel it first.".into());
        }
        let id = previous["id"]
            .as_str()
            .or_else(|| {
                if pending["source"] == source["key"] {
                    pending["id"].as_str()
                } else {
                    None
                }
            })
            .map(str::to_owned)
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        directory["transfer_request"] =
            json!({"source":source["key"],"destination":destination,"username":username,"id":id});
        save(&directory)?;
        id
    };
    let name = verified["profiles"]
        .as_array()
        .and_then(|items| items.iter().find(|p| p["active"] == true))
        .and_then(|p| p["name"].as_str())
        .unwrap_or("Kindred");
    let mut credentials = json!({"login":username,"password":password,"request_id":transfer_id});
    if register {
        credentials["name"] = json!(name);
    } else {
        credentials["new_profile_name"] = json!(name);
    }
    let account = transfer_json(
        &client,
        &destination,
        if register {
            "/identity/register"
        } else {
            "/identity/login"
        },
        "",
        Some(credentials),
    )
    .await?;
    let token = account["token"]
        .as_str()
        .ok_or("Destination sign-in returned no session")?;
    let profile = account["profile_id"]
        .as_str()
        .ok_or("Destination returned no profile")?;
    let package = transfer_json(
        &client,
        source_server,
        "/identity/transfer",
        source_token,
        Some(json!({"id":transfer_id})),
    )
    .await?;
    let encoded = serde_json::to_vec(&package).map_err(error)?;
    let expected: String = ring::digest::digest(&ring::digest::SHA256, &encoded)
        .as_ref()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    let result = transfer_json(
        &client,
        &destination,
        "/identity/transfer/import",
        token,
        Some(package),
    )
    .await?;
    if result["receipt"]["id"] != transfer_id
        || result["receipt"]["digest"] != expected
        || result["profile_id"] != profile
    {
        return Err(
            "Destination did not confirm this workspace transfer; the source remains paused."
                .into(),
        );
    }
    transfer_json(
        &client,
        source_server,
        "/identity/transfer/finish",
        source_token,
        Some(json!({"id":transfer_id,"destination":destination})),
    )
    .await?;
    let identity = transfer_json(&client, &destination, "/identity/profiles", token, None).await?;
    {
        let mut directory = host.entries.lock().map_err(error)?;
        let entries = directory["entries"].as_array_mut().unwrap();
        let new_key = key(&destination, profile);
        entries.retain(|e| e["key"] != source["key"] && e["key"] != new_key);
        entries.push(json!({"key":new_key,"server":destination,"profile_id":profile,"name":result["name"],"account":identity["account_id"],"token":if remember{token}else{""},"legacy":false}));
        directory["last"] = json!(new_key);
        directory
            .as_object_mut()
            .unwrap()
            .remove("transfer_request");
        save(&directory)?;
    }
    restart(window.app_handle(), &destination, token, profile)?;
    Ok(json!({"moved":true}))
}
#[tauri::command]
pub async fn cancel_profile_transfer(
    window: crate::surface::Surface,
    host: tauri::State<'_, Host>,
) -> Result<()> {
    native(&window)?;
    let source = source_entry(&window, &host)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(error)?;
    let status = transfer_json(
        &client,
        source["server"].as_str().unwrap(),
        "/identity/transfer",
        source["token"].as_str().unwrap(),
        None,
    )
    .await?;
    if status["state"] == "moved" {
        return Err("The transfer is complete. Reconnect to its destination server.".into());
    }
    if status["state"] == "prepared" {
        transfer_json(
            &client,
            source["server"].as_str().unwrap(),
            "/identity/transfer/cancel",
            source["token"].as_str().unwrap(),
            Some(json!({"id":status["id"]})),
        )
        .await?;
    }
    let mut directory = host.entries.lock().map_err(error)?;
    directory
        .as_object_mut()
        .unwrap()
        .remove("transfer_request");
    save(&directory)?;
    Ok(())
}
