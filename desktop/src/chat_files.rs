//! Save authenticated chat deliverables; reveal/open only receipts issued here.
#[path = "chat_downloads.rs"]
mod chat_downloads;
#[path = "markdown_download.rs"]
mod markdown_download;
use crate::{
    desktop::{self, Desktop},
    surface::Surface,
};
use chat_downloads::{DownloadIndex, SavedFile};
use serde_json::{Value, json};
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::Manager;
#[derive(Default)]
pub struct Downloads(pub Mutex<Option<DownloadIndex>>);
fn with_index<T>(
    window: &Surface,
    downloads: &Downloads,
    action: impl FnOnce(&mut DownloadIndex) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = downloads.0.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        let file = window
            .app_handle()
            .path()
            .app_local_data_dir()
            .map_err(|e| e.to_string())?
            .join("chat-downloads.json");
        *guard = Some(DownloadIndex::load(file));
    }
    action(guard.as_mut().unwrap())
}
#[tauri::command]
pub async fn saved_chat_file(
    window: Surface,
    state: tauri::State<'_, Desktop>,
    downloads: tauri::State<'_, Downloads>,
    id: String,
) -> Result<Option<String>, String> {
    desktop::trusted(&window, &state)?;
    uuid::Uuid::parse_str(&id).map_err(|_| "Invalid chat file")?;
    with_index(&window, &downloads, |index| {
        Ok(index.find(&id, &session_scope(&state)))
    })
}
fn session_scope(state: &Desktop) -> String {
    let identity = format!(
        "{}\n{}",
        state.origin.origin().ascii_serialization(),
        state.session_token()
    );
    ring::digest::digest(&ring::digest::SHA256, identity.as_bytes())
        .as_ref()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
fn filename(header: &str) -> Result<String, String> {
    let encoded = header
        .strip_prefix("attachment; filename*=UTF-8''")
        .ok_or("The file has no valid download name")?;
    let mut bytes = Vec::new();
    let input = encoded.as_bytes();
    let mut i = 0;
    while i < input.len() {
        if input[i] == b'%' {
            if i + 2 >= input.len() {
                return Err("Invalid download name".into());
            }
            let hi = (input[i + 1] as char)
                .to_digit(16)
                .ok_or("Invalid download name")?;
            let lo = (input[i + 2] as char)
                .to_digit(16)
                .ok_or("Invalid download name")?;
            bytes.push((hi * 16 + lo) as u8);
            i += 3;
        } else {
            bytes.push(input[i]);
            i += 1;
        }
    }
    let name = String::from_utf8(bytes).map_err(|_| "Invalid download name")?;
    if name.is_empty()
        || name.len() > 240
        || name
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
        || name.ends_with(['.', ' '])
        || matches!(name.as_str(), "." | "..")
    {
        return Err("This file name cannot be saved on this computer".into());
    }
    let base = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if matches!(base.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ["COM", "LPT"].iter().any(|p| {
            base.strip_prefix(p)
                .is_some_and(|n| matches!(n, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"))
        })
    {
        return Err("Reserved download name".into());
    }
    Ok(name)
}
fn save_unique(directory: &Path, name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    std::fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let directory = directory.canonicalize().map_err(|e| e.to_string())?;
    let path = Path::new(name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let suffix = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| format!(".{s}"))
        .unwrap_or_default();
    for n in 0..1000 {
        let path = directory.join(if n == 0 {
            name.to_owned()
        } else {
            format!("{stem} ({n}){suffix}")
        });
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(mut file) => {
                if let Err(e) = file.write_all(bytes).and_then(|_| file.sync_all()) {
                    let _ = std::fs::remove_file(&path);
                    return Err(e.to_string());
                }
                return Ok(path);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("Too many files with this name in Downloads".into())
}
#[tauri::command]
pub async fn save_chat_file(
    window: Surface,
    state: tauri::State<'_, Desktop>,
    downloads: tauri::State<'_, Downloads>,
    id: String,
) -> Result<String, String> {
    save_file(window, state, downloads, id, None).await
}
#[tauri::command]
pub async fn save_chat_file_progress(
    window: Surface,
    state: tauri::State<'_, Desktop>,
    downloads: tauri::State<'_, Downloads>,
    id: String,
    on_progress: tauri::ipc::Channel<Value>,
) -> Result<String, String> {
    save_file(window, state, downloads, id, Some(on_progress)).await
}
async fn save_file(
    window: Surface,
    state: tauri::State<'_, Desktop>,
    downloads: tauri::State<'_, Downloads>,
    id: String,
    on_progress: Option<tauri::ipc::Channel<Value>>,
) -> Result<String, String> {
    desktop::trusted(&window, &state)?;
    uuid::Uuid::parse_str(&id).map_err(|_| "Invalid chat file")?;
    let token = state.session_token();
    if token.is_empty() {
        return Err("Connect to the workspace before downloading".into());
    }
    let origin = session_scope(&state);
    let url = state
        .origin
        .join(&format!("/api/deliverables/{id}"))
        .map_err(|e| e.to_string())?;
    let directory = window
        .app_handle()
        .path()
        .download_dir()
        .map_err(|e| e.to_string())?;
    let path = tauri::async_runtime::spawn_blocking(move || -> Result<PathBuf, String> {
        let client = reqwest::blocking::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| e.to_string())?;
        let mut response = client
            .get(url)
            .bearer_auth(token)
            .send()
            .map_err(|_| "Could not download the file. Check your connection.")?;
        if !response.status().is_success() {
            return Err(format!(
                "The file could not be downloaded ({}).",
                response.status()
            ));
        }
        let name = filename(
            response
                .headers()
                .get("content-disposition")
                .and_then(|v| v.to_str().ok())
                .unwrap_or(""),
        )?;
        let total = response.content_length();
        if total.is_some_and(|n| n > 8 * 1024 * 1024) {
            return Err("File exceeds the chat download limit".into());
        }
        let mut bytes = Vec::new();
        let mut chunk = [0u8; 32 * 1024];
        let mut last = std::time::Instant::now() - Duration::from_secs(1);
        loop {
            let count = response.read(&mut chunk).map_err(|e| e.to_string())?;
            if count == 0 {
                break;
            }
            if bytes.len() + count > 8 * 1024 * 1024 {
                return Err("File exceeds the chat download limit".into());
            }
            bytes.extend_from_slice(&chunk[..count]);
            if last.elapsed() >= Duration::from_millis(80) {
                if let Some(channel) = &on_progress {
                    let _ = channel.send(json!({"received":bytes.len(),"total":total}));
                }
                last = std::time::Instant::now();
            }
        }
        if total.is_some_and(|n| n != bytes.len() as u64) {
            return Err("The download was incomplete. Try again.".into());
        }
        if let Some(channel) = &on_progress {
            let _ = channel.send(json!({"received":bytes.len(),"total":bytes.len()}));
        }
        save_unique(&directory, &name, &bytes)
    })
    .await
    .map_err(|e| e.to_string())??;
    desktop::trusted(&window, &state)?;
    if origin != session_scope(&state) {
        return Err("The connected workspace changed while downloading. Download it again from the current chat.".into());
    }
    let receipt = uuid::Uuid::new_v4().to_string();
    with_index(&window, &downloads, |index| {
        index.insert(
            receipt.clone(),
            SavedFile {
                scope: origin,
                file_id: id,
                path,
            },
        )
    })?;
    Ok(receipt)
}
#[tauri::command]
pub async fn reveal_chat_file(
    window: Surface,
    state: tauri::State<'_, Desktop>,
    downloads: tauri::State<'_, Downloads>,
    receipt: String,
) -> Result<Value, String> {
    desktop::trusted(&window, &state)?;
    let path = with_index(&window, &downloads, |index| {
        index
            .get(&receipt, &session_scope(&state))
            .map(|r| r.path.clone())
            .ok_or_else(|| "This download was moved or removed. Download it again.".into())
    })?;
    if !path.is_file() {
        return Err("This download was moved or removed. Download it again.".into());
    }
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            std::process::Command::new("explorer.exe")
                .arg(format!("/select,{}", path.display()))
                .creation_flags(0x08000000)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg("-R")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        #[cfg(all(unix, not(target_os = "macos")))]
        {
            open::that_detached(path.parent().ok_or("Download folder missing")?)
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?;
    result?;
    Ok(json!({"ok":true}))
}
// A receipt, not a page-supplied path, identifies the saved Markdown file.
#[tauri::command]
pub async fn open_chat_file(
    window: Surface,
    state: tauri::State<'_, Desktop>,
    downloads: tauri::State<'_, Downloads>,
    receipt: String,
) -> Result<Value, String> {
    desktop::trusted(&window, &state)?;
    let path = with_index(&window, &downloads, |index| {
        index
            .get(&receipt, &session_scope(&state))
            .map(|r| r.path.clone())
            .ok_or_else(|| "This download was moved or removed. Download it again.".into())
    })?;
    let path = markdown_download::checked_path(&path)?;
    open::that_detached(path).map_err(|_| "The file could not be opened. Choose a default app for Markdown files in your computer settings.".to_string())?;
    Ok(json!({"ok":true}))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn names_and_collision_safe_downloads() {
        for name in [
            "../secret",
            "CON.txt",
            "C:\\secret",
            "x:y",
            "a/../b",
            "a.",
            "file\n.txt",
        ] {
            let header = format!(
                "attachment; filename*=UTF-8''{}",
                name.bytes()
                    .map(|b| format!("%{b:02X}"))
                    .collect::<String>()
            );
            assert!(filename(&header).is_err(), "{name}");
        }
        assert_eq!(
            filename("attachment; filename*=UTF-8''report%20one.docx").unwrap(),
            "report one.docx"
        );
        let dir = std::env::temp_dir().join(format!("kindred-download-{}", uuid::Uuid::new_v4()));
        let first = save_unique(&dir, "report.txt", b"original").unwrap();
        let second = save_unique(&dir, "report.txt", b"revision").unwrap();
        assert_ne!(first, second);
        assert_eq!(std::fs::read(first).unwrap(), b"original");
        assert_eq!(std::fs::read(second).unwrap(), b"revision");
        std::fs::remove_dir_all(dir).unwrap();
    }
}
