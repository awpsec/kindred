//! A local-only downloaded-AppImage installer. Hosted pages can only open it;
//! the install path comes from the native picker, never from web IPC.
use serde_json::{Value, json};
use std::{path::PathBuf, sync::Mutex};
use tauri::Manager;

pub struct Worker(pub Mutex<Inner>);
pub struct Inner {
    selected: Option<PathBuf>,
    busy: bool,
    choosing: bool,
    status: Value,
}
impl Default for Worker {
    fn default() -> Self {
        Self(Mutex::new(Inner {
            selected: None,
            busy: false,
            choosing: false,
            status: json!({"status":"idle","message":"Choose a Kindred AppImage from your downloads."}),
        }))
    }
}
fn bundled(url: &tauri::Url, page: &str) -> bool {
    ((url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost")))
        && url.path() == page
}
fn trusted(window: &tauri::WebviewWindow) -> Result<(), String> {
    if cfg!(target_os = "linux")
        && window.label() == "linux-update"
        && bundled(
            &window.url().map_err(|e| e.to_string())?,
            "/linux-update.html",
        )
    {
        Ok(())
    } else {
        Err("Only the bundled Linux update window can install a client.".into())
    }
}
#[tauri::command]
pub async fn open_linux_update(window: crate::surface::Surface) -> Result<(), String> {
    if !cfg!(target_os = "linux") {
        return Err("AppImage updates require Linux.".into());
    }
    let local = window.label() == "profile-home"
        && bundled(
            &window.url().map_err(|e| e.to_string())?,
            "/profile-home.html",
        );
    if !local {
        crate::desktop::trusted(&window, &window.state::<crate::desktop::Desktop>())?;
    }
    let app = window.app_handle();
    if let Some(existing) = app.get_webview_window("linux-update") {
        existing.show().map_err(|e| e.to_string())?;
        return existing.set_focus().map_err(|e| e.to_string());
    }
    tauri::WebviewWindowBuilder::new(
        app,
        "linux-update",
        tauri::WebviewUrl::App("linux-update.html".into()),
    )
    .title("Kindred · Update client")
    .inner_size(560.0, 500.0)
    .min_inner_size(440.0, 390.0)
    .center()
    .on_navigation(|url| bundled(url, "/linux-update.html"))
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn linux_update_state(
    window: tauri::WebviewWindow,
    worker: tauri::State<'_, Worker>,
) -> Result<Value, String> {
    trusted(&window)?;
    let inner = worker.0.lock().map_err(|e| e.to_string())?;
    let mut value = inner.status.clone();
    value["busy"] = json!(inner.busy || inner.choosing);
    value["filename"] = json!(
        inner
            .selected
            .as_ref()
            .and_then(|p| p.file_name())
            .map(|s| s.to_string_lossy())
    );
    value["rollback"] = json!(
        crate::local_files::install_root()?
            .join("linux/previous/launch")
            .is_file()
    );
    drop(inner);
    value["theme"] = window
        .state::<crate::profiles::Host>()
        .entries
        .lock()
        .map_err(|e| e.to_string())?["theme"]
        .clone();
    Ok(value)
}
#[tauri::command]
pub async fn choose_linux_appimage(window: tauri::WebviewWindow) -> Result<(), String> {
    trusted(&window)?;
    #[cfg(target_os = "linux")]
    {
        {
            let worker = window.state::<Worker>();
            let mut inner = worker.0.lock().map_err(|e| e.to_string())?;
            if inner.busy || inner.choosing {
                return Err("An update action is already running.".into());
            }
            inner.choosing = true;
        }
        let result = choose(window.clone()).await;
        let worker = window.state::<Worker>();
        let mut inner = worker.0.lock().map_err(|e| e.to_string())?;
        inner.choosing = false;
        if let Some(path) = result? {
            inner.selected = Some(path);
            inner.status = json!({"status":"selected","message":"Ready to install this client. Your standalone server and account data stay in place."});
        }
    }
    Ok(())
}
#[cfg(target_os = "linux")]
async fn choose(window: tauri::WebviewWindow) -> Result<Option<PathBuf>, String> {
    use gtk::prelude::*;
    let (send, mut receive) = tauri::async_runtime::channel(1);
    let handle = window.app_handle().clone();
    handle
        .run_on_main_thread(move || {
            let parent = match window.gtk_window() {
                Ok(parent) => parent,
                Err(e) => {
                    let _ = send.try_send(Err(e.to_string()));
                    return;
                }
            };
            let chooser = gtk::FileChooserNative::new(
                Some("Choose a downloaded Kindred AppImage"),
                Some(&parent),
                gtk::FileChooserAction::Open,
                Some("Choose AppImage"),
                Some("Cancel"),
            );
            let filter = gtk::FileFilter::new();
            filter.set_name(Some("AppImage"));
            filter.add_pattern("*.AppImage");
            filter.add_pattern("*.appimage");
            chooser.add_filter(filter);
            gtk::glib::MainContext::default().spawn_local(async move {
                let response = chooser.run_future().await;
                let value = if response == gtk::ResponseType::Accept {
                    chooser.filename()
                } else {
                    None
                };
                chooser.destroy();
                let _ = send.try_send(Ok(value));
            });
        })
        .map_err(|e| e.to_string())?;
    receive
        .recv()
        .await
        .ok_or("The file chooser closed unexpectedly.".to_string())?
}

#[tauri::command]
pub fn install_linux_appimage(window: tauri::WebviewWindow, rollback: bool) -> Result<(), String> {
    trusted(&window)?;
    let app = window.app_handle().clone();
    let selected = {
        let worker = app.state::<Worker>();
        let mut inner = worker.0.lock().map_err(|e| e.to_string())?;
        if inner.busy || inner.choosing {
            return Err("An update action is already running.".into());
        }
        if !rollback && inner.selected.is_none() {
            return Err("Choose an AppImage first.".into());
        }
        inner.busy = true;
        inner.status =
            json!({"status":"checking","message":"Preparing the client update…","progress":0});
        inner.selected.clone()
    };
    std::thread::spawn(move || {
        let result = run_helper(&app, selected, rollback);
        let worker = app.state::<Worker>();
        let mut inner = worker.0.lock().unwrap();
        inner.busy = false;
        if rollback && result.is_ok() {
            inner.selected = None;
        }
        if let Err(message) = result {
            inner.status = json!({"status":"error","message":message});
        }
    });
    Ok(())
}
fn clean_command(command: &mut std::process::Command) {
    for (key, _) in std::env::vars_os() {
        let key = key.to_string_lossy();
        if key.starts_with("GST_")
            || matches!(
                key.as_ref(),
                "LD_LIBRARY_PATH"
                    | "LD_PRELOAD"
                    | "GTK_PATH"
                    | "GTK_EXE_PREFIX"
                    | "GTK_DATA_PREFIX"
                    | "GIO_MODULE_DIR"
                    | "GSETTINGS_SCHEMA_DIR"
                    | "GDK_PIXBUF_MODULE_FILE"
                    | "GDK_PIXBUF_MODULEDIR"
                    | "APPIMAGE"
                    | "ARGV0"
                    | "OWD"
                    | "KINDRED_ACCESS_TOKEN"
            )
        {
            command.env_remove(key.as_ref());
        }
    }
}
fn helper_path(root: &std::path::Path) -> Result<PathBuf, String> {
    use std::io::Write;
    let folder = root.join("linux");
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let path = folder.join("update.py");
    let temporary = folder.join(format!(".helper-{}.py", uuid::Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(include_bytes!("../linux/update.py"))?;
        file.sync_all()?;
        std::fs::rename(&temporary, &path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result.map_err(|e| e.to_string())?;
    Ok(path)
}
fn run_helper(
    app: &tauri::AppHandle,
    selected: Option<PathBuf>,
    rollback: bool,
) -> Result<(), String> {
    install(selected, rollback, None, |value| {
        app.state::<Worker>().0.lock().unwrap().status = value
    })
}
pub(crate) fn install(
    selected: Option<PathBuf>,
    rollback: bool,
    expected_sha: Option<&str>,
    progress: impl Fn(Value),
) -> Result<(), String> {
    use std::io::{BufRead, BufReader};
    let root = crate::local_files::install_root()?;
    let helper = helper_path(&root)?;
    let mut command = std::process::Command::new("python3");
    clean_command(&mut command);
    command.arg("-I").arg(helper).arg("--json");
    if rollback {
        command.arg("--rollback");
    } else {
        command.arg(selected.ok_or("Choose an AppImage first.")?);
    }
    if let Some(hash) = expected_sha {
        command.arg("--sha256").arg(hash);
    }
    let mut child = command
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start the updater. Python 3 is required: {e}"))?;
    let mut status = json!({});
    for line in BufReader::new(child.stdout.take().unwrap()).lines() {
        if let Ok(value) = line
            .map_err(|e| e.to_string())
            .and_then(|s| serde_json::from_str::<Value>(&s).map_err(|e| e.to_string()))
        {
            if value["status"].is_string() {
                status = value.clone();
                progress(value);
            }
        }
    }
    let exit = child.wait().map_err(|e| e.to_string())?;
    if !exit.success() || status["status"] != "ready" {
        return Err(status["message"]
            .as_str()
            .filter(|_| status["status"] == "error")
            .unwrap_or(
                "The updater stopped. Your current client is still running; retry the update.",
            )
            .into());
    }
    Ok(())
}
pub(crate) fn launch_installed(handle: &tauri::AppHandle) -> Result<(), String> {
    let launcher = crate::local_files::install_root()?.join("bin/kindred");
    let mut command = std::process::Command::new(launcher);
    clean_command(&mut command);
    command
        .env_remove("APPDIR")
        .env_remove(crate::session_handoff::ENV);
    if let Some(handoff) = crate::profiles::update_handoff(handle)? {
        command.env(
            crate::session_handoff::ENV,
            serde_json::to_string(&handoff).map_err(|e| e.to_string())?,
        );
    }
    let mut child = command
        .stdin(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    std::thread::sleep(std::time::Duration::from_millis(1200));
    if child.try_wait().map_err(|e| e.to_string())?.is_some() {
        return Err("The new client closed during startup. This window is still available; restore the previous client or repair its dependencies.".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn restart_linux_client(window: tauri::WebviewWindow) -> Result<(), String> {
    trusted(&window)?;
    let app = window.app_handle().clone();
    {
        let worker = app.state::<Worker>();
        let mut inner = worker.0.lock().map_err(|e| e.to_string())?;
        if inner.busy || inner.status["status"] != "ready" {
            return Err("Finish installing the client first.".into());
        }
        inner.busy = true;
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.eval("window.dispatchEvent(new Event('kindred-before-client-restart'))");
    }
    crate::window_state::flush(&app);
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || launch_installed(&handle))
        .await
        .map_err(|e| e.to_string())
        .and_then(|r| r);
    if result.is_ok() {
        app.exit(0);
    }
    app.state::<Worker>().0.lock().unwrap().busy = false;
    result
}
#[cfg(target_os = "linux")]
pub fn desktop_exec_arg(path: &str) -> Result<String, String> {
    if !std::path::Path::new(path).is_absolute() || path.chars().any(char::is_control) {
        return Err("Unsupported application path for startup".into());
    }
    let mut escaped = String::new();
    for ch in path.chars() {
        if matches!(ch, '\\' | '"' | '`' | '$') {
            escaped.push('\\');
        }
        escaped.push(ch);
    }
    Ok(format!(
        "\"{}\"",
        escaped.replace('\\', "\\\\").replace('%', "%%")
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "linux")]
    #[test]
    fn startup_path_escapes_desktop_fields_without_shell_expansion() {
        assert_eq!(
            desktop_exec_arg("/home/user/50%/Kindred").unwrap(),
            "\"/home/user/50%%/Kindred\""
        );
        assert_eq!(
            desktop_exec_arg("/home/user/$dir/Kindred").unwrap(),
            "\"/home/user/\\\\$dir/Kindred\""
        );
        assert!(desktop_exec_arg("relative/Kindred").is_err());
        assert!(desktop_exec_arg("/home/user/\nKindred").is_err());
    }
    #[test]
    fn installer_surface_must_be_exactly_bundled() {
        assert!(bundled(
            &"tauri://localhost/linux-update.html".parse().unwrap(),
            "/linux-update.html"
        ));
        for bad in [
            "https://tauri.localhost/linux-update.html",
            "https://server/linux-update.html",
            "tauri://localhost/profile-home.html",
            "tauri://other/linux-update.html",
        ] {
            assert!(!bundled(&bad.parse().unwrap(), "/linux-update.html"));
        }
    }
}
