//! Keep browser transport error pages behind the bundled connection screen.
use serde_json::json;
use std::{
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tauri::Manager;

#[derive(Default)]
pub struct Startup(pub Mutex<u8>, pub AtomicU64, pub Mutex<Option<tauri::Url>>); // 0 loading, 1 ready, 2 timed out

pub fn artifact_frame_navigation(url: &tauri::Url) -> bool {
    url.scheme() == "about" && url.path() == "srcdoc" && url.query().is_none()
}

#[cfg(test)]
mod artifact_navigation_tests {
    #[test]
    fn only_inline_document_frames_bypass_server_navigation() {
        for value in ["about:srcdoc", "about:srcdoc#section"] {
            assert!(super::artifact_frame_navigation(&tauri::Url::parse(value).unwrap()));
        }
        for value in ["about:blank", "about:srcdoc?url=https://evil.test", "data:text/html,hello", "https://evil.test/srcdoc", "tauri://localhost"] {
            assert!(!super::artifact_frame_navigation(&tauri::Url::parse(value).unwrap()));
        }
    }
}

pub fn redirect_installed_version() -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let Ok(exe) = std::env::current_exe() else {
            return false;
        };
        let Some(versions) = exe.parent().and_then(|p| p.parent()) else {
            return false;
        };
        if versions.file_name().is_none_or(|n| n != "versions") {
            return false;
        }
        let Some(root) = versions.parent() else {
            return false;
        };
        let Some(current) = std::fs::read(root.join("current.json")).ok().and_then(|b| {
            serde_json::from_slice::<serde_json::Value>(
                b.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&b),
            )
            .ok()
        }) else {
            return false;
        };
        let Some(version) = current["version"].as_str() else {
            return false;
        };
        let numbers = |v: &str| {
            v.split('.')
                .map(str::parse::<u64>)
                .collect::<Result<Vec<_>, _>>()
                .ok()
                .filter(|v| v.len() == 3)
        };
        let (Some(next), Some(this)) = (numbers(version), numbers(env!("CARGO_PKG_VERSION")))
        else {
            return false;
        };
        if next <= this {
            return false;
        }
        let target = versions.join(version).join("Kindred.exe");
        if target == exe || !target.is_file() {
            return false;
        }
        return std::process::Command::new(&target)
            .args(std::env::args_os().skip(1))
            .current_dir(target.parent().unwrap())
            .creation_flags(0x08000000)
            .spawn()
            .is_ok();
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[tauri::command]
pub fn connection_ready(window: crate::surface::Surface) -> Result<(), String> {
    crate::desktop::trusted(&window, &window.state::<crate::desktop::Desktop>())?;
    let state = window.state::<Startup>();
    let mut stage = state.0.lock().map_err(|e| e.to_string())?;
    if *stage == 2 {
        return Err("Connection timed out. Retry from the connection screen.".into());
    }
    if *stage == 1 {
        return Ok(());
    }
    *stage = 1;
    drop(stage);
    let host = window.state::<crate::profiles::Host>();
    // Once the saved session connects, dismiss startup/recovery UI. Local
    // server updates are managed explicitly from Server administration.
    *host.intent.lock().map_err(|e| e.to_string())? = serde_json::Value::Null;
    if let Some(home) = window.app_handle().get_webview_window("profile-home") {
        let _ = home.close();
    }
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn watch(app: tauri::AppHandle, server: String, key: Option<String>) {
    let generation = {
        let state = app.state::<Startup>();
        let Ok(mut stage) = state.0.lock() else {
            return;
        };
        if *stage == 2 {
            return;
        }
        // Redirects and the webview's own retries belong to the same attempt.
        // They must not continually extend the recovery deadline.
        if *stage == 0 && state.1.load(Ordering::SeqCst) != 0 {
            return;
        }
        *stage = 0;
        state.1.fetch_add(1, Ordering::SeqCst) + 1
    };
    std::thread::spawn(move || {
        // Navigation callbacks must return before dispatching window operations.
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            let state = handle.state::<Startup>();
            if state.1.load(Ordering::SeqCst) == generation
                && state.0.lock().is_ok_and(|stage| *stage == 0)
            {
                if let Some(main) = crate::surface::Surface::main(&handle) {
                    let _ = main.hide();
                }
            }
        });
        for tick in 0..24 {
            std::thread::sleep(Duration::from_millis(500));
            if app.state::<Startup>().1.load(Ordering::SeqCst) != generation
                || app
                    .state::<Startup>()
                    .0
                    .lock()
                    .is_ok_and(|stage| *stage != 0)
            {
                return;
            }
            let handle = app.clone();
            let server = server.clone();
            let key = key.clone();
            let _ = app.run_on_main_thread(move || {
                let state = handle.state::<Startup>();
                let Ok(mut stage) = state.0.lock() else { return; };
                if *stage != 0 || state.1.load(Ordering::SeqCst) != generation { return; }
                let failed = tick == 23;
                if failed { *stage = 2; }
                drop(stage);
                if tick == 1 || failed {
                    let host = handle.state::<crate::profiles::Host>();
                    if let Ok(mut intent) = host.intent.lock() {
                        *intent = json!({"mode":"connection", "server":server, "key":key, "failed":failed});
                    }
                    let _ = crate::profiles::show(&handle);
                }
                if failed {
                    if let Some(main) = crate::surface::Surface::main(&handle) { let _ = main.close(); }
                }
            });
        }
    });
}

// Works with existing Kindred servers, without giving an error document access
// to the workspace. DOMContentLoaded also waits for the module script to load.
pub const READY_SCRIPT: &str = r#"
window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('app') && (document.getElementById('connect-form') || document.getElementById('account-connect'))) {
    window.__TAURI__.core.invoke('connection_ready').catch(() => {});
  }
}, {once:true});
"#;
