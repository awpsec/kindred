//! OS-provided drops are one-use grants; the page cannot request arbitrary paths.
use crate::{
    desktop::{self, Desktop},
    surface::Surface,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use std::{
    io::Read,
    path::PathBuf,
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::Manager;
const LIMIT: u64 = 8 * 1024 * 1024;
struct DropGrant {
    id: String,
    paths: Vec<PathBuf>,
    session: String,
    created: Instant,
}
#[derive(Default)]
pub struct Input(Mutex<Option<DropGrant>>);
fn scope(app: &tauri::AppHandle) -> String {
    app.state::<Desktop>().session_token()
}
pub fn dropped(view: &tauri::Webview, event: &tauri::DragDropEvent) {
    if view.label() != "main"
        || !view
            .url()
            .is_ok_and(|u| u.origin() == view.state::<Desktop>().origin.origin())
    {
        return;
    }
    let scale = view.window().scale_factor().unwrap_or(1.0);
    let payload = match event {
        tauri::DragDropEvent::Enter { position, .. } | tauri::DragDropEvent::Over { position } => {
            json!({"kind":"over","x":position.x/scale,"y":position.y/scale})
        }
        tauri::DragDropEvent::Leave => json!({"kind":"leave"}),
        tauri::DragDropEvent::Drop { paths, position } => {
            let id = uuid::Uuid::new_v4().to_string();
            *view.state::<Input>().0.lock().unwrap() = Some(DropGrant {
                id: id.clone(),
                paths: paths.clone(),
                session: scope(view.app_handle()),
                created: Instant::now(),
            });
            json!({"kind":"drop","ticket":id,"x":position.x/scale,"y":position.y/scale})
        }
        _ => return,
    };
    let _ = view.eval(&format!(
        "window.dispatchEvent(new CustomEvent('kindred-native-file-drop',{{detail:{payload}}}));"
    ));
}
fn read_files(paths: Vec<PathBuf>) -> Result<Vec<Value>, String> {
    if paths.len() > 5 {
        return Err("Attach up to five files per message.".into());
    }
    paths
        .into_iter()
        .map(|path| {
            let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
            if !meta.is_file() {
                return Err("Drop files, not folders.".into());
            }
            if meta.len() > LIMIT {
                return Err("Files are limited to 8 MB each.".into());
            }
            let mut bytes = Vec::new();
            std::fs::File::open(&path)
                .map_err(|e| e.to_string())?
                .take(LIMIT + 1)
                .read_to_end(&mut bytes)
                .map_err(|e| e.to_string())?;
            if bytes.len() as u64 > LIMIT {
                return Err("Files are limited to 8 MB each.".into());
            }
            let name = path
                .file_name()
                .ok_or("The file has no name")?
                .to_string_lossy();
            Ok(json!({"name":name,"data":STANDARD.encode(bytes)}))
        })
        .collect()
}
#[tauri::command]
pub async fn read_dropped_files(
    window: Surface,
    app: tauri::AppHandle,
    ticket: String,
) -> Result<Vec<Value>, String> {
    desktop::trusted(&window, &app.state::<Desktop>())?;
    let grant = app
        .state::<Input>()
        .0
        .lock()
        .unwrap()
        .take()
        .ok_or("Drop the files again.")?;
    if grant.id != ticket
        || grant.created.elapsed() > Duration::from_secs(30)
        || grant.session != scope(&app)
    {
        return Err("This drop expired. Drop the files again.".into());
    }
    let result = tauri::async_runtime::spawn_blocking(move || read_files(grant.paths))
        .await
        .map_err(|e| e.to_string())??;
    desktop::trusted(&window, &app.state::<Desktop>())?;
    if grant.session != scope(&app) {
        return Err("The account changed during the drop.".into());
    }
    Ok(result)
}
#[tauri::command]
pub async fn read_clipboard_image(
    window: Surface,
    app: tauri::AppHandle,
) -> Result<Option<Value>, String> {
    desktop::trusted(&window, &app.state::<Desktop>())?;
    #[cfg(target_os = "linux")]
    {
        let session = scope(&app);
        let (tx, rx) = std::sync::mpsc::sync_channel(1);
        app.run_on_main_thread(move || {
            gtk::Clipboard::get(&gtk::gdk::SELECTION_CLIPBOARD).request_image(move |_, image| {
                let result = image.map(|image| {
                    if i64::from(image.width()) * i64::from(image.height()) > 32_000_000 {
                        return Err("Clipboard image is too large.".to_string());
                    }
                    let bytes = image.save_to_bufferv("png", &[]).map_err(|e| e.to_string())?;
                    if bytes.len() as u64 > LIMIT {
                        return Err("Files are limited to 8 MB each.".into());
                    }
                    Ok(json!({"name":"Screenshot.png","mime":"image/png","data":STANDARD.encode(bytes)}))
                }).transpose();
                let _ = tx.send(result);
            });
        }).map_err(|e| e.to_string())?;
        let result = tauri::async_runtime::spawn_blocking(move || {
            rx.recv_timeout(Duration::from_secs(10))
                .map_err(|_| "Clipboard did not respond. Copy the image again.".to_string())
        })
        .await
        .map_err(|e| e.to_string())???;
        desktop::trusted(&window, &app.state::<Desktop>())?;
        if session != scope(&app) {
            return Err("The account changed during paste.".into());
        }
        return Ok(result);
    }
    #[cfg(not(target_os = "linux"))]
    Ok(None)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dropped_files_are_bounded_and_preserve_bytes() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir(&dir).unwrap();
        let path = dir.join("image.png");
        std::fs::write(&path, b"exact image bytes").unwrap();
        let files = read_files(vec![path.clone()]).unwrap();
        assert_eq!(files[0]["data"], STANDARD.encode(b"exact image bytes"));
        assert!(read_files(vec![dir.clone()]).is_err());
        assert!(read_files(vec![path.clone(); 6]).is_err());
        let file = std::fs::File::create(&path).unwrap();
        file.set_len(LIMIT + 1).unwrap();
        assert!(read_files(vec![path]).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
