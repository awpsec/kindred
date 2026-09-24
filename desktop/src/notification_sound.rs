//! Original short notification cue; never replace another application's sounds.
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
#[cfg(not(windows))]
use {std::path::PathBuf, tauri::Manager};

pub const WAV: &[u8] = include_bytes!("../../ui/audio/kindred-pop.wav");
#[cfg(not(windows))]
const NAME: &str = "Kindred-Pop-v1.wav";
static LAST_SOUND: Mutex<Option<Instant>> = Mutex::new(None);

pub fn allow(force: bool) -> bool {
    let mut last = LAST_SOUND.lock().unwrap();
    let now = Instant::now();
    if !force && last.is_some_and(|at| now.duration_since(at) < Duration::from_millis(750)) {
        return false;
    }
    *last = Some(now);
    true
}

#[cfg(not(windows))]
pub fn file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    let folder = app
        .path()
        .home_dir()
        .map_err(|e| e.to_string())?
        .join("Library/Sounds");
    #[cfg(not(target_os = "macos"))]
    let folder = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("sounds");
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let path = folder.join(NAME);
    if std::fs::read(&path).ok().as_deref() != Some(WAV) {
        let temporary = folder.join(format!(".kindred-pop-{}.wav", uuid::Uuid::new_v4()));
        std::fs::write(&temporary, WAV).map_err(|e| e.to_string())?;
        if let Err(error) = std::fs::rename(&temporary, &path) {
            let _ = std::fs::remove_file(&temporary);
            return Err(error.to_string());
        }
    }
    Ok(path)
}

#[cfg(target_os = "macos")]
pub fn name() -> &'static str {
    NAME
}

#[cfg(windows)]
pub fn play_windows(notifier: &windows::UI::Notifications::ToastNotifier, force: bool) {
    use windows::UI::Notifications::{
        NotificationSetting, ToastNotificationManager, ToastNotificationMode,
    };
    use windows_sys::Win32::{
        Media::Audio::{PlaySoundW, SND_ASYNC, SND_MEMORY, SND_NODEFAULT, SND_NOSTOP, SND_SYSTEM},
        UI::Shell::{QUNS_ACCEPTS_NOTIFICATIONS, SHQueryUserNotificationState},
    };
    if notifier.Setting().ok() != Some(NotificationSetting::Enabled) {
        return;
    }
    // This WinRT mode includes Do Not Disturb / Focus Assist, which the
    // older shell query alone cannot establish. Unsupported versions stay quiet.
    if ToastNotificationManager::GetDefault()
        .and_then(|manager| manager.NotificationMode())
        .ok()
        != Some(ToastNotificationMode::Unrestricted)
    {
        return;
    }
    // Honor the shell's notification state and global/per-app sound switches.
    // Query failure stays quiet. No registry settings are modified here.
    let mut state = 0;
    if unsafe { SHQueryUserNotificationState(&mut state) } < 0
        || state != QUNS_ACCEPTS_NOTIFICATIONS
    {
        return;
    }
    let current = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    let path = "Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings";
    for (key, value) in [
        (
            path.to_owned(),
            "NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND",
        ),
        (format!("{path}\\dev.kindred.personal"), "SoundEnabled"),
    ] {
        if current
            .open_subkey(key)
            .ok()
            .and_then(|key| key.get_value::<u32, _>(value).ok())
            == Some(0)
        {
            return;
        }
    }
    if allow(force) {
        // Static PCM remains alive for the whole asynchronous playback.
        unsafe {
            PlaySoundW(
                WAV.as_ptr().cast(),
                std::ptr::null_mut(),
                SND_MEMORY | SND_ASYNC | SND_NODEFAULT | SND_SYSTEM | SND_NOSTOP,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cue_is_short_pcm_with_headroom_and_silent_edges() {
        assert_eq!(&WAV[..4], b"RIFF");
        assert_eq!(&WAV[8..12], b"WAVE");
        assert_eq!(u16::from_le_bytes(WAV[20..22].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(WAV[24..28].try_into().unwrap()), 48000);
        let samples: Vec<i16> = WAV[44..]
            .chunks_exact(2)
            .map(|b| i16::from_le_bytes([b[0], b[1]]))
            .collect();
        assert_eq!(samples.len(), 10080);
        assert_eq!(samples[0], 0);
        assert_eq!(*samples.last().unwrap(), 0);
        assert!(samples.iter().map(|v| i32::from(*v).abs()).max().unwrap() < 20000);
    }
}
