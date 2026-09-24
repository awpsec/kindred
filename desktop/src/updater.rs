use serde_json::Value;
#[cfg(windows)]
use serde_json::json;
#[cfg(windows)]
use std::{path::PathBuf, sync::Mutex};
use tauri::Manager;

#[derive(Default)]
pub struct Worker(#[cfg(windows)] pub Mutex<Option<std::process::Child>>);
#[cfg(windows)]
fn root() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    exe.parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .map(PathBuf::from)
        .ok_or("Kindred is not installed.".into())
}
pub(crate) fn trusted(window: &tauri::WebviewWindow) -> Result<(), String> {
    let url = window.url().map_err(|e| e.to_string())?;
    if window.label() == "updater"
        && ((url.scheme() == "tauri" && url.host_str() == Some("localhost"))
            || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost")))
        && url.path() == "/updater.html"
    {
        Ok(())
    } else {
        Err("Only the local update window can use this command.".into())
    }
}
pub fn show(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("updater") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        if let Ok(window) = tauri::WebviewWindowBuilder::new(
            &handle,
            "updater",
            tauri::WebviewUrl::App("updater.html".into()),
        )
        .title("Kindred update")
        .inner_size(440.0, 270.0)
        .resizable(false)
        .center()
        .on_navigation(|u| u.scheme() == "tauri" || u.host_str() == Some("tauri.localhost"))
        .build()
        {
            let close_handle = handle.clone();
            window.on_window_event(move |event| {
                if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                    #[cfg(not(windows))]
                    crate::server_update::cancel(&close_handle);
                    #[cfg(windows)]
                    if let Ok(root) = root() {
                        let _ = std::fs::write(root.join("update.cancel"), "cancel");
                    }
                }
            });
            let _ = window.set_focus();
        }
    });
}
#[tauri::command]
pub async fn begin_update(
    window: tauri::WebviewWindow,
    _worker: tauri::State<'_, Worker>,
) -> Result<(), String> {
    trusted(&window)?;
    #[cfg(not(windows))]
    return crate::server_update::begin(window.app_handle());
    #[cfg(windows)]
    {
        let mut child = _worker.0.lock().map_err(|e| e.to_string())?;
        if let Some(c) = child.as_mut() {
            if c.try_wait().map_err(|e| e.to_string())?.is_none() {
                return Ok(());
            }
        }
        let root = root()?;
        let _ = std::fs::remove_file(root.join("update.cancel"));
        std::fs::write(
            root.join("update-status.json"),
            json!({"status":"checking","message":"Connecting to your release stream","progress":0})
                .to_string(),
        )
        .map_err(|e| e.to_string())?;
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let helper = std::env::current_exe()
                .map_err(|e| e.to_string())?
                .parent()
                .unwrap()
                .join("Update-Kindred.ps1");
            if !helper.is_file() {
                return Err(
                    "The updater is missing. Reinstall Kindred from its signed release package."
                        .into(),
                );
            }
            crate::window_state::flush(window.app_handle());
            let handoff = crate::profiles::update_handoff(window.app_handle())?;
            let mut command = std::process::Command::new("powershell.exe");
            command
                .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
                .arg(helper)
                .arg("-NoUi")
                .arg("-AppPid")
                .arg(std::process::id().to_string())
                .env_remove("KINDRED_ACCESS_TOKEN")
                .env_remove("PSModulePath")
                .env_remove(crate::session_handoff::ENV)
                .creation_flags(0x08000000);
            if let Some(handoff) = handoff {
                command.env(
                    crate::session_handoff::ENV,
                    serde_json::to_string(&handoff)
                        .map_err(|_| "Could not prepare the update session")?,
                );
            }
            *child = Some(
                command
                    .spawn()
                    .map_err(|e| format!("Could not start updater: {e}"))?,
            );
            Ok(())
        }
    }
}
#[tauri::command]
pub async fn update_status(
    window: tauri::WebviewWindow,
    _worker: tauri::State<'_, Worker>,
) -> Result<Value, String> {
    trusted(&window)?;
    #[cfg(not(windows))]
    return Ok(crate::server_update::state(window.app_handle()));
    #[cfg(windows)]
    {
        let path = root()?.join("update-status.json");
        let data = std::fs::read(path).map_err(|e| e.to_string())?;
        if data.len() > 16384 {
            return Err("Invalid update status.".into());
        }
        let mut status: Value = serde_json::from_slice(&data).map_err(|e| e.to_string())?;
        if let Some(child) = _worker.0.lock().map_err(|e| e.to_string())?.as_mut() {
            if let Some(exit) = child.try_wait().map_err(|e| e.to_string())? {
                if !exit.success() && status["status"] != "error" {
                    status = json!({"status":"error","message":"The updater stopped. Your installed version was kept. Close this window and try again."});
                }
            }
        }
        Ok(status)
    }
}
#[tauri::command]
pub async fn close_update(window: tauri::WebviewWindow) -> Result<(), String> {
    trusted(&window)?;
    #[cfg(not(windows))]
    crate::server_update::cancel(window.app_handle());
    #[cfg(windows)]
    std::fs::write(root()?.join("update.cancel"), "cancel").map_err(|e| e.to_string())?;
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restart_update(window: tauri::WebviewWindow) -> Result<(), String> {
    trusted(&window)?;
    crate::server_update::restart(window.app_handle().clone()).await
}
