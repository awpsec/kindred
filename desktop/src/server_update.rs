//! Signed release updates for native Mac and Linux clients.
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
};
use tauri::Manager;
pub struct Worker {
    inner: Mutex<Inner>,
    cancelled: AtomicBool,
}
struct Inner {
    busy: bool,
    status: Value,
    ready: bool,
    target: Option<PathBuf>,
}
impl Default for Worker {
    fn default() -> Self {
        Self {
            inner: Mutex::new(Inner {
                busy: false,
                status: json!({"status":"idle"}),
                ready: false,
                target: None,
            }),
            cancelled: AtomicBool::new(false),
        }
    }
}
fn status(app: &tauri::AppHandle, value: Value) {
    app.state::<Worker>().inner.lock().unwrap().status = value;
}
pub fn state(app: &tauri::AppHandle) -> Value {
    app.state::<Worker>().inner.lock().unwrap().status.clone()
}
pub fn cancel(app: &tauri::AppHandle) {
    let worker = app.state::<Worker>();
    let inner = worker.inner.lock().unwrap();
    // Once replacement starts, closing the window leaves installation running.
    if !inner.ready && inner.status["status"] != "installing" {
        worker.cancelled.store(true, Ordering::Relaxed);
    }
}
pub fn begin(app: &tauri::AppHandle) -> Result<(), String> {
    {
        let worker = app.state::<Worker>();
        let mut inner = worker.inner.lock().map_err(|e| e.to_string())?;
        if inner.busy || inner.ready {
            return Ok(());
        }
        inner.busy = true;
        worker.cancelled.store(false, Ordering::Relaxed);
        inner.status = json!({"status":"checking","message":"Checking for a signed app update…","installed":env!("CARGO_PKG_VERSION")});
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        let result = install(&handle);
        let worker = handle.state::<Worker>();
        let mut inner = worker.inner.lock().unwrap();
        inner.busy = false;
        if let Err(error) = result {
            inner.status = json!({"status":if worker.cancelled.load(Ordering::Relaxed){"cancelled"}else{"error"},"message":error});
        }
    });
    Ok(())
}
fn install(app: &tauri::AppHandle) -> Result<(), String> {
    let origin = app.state::<crate::desktop::Desktop>().origin.clone();
    let release = crate::client_release::check(&origin)?;
    if crate::client_release::version(&release.version)
        <= crate::client_release::version(env!("CARGO_PKG_VERSION"))
    {
        status(
            app,
            json!({"status":"current","message":"Kindred is up to date on this computer.","version":env!("CARGO_PKG_VERSION"),"progress":100}),
        );
        return Ok(());
    }
    let folder =
        crate::local_files::install_root()?.join(format!("client-update-{}", uuid::Uuid::new_v4()));
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        std::fs::DirBuilder::new()
            .mode(0o700)
            .create(&folder)
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(unix))]
    std::fs::create_dir(&folder).map_err(|e| e.to_string())?;
    let result = (|| {
        let worker = app.state::<Worker>();
        let file = folder.join(crate::client_release::filename(
            crate::client_release::platform(),
            &release.version,
        )?);
        crate::client_release::download(
            &origin,
            &release,
            &file,
            &worker.cancelled,
            |received, total| {
                status(
                    app,
                    json!({"status":"downloading","message":"Downloading the signed client from your Kindred server…","progress":received*70/total,"version":release.version,"received":received,"total":total}),
                );
            },
        )?;
        if worker.cancelled.load(Ordering::Relaxed) {
            return Err("Update cancelled. Your client was kept.".into());
        }
        status(
            app,
            json!({"status":"installing","message":"Installing the verified client. Your accounts and standalone server stay in place.","progress":75,"version":release.version}),
        );
        #[cfg(target_os = "linux")]
        crate::linux_update::install(
            Some(file),
            false,
            Some(&release.package(crate::client_release::platform())?.sha256),
            |value| {
                status(
                    app,
                    json!({"status":"installing","message":value["message"],"progress":75+value["progress"].as_u64().unwrap_or(0)/5,"version":release.version}),
                );
            },
        )?;
        #[cfg(target_os = "macos")]
        let target = Some(crate::mac_update::install(
            &file,
            &release.version,
            &worker.cancelled,
        )?);
        #[cfg(not(target_os = "macos"))]
        let target = None;
        #[cfg(not(any(target_os = "linux", target_os = "macos")))]
        return Err("No server updater for this platform".into());
        let mut inner = worker.inner.lock().unwrap();
        inner.ready = true;
        inner.target = target;
        inner.status = json!({"status":"ready","message":"Client update installed. Restart Kindred to use it. Your server was not changed.","version":release.version,"progress":100});
        Ok(())
    })();
    let _ = std::fs::remove_dir_all(&folder);
    result
}
pub async fn restart(app: tauri::AppHandle) -> Result<(), String> {
    {
        let worker = app.state::<Worker>();
        let mut inner = worker.inner.lock().map_err(|e| e.to_string())?;
        if !inner.ready || inner.busy {
            return Err("Finish installing the client first".into());
        }
        inner.busy = true;
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.eval("window.dispatchEvent(new Event('kindred-before-client-restart'))");
    }
    crate::window_state::flush(&app);
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        #[cfg(target_os = "linux")]
        {
            return crate::linux_update::launch_installed(&handle);
        }
        #[cfg(target_os = "macos")]
        {
            let target = handle
                .state::<Worker>()
                .inner
                .lock()
                .unwrap()
                .target
                .clone()
                .ok_or("Missing installed app")?;
            return crate::mac_update::launch(&handle, &target);
        }
        #[cfg(not(any(target_os = "linux", target_os = "macos")))]
        Err("Restart unavailable on this platform".into())
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);
    if result.is_ok() {
        app.exit(0);
    } else {
        app.state::<Worker>().inner.lock().unwrap().busy = false;
    }
    result
}
