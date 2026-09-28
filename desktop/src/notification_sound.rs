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

// The notch is our own surface, so Notification Center never gets a chance
// to play its sound. afplay uses the bundled cue and the user's output volume.
#[cfg(target_os = "macos")]
pub fn play_notch(app: &tauri::AppHandle, force: bool) {
    if !allow(force) {
        return;
    }
    let Ok(path) = file(app) else {
        return;
    };
    std::thread::spawn(move || {
        let result = std::process::Command::new("/usr/bin/afplay")
            .arg(path)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
        if !result.is_ok_and(|status| status.success()) {
            eprintln!("Kindred notification sound could not play");
        }
    });
}

// Some Linux notification services do not implement the standard sound hint.
// Use the bundled media framework only for those services, never alongside
// a daemon-owned sound. It is optional so an absent audio stack cannot prevent
// the notification itself from being delivered.
#[cfg(target_os = "linux")]
pub fn play_linux_fallback(path: PathBuf) {
    use gtk::gio::{Settings, SettingsSchemaSource, prelude::*};
    if let Some(source) = SettingsSchemaSource::default() {
        for (schema, key, location) in [
            ("org.gnome.desktop.sound", "event-sounds", None),
            ("org.gnome.desktop.notifications", "show-banners", None),
            (
                "org.gnome.desktop.notifications.application",
                "enable-sound-alerts",
                Some("/org/gnome/desktop/notifications/application/kindred/"),
            ),
        ] {
            if let Some(schema) = source.lookup(schema, true) {
                if schema.has_key(key)
                    && !Settings::new_full(&schema, None::<&gtk::gio::SettingsBackend>, location)
                        .boolean(key)
                {
                    return;
                }
            }
        }
    }
    std::thread::spawn(move || {
        if let Err(error) = play_linux_file(&path, "autoaudiosink") {
            eprintln!("{error}");
        }
    });
}

#[cfg(target_os = "linux")]
fn play_linux_file(path: &std::path::Path, sink: &str) -> Result<(), &'static str> {
    // WebKit already requires GStreamer; AppImage bundles its media framework.
    // Keep playback off the UI thread and bounded even if an audio sink fails.
    unsafe {
        // GStreamer keeps process-wide state; never unload its library between cues.
        static GST: std::sync::OnceLock<Option<libloading::Library>> = std::sync::OnceLock::new();
        let Some(library) =
            GST.get_or_init(|| libloading::Library::new("libgstreamer-1.0.so.0").ok())
        else {
            return Err("Notification audio is unavailable");
        };
        type Object = *mut std::ffi::c_void;
        type Init = unsafe extern "C" fn(Object, Object, Object) -> i32;
        type Parse = unsafe extern "C" fn(*const std::ffi::c_char, Object) -> Object;
        type State = unsafe extern "C" fn(Object, i32) -> i32;
        type Bus = unsafe extern "C" fn(Object) -> Object;
        type Wait = unsafe extern "C" fn(Object, u64, u32) -> Object;
        type Unref = unsafe extern "C" fn(Object);
        let (Ok(init), Ok(parse), Ok(state), Ok(bus), Ok(wait), Ok(unref), Ok(message_unref)) = (
            library.get::<Init>(b"gst_init_check\0"),
            library.get::<Parse>(b"gst_parse_launch\0"),
            library.get::<State>(b"gst_element_set_state\0"),
            library.get::<Bus>(b"gst_element_get_bus\0"),
            library.get::<Wait>(b"gst_bus_timed_pop_filtered\0"),
            library.get::<Unref>(b"gst_object_unref\0"),
            library.get::<Unref>(b"gst_message_unref\0"),
        ) else {
            return Err("Notification audio is unavailable");
        };
        let null = std::ptr::null_mut();
        if init(null, null, null) == 0 {
            return Err("Notification audio could not initialize");
        }
        let Ok(uri) = gtk::glib::filename_to_uri(&path, None) else {
            return Err("Notification audio is unavailable");
        };
        let Ok(description) = std::ffi::CString::new(format!(
            "playbin uri=\"{uri}\" video-sink=fakesink audio-sink={sink}"
        )) else {
            return Err("Notification audio is unavailable");
        };
        let pipeline = parse(description.as_ptr(), null);
        if pipeline.is_null() {
            return Err("Notification audio could not load");
        }
        let mut finished = false;
        if state(pipeline, 4) != 0 {
            // GST_STATE_PLAYING / GST_STATE_CHANGE_FAILURE
            let bus = bus(pipeline);
            if !bus.is_null() {
                let message = wait(bus, 2_000_000_000, 1); // EOS; at most two seconds
                if !message.is_null() {
                    finished = true;
                    message_unref(message);
                }
                unref(bus);
            }
        }
        state(pipeline, 1); // GST_STATE_NULL releases the sink and file.
        unref(pipeline);
        if finished {
            Ok(())
        } else {
            Err("Notification audio did not finish")
        }
    }
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
    // older shell query alone cannot establish on current Windows versions.
    // Older systems may not expose this interface: retain the shell and registry
    // checks below instead of making every notification permanently silent.
    match ToastNotificationManager::GetDefault().and_then(|manager| manager.NotificationMode()) {
        Ok(ToastNotificationMode::Unrestricted) => {}
        // E_NOTIMPL, E_NOINTERFACE, REGDB_E_CLASSNOTREG on older Windows.
        Err(error) if matches!(error.code().0 as u32, 0x80004001 | 0x80004002 | 0x80040154) => {}
        _ => return,
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
            if PlaySoundW(
                WAV.as_ptr().cast(),
                std::ptr::null_mut(),
                SND_MEMORY | SND_ASYNC | SND_NODEFAULT | SND_SYSTEM | SND_NOSTOP,
            ) == 0
            {
                eprintln!("Kindred notification sound could not play");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "linux")]
    #[test]
    fn linux_fallback_decodes_cue_and_reaches_end() {
        let path =
            std::env::temp_dir().join(format!("kindred-sound-test-{}.wav", uuid::Uuid::new_v4()));
        std::fs::write(&path, WAV).unwrap();
        let result = play_linux_file(&path, "fakesink");
        let _ = std::fs::remove_file(path);
        assert_eq!(result, Ok(()));
    }
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
