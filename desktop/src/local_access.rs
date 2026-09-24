use crate::{desktop::Desktop, local_files};
use serde_json::{Value, json};
use std::{
    io::Read,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
type Result<T> = std::result::Result<T, String>;
pub struct Bridge {
    state: Mutex<State>,
}
struct State {
    config: Value,
    pending: Option<Value>,
    decision: Option<bool>,
    cancel: Option<Arc<AtomicBool>>,
    error: String,
    phase: &'static str,
}
impl Default for Bridge {
    fn default() -> Self {
        Self {
            state: Mutex::new(State {
                config: Value::Null,
                pending: None,
                decision: None,
                cancel: None,
                error: String::new(),
                phase: "starting",
            }),
        }
    }
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn path(name: &str) -> Result<PathBuf> {
    Ok(crate::profiles::data_root()?.join(name))
}
pub fn cancel_for_profile_change(app: &tauri::AppHandle) -> Result<()> {
    let bridge = app.state::<Bridge>();
    let state = bridge.state.lock().map_err(|e| e.to_string())?;
    if let Some(cancel) = &state.cancel {
        cancel.store(true, Ordering::SeqCst);
        return Err(
            "Stopping the current desktop operation. Try switching again once it finishes.".into(),
        );
    }
    Ok(())
}
#[tauri::command]
pub fn prepare_profile_switch(
    window: crate::surface::Surface,
    desktop: tauri::State<'_, Desktop>,
) -> Result<()> {
    crate::desktop::trusted(&window, &desktop)?;
    cancel_for_profile_change(window.app_handle())
}
fn native(window: &crate::surface::Surface) -> Result<()> {
    let u = window.url().map_err(|e| e.to_string())?;
    if matches!(window.label(), "local-access" | "local-access-settings")
        && u.path() == "/local-access.html"
        && (u.scheme() == "tauri"
            || (u.scheme() == "http" && u.host_str() == Some("tauri.localhost")))
    {
        Ok(())
    } else {
        Err("Only the bundled local-access window can grant desktop permissions".into())
    }
}
pub fn show(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("local-access") {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        if let Ok(w) = tauri::WebviewWindowBuilder::new(
            &app,
            "local-access",
            tauri::WebviewUrl::App("local-access.html".into()),
        )
        .title("Kindred · Local access")
        .decorations(cfg!(any(target_os = "linux", target_os = "macos")))
        .initialization_script(if cfg!(any(target_os = "linux", target_os = "macos")) {
            "window.__KINDRED_NATIVE_FRAME=true;"
        } else {
            ""
        })
        .inner_size(600.0, 630.0)
        .min_inner_size(480.0, 400.0)
        .center()
        .on_navigation(|u| {
            u.scheme() == "tauri"
                || (u.scheme() == "http" && u.host_str() == Some("tauri.localhost"))
        })
        .build()
        {
            let handle = app.clone();
            w.on_window_event(move |e| {
                if matches!(e, tauri::WindowEvent::CloseRequested { .. }) {
                    let bridge = handle.state::<Bridge>();
                    let mut s = bridge.state.lock().unwrap();
                    if s.pending.is_some() {
                        s.decision = Some(false);
                    }
                }
            });
            let _ = w.set_focus();
        }
    });
}
#[tauri::command]
pub async fn open_local_access(
    window: crate::surface::Surface,
    desktop: tauri::State<'_, Desktop>,
    theme: Option<String>,
    bounds: Option<PermissionBounds>,
) -> Result<()> {
    crate::desktop::trusted(&window, &desktop)?;
    #[cfg(target_os = "linux")]
    let bounds = {
        let _ = bounds;
        None
    };
    if let Some(theme) = theme.filter(|t| matches!(t.as_str(), "dark" | "light")) {
        let host = window.state::<crate::profiles::Host>();
        let mut entries = host.entries.lock().map_err(|e| e.to_string())?;
        if !entries.is_null() {
            entries["theme"] = json!(theme);
        }
    }
    if let Some(bounds) = bounds {
        set_settings_view(&window, bounds)?;
    } else {
        show(window.app_handle());
    }
    Ok(())
}
#[derive(serde::Deserialize)]
pub struct PermissionBounds {
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) width: f64,
    pub(crate) height: f64,
}
pub(crate) fn validate_bounds(
    bounds: &PermissionBounds,
    size: tauri::PhysicalSize<u32>,
) -> Result<()> {
    if ![bounds.x, bounds.y, bounds.width, bounds.height]
        .iter()
        .all(|n| n.is_finite())
        || bounds.x < 0.0
        || bounds.y < 0.0
        || bounds.width < 100.0
        || bounds.height < 100.0
        || bounds.x + bounds.width > f64::from(size.width) + 2.0
        || bounds.y + bounds.height > f64::from(size.height) + 2.0
    {
        return Err("Settings pages must stay inside the main window.".into());
    }
    Ok(())
}
fn set_settings_view(window: &crate::surface::Surface, bounds: PermissionBounds) -> Result<()> {
    validate_bounds(&bounds, window.inner_size().map_err(|e| e.to_string())?)?;
    let position = tauri::PhysicalPosition::new(bounds.x.round() as i32, bounds.y.round() as i32);
    let size = tauri::PhysicalSize::new(bounds.width.round() as u32, bounds.height.round() as u32);
    if let Some(view) = window.app_handle().get_webview("local-access-settings") {
        view.set_bounds(tauri::Rect {
            position: position.into(),
            size: size.into(),
        })
        .map_err(|e| e.to_string())?;
        return Ok(());
    }
    let builder = tauri::webview::WebviewBuilder::new(
        "local-access-settings",
        tauri::WebviewUrl::App("local-access.html?embedded=1".into()),
    )
    .on_navigation(|u| {
        u.path() == "/local-access.html"
            && (u.scheme() == "tauri"
                || (u.scheme() == "http" && u.host_str() == Some("tauri.localhost")))
    });
    window
        .add_child(builder, position, size)
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn position_local_access(
    window: crate::surface::Surface,
    desktop: tauri::State<'_, Desktop>,
    bounds: Option<PermissionBounds>,
) -> Result<()> {
    crate::desktop::trusted(&window, &desktop)?;
    if let Some(bounds) = bounds {
        // Resizing cannot create a new privileged surface after its page closed.
        if window
            .app_handle()
            .get_webview("local-access-settings")
            .is_some()
        {
            set_settings_view(&window, bounds)?;
        }
    } else if let Some(view) = window.app_handle().get_webview("local-access-settings") {
        view.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn snapshot(bridge: &Bridge) -> Result<Value> {
    let s = bridge.state.lock().map_err(|e| e.to_string())?;
    Ok(
        json!({"mode":s.config["mode"].as_str().unwrap_or("off"),"device_id":s.config["id"],"origin":s.config["origin"],"workspace":path("workspace")?.to_string_lossy(),"pending":s.pending,"error":s.error}),
    )
}
#[tauri::command]
pub fn local_access_status(
    window: crate::surface::Surface,
    desktop: tauri::State<'_, Desktop>,
    bridge: tauri::State<'_, Bridge>,
) -> Result<Value> {
    crate::desktop::trusted(&window, &desktop)?;
    let mut v = snapshot(&bridge)?;
    v.as_object_mut().unwrap().remove("pending");
    Ok(v)
}
#[tauri::command]
pub fn local_access_state(
    window: crate::surface::Surface,
    bridge: tauri::State<'_, Bridge>,
) -> Result<Value> {
    native(&window)?;
    let mut value = snapshot(&bridge)?;
    value["theme"] = window
        .state::<crate::profiles::Host>()
        .entries
        .lock()
        .map_err(|e| e.to_string())?["theme"]
        .clone();
    Ok(value)
}
#[tauri::command]
pub fn set_local_access(
    window: crate::surface::Surface,
    bridge: tauri::State<'_, Bridge>,
    mode: String,
) -> Result<()> {
    native(&window)?;
    if !matches!(mode.as_str(), "off" | "workspace" | "ask" | "full") {
        return Err("Invalid permission mode".into());
    }
    let mut s = bridge.state.lock().map_err(|e| e.to_string())?;
    if s.config.is_null() {
        return Err("The local bridge is not ready".into());
    }
    let mut next = s.config.clone();
    next["mode"] = json!(mode);
    local_files::atomic(&path("local-access.json")?, &next)?;
    s.config = next;
    if let Some(cancel) = &s.cancel {
        cancel.store(true, Ordering::SeqCst);
    }
    s.decision = Some(false);
    Ok(())
}
#[tauri::command]
pub fn decide_local_access(
    window: crate::surface::Surface,
    bridge: tauri::State<'_, Bridge>,
    id: String,
    allow: bool,
) -> Result<()> {
    native(&window)?;
    if window.label() != "local-access" {
        return Err("Use the operation approval window to decide this request.".into());
    }
    let mut s = bridge.state.lock().map_err(|e| e.to_string())?;
    if s.pending.as_ref().is_none_or(|v| v["id"] != id) || s.decision.is_some() {
        return Err("This request is no longer pending".into());
    }
    s.decision = Some(allow);
    Ok(())
}
fn init(app: &tauri::AppHandle) -> Result<()> {
    let origin = app.state::<Desktop>().origin.origin().ascii_serialization();
    let p = path("local-access.json")?;
    let config = if p.exists() {
        let bytes = std::fs::read(&p).map_err(|e| e.to_string())?;
        if bytes.len() > 8192 {
            return Err("Invalid local configuration".into());
        }
        let c: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        if c["origin"] != origin {
            return Err("This installation is paired with a different server. Use a separate Kindred installation for that server".into());
        }
        c
    } else {
        let c = json!({"origin":origin,"id":uuid::Uuid::new_v4().to_string(),"secret":format!("{}{}",uuid::Uuid::new_v4(),uuid::Uuid::new_v4()),"mode":"off"});
        local_files::atomic(&p, &c)?;
        c
    };
    if uuid::Uuid::parse_str(config["id"].as_str().unwrap_or("")).is_err()
        || config["secret"].as_str().is_none_or(|s| s.len() != 72)
        || !matches!(
            config["mode"].as_str(),
            Some("off" | "workspace" | "ask" | "full")
        )
    {
        return Err("Invalid local configuration".into());
    }
    let workspace = path("workspace")?;
    if !workspace.exists() {
        std::fs::create_dir(&workspace).map_err(|e| e.to_string())?;
    }
    local_files::resolve(&workspace, "")?;
    app.state::<Bridge>().state.lock().unwrap().config = config;
    Ok(())
}
fn perform(app: &tauri::AppHandle, request: &Value, cancel: Arc<AtomicBool>) -> Result<Value> {
    let tool = request["tool"].as_str().ok_or("Missing local tool")?;
    let args = &request["args"];
    let raw = args["path"].as_str().ok_or("Missing local path")?;
    let default_path;
    let raw = if raw.is_empty() && tool == "local_skill_scan" {
        default_path = crate::skill_files::default_root()?;
        default_path.as_str()
    } else {
        raw
    };
    let root = path("workspace")?;
    let (target, inside) = local_files::resolve(&root, raw)?;
    let bridge = app.state::<Bridge>();
    let mode = bridge.state.lock().unwrap().config["mode"]
        .as_str()
        .unwrap_or("off")
        .to_owned();
    if local_files::needs_approval(&mode, inside, tool)? {
        {
            let mut s = bridge.state.lock().unwrap();
            s.pending = Some(
                json!({"id":request["id"],"bot":request["bot"],"tool":tool,"path":target.to_string_lossy(),"command":args["command"],"text":args["text"]}),
            );
            s.decision = None;
            s.phase = "awaiting_approval";
        }
        show(app);
        let approved = loop {
            if cancel.load(Ordering::SeqCst) || now() >= request["deadline"].as_u64().unwrap_or(0) {
                break false;
            }
            if let Some(v) = bridge.state.lock().unwrap().decision {
                break v;
            }
            std::thread::sleep(Duration::from_millis(100));
        };
        {
            let mut s = bridge.state.lock().unwrap();
            s.pending = None;
            s.decision = None;
        }
        if !approved {
            return Err("The user declined or the desktop approval expired. Do not retry or route around this decision".into());
        }
    }
    // Re-resolve after the user decides so a changed link or parent cannot inherit consent.
    let (fresh, _) = local_files::resolve(&root, raw)?;
    if fresh != target {
        return Err("The local path changed while awaiting approval".into());
    }
    if now() >= request["deadline"].as_u64().unwrap_or(0) {
        return Err("Local operation expired".into());
    }
    bridge.state.lock().unwrap().phase = "running";
    if tool == "local_exec" && args["background"] == true {
        if cancel.load(Ordering::SeqCst) {
            return Err("Command cancelled before launch".into());
        }
        let mut args = args.clone();
        args["path"] = json!(target.to_string_lossy());
        return crate::managed_process::start(
            &path("commands")?,
            args["process_id"].as_str().ok_or("Missing process ID")?,
            &args,
        )
        .map_err(|e| e.to_string());
    }
    local_files::execute(tool, &target, args, cancel)
}
fn post(client: &reqwest::blocking::Client, url: &str, token: &str, body: &Value) -> Result<Value> {
    let response = client
        .post(url)
        .bearer_auth(token)
        .json(body)
        .send()
        .map_err(|e| format!("Desktop bridge could not contact the server: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Desktop bridge returned HTTP {}",
            response.status()
        ));
    }
    let mut bytes = Vec::new();
    response
        .take(1_300_001)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 1_300_000 {
        return Err("Desktop response exceeds its size limit".into());
    }
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}
pub fn watch(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        if let Err(e) = watch_inner(&app) {
            app.state::<Bridge>().state.lock().unwrap().error = e;
        }
    });
}
fn watch_inner(app: &tauri::AppHandle) -> Result<()> {
    use fs2::FileExt;
    let lock = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path("local-bridge.lock")?)
        .map_err(|e| e.to_string())?;
    loop {
        match lock.try_lock_exclusive() {
            Ok(()) => break,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                // Account restarts spawn the replacement before the old process exits.
                // Keep waiting without claiming operations or changing the saved pairing.
                app.state::<Bridge>().state.lock().unwrap().error =
                    "Waiting for another Kindred process to release this computer's local connection.".into();
                std::thread::sleep(Duration::from_secs(1));
            }
            Err(error) => return Err(format!("Could not lock the local connection: {error}")),
        }
    }
    init(app)?;
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;
    let desktop = app.state::<Desktop>();
    let url = format!(
        "{}/api/local/poll",
        desktop.origin.origin().ascii_serialization()
    );
    let journal = path("local-operation.json")?;
    let mut receipt = if journal.exists() {
        let bytes = std::fs::read(&journal).map_err(|e| e.to_string())?;
        if bytes.len() > 1_300_000 {
            return Err("Invalid local operation receipt".into());
        }
        let mut v: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        if v["result"].is_null() {
            v["result"] = json!({"failed":true,"text":"Desktop stopped after claiming this operation. Its outcome is unknown; it was not replayed. Inspect existing effects before retrying"});
            local_files::atomic(&journal, &v)?;
        }
        Some(v)
    } else {
        None
    };
    let (tx, rx) = std::sync::mpsc::channel();
    let mut running: Option<(String, Arc<AtomicBool>, u64, String)> = None;
    let mut command_controls: Vec<Value> = Vec::new();
    loop {
        let bridge = app.state::<Bridge>();
        if let Ok(done) = rx.try_recv() {
            receipt = Some(done);
            running = None;
            bridge.state.lock().unwrap().cancel = None;
        }
        let config = bridge.state.lock().unwrap().config.clone();
        let token = desktop.session_token();
        if let Some((_, cancel, deadline, old_token)) = &running {
            if token != *old_token || config["mode"] == "off" || now() >= *deadline {
                cancel.store(true, Ordering::SeqCst);
            }
        }
        if token.is_empty() {
            std::thread::sleep(Duration::from_secs(1));
            continue;
        }
        let progress = running
            .as_ref()
            .map(|(id, _, _, _)| json!({"id":id,"phase":bridge.state.lock().unwrap().phase}));
        let command_root = path("commands")?;
        let commands: Vec<Value> = command_controls
            .iter()
            .filter_map(|job| {
                let id = job["id"].as_str()?;
                let result = if job["stop"] == true
                    || config["mode"] == "off"
                    || config["mode"] == "workspace"
                {
                    crate::managed_process::stop(&command_root, id)
                } else {
                    crate::managed_process::status(&command_root, id)
                };
                result.ok()
            })
            .collect();
        let body = json!({"command_protocol":1,"commands":commands,"profile_id":crate::profiles::profile_id(),"id":config["id"],"secret":config["secret"],"mode":config["mode"],"name":std::env::var("COMPUTERNAME").or_else(|_|std::env::var("HOSTNAME")).unwrap_or("Desktop".into()),"busy":running.is_some(),"receipt":receipt,"progress":progress});
        match post(&client, &url, &token, &body) {
            Err(e) => {
                if e.contains("HTTP 401") || e.contains("HTTP 403") {
                    for job in &command_controls {
                        if let Some(id) = job["id"].as_str() {
                            let _ = crate::managed_process::stop(&command_root, id);
                        }
                    }
                }
                bridge.state.lock().unwrap().error = e;
                if let Some((_, cancel, _, _)) = &running {
                    cancel.store(true, Ordering::SeqCst);
                }
            }
            Ok(v) => {
                bridge.state.lock().unwrap().error.clear();
                command_controls = v["commands"].as_array().cloned().unwrap_or_default();
                if receipt.is_some() {
                    std::fs::remove_file(&journal).map_err(|e| e.to_string())?;
                    receipt = None;
                }
                if let Some((id, cancel, _, _)) = &running {
                    if v["active"] != *id {
                        cancel.store(true, Ordering::SeqCst);
                    }
                }
                if let Some(request) = v.get("request").filter(|v| v.is_object()) {
                    if running.is_some() {
                        return Err("Server supplied overlapping local operations".into());
                    }
                    let id = request["id"]
                        .as_str()
                        .filter(|s| uuid::Uuid::parse_str(s).is_ok())
                        .ok_or("Invalid operation ID")?
                        .to_owned();
                    let started = json!({"id":id,"nonce":request["nonce"],"result":null});
                    local_files::atomic(&journal, &started)?;
                    let cancel = Arc::new(AtomicBool::new(false));
                    bridge.state.lock().unwrap().phase = "starting";
                    bridge.state.lock().unwrap().cancel = Some(cancel.clone());
                    running = Some((
                        id,
                        cancel.clone(),
                        request["deadline"].as_u64().unwrap_or(0),
                        token.clone(),
                    ));
                    let app = app.clone();
                    let request = request.clone();
                    let tx = tx.clone();
                    let journal = journal.clone();
                    std::thread::spawn(move || {
                        let result = perform(&app, &request, cancel)
                            .unwrap_or_else(|e| json!({"failed":true,"text":e}));
                        let limit = if matches!(
                            request["tool"].as_str(),
                            Some("local_skill_bundle" | "local_workspace_bundle")
                        ) {
                            12 * 1024 * 1024
                        } else {
                            1_100_000
                        };
                        let result = if result.to_string().len() > limit {
                            json!({"failed":true,"text":"The local result is too large to transfer. Use a smaller file or less command output."})
                        } else {
                            result
                        };
                        let done =
                            json!({"id":request["id"],"nonce":request["nonce"],"result":result});
                        if local_files::atomic(&journal, &done).is_ok() {
                            let _ = tx.send(done);
                        } else {
                            app.state::<Bridge>().state.lock().unwrap().error =
                                "Could not persist local receipt; operation will not be replayed"
                                    .into();
                        }
                    });
                }
            }
        }
        std::thread::sleep(Duration::from_secs(1));
    }
}
