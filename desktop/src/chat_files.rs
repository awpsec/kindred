//! Save only authenticated chat deliverables; reveal only receipts issued here.
use crate::{
    desktop::{self, Desktop},
    surface::Surface,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::Manager;
#[derive(Default)]
pub struct Downloads(pub Mutex<HashMap<String, (String, PathBuf)>>);
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
        let response = client
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
        let mut bytes = Vec::new();
        response
            .take(8 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > 8 * 1024 * 1024 {
            return Err("File exceeds the chat download limit".into());
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
    downloads
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .insert(receipt.clone(), (origin, path));
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
    let (origin, path) = downloads
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .get(&receipt)
        .cloned()
        .ok_or("Download this file first")?;
    if origin != session_scope(&state) {
        return Err("This download belongs to another workspace session".into());
    }
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
