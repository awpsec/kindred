use serde_json::{Value, json};
use std::{io::Read, sync::Mutex, time::Duration};
use tauri::Manager;

const APP_ID: &str = "dev.kindred.personal";
pub fn register_notifications() -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(windows)]
    {
        let (key, _) = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
            .create_subkey(format!("Software\\Classes\\AppUserModelId\\{APP_ID}"))?;
        key.set_value("DisplayName", &"Kindred")?;
        key.set_value(
            "IconUri",
            &std::env::current_exe()?.to_string_lossy().as_ref(),
        )?;
    }
    #[cfg(target_os = "macos")]
    notify_rust::set_application(APP_ID)?;
    Ok(())
}
pub(crate) fn open_notification(app: &tauri::AppHandle, destination: &Option<(u64, Value)>) {
    use tauri::Emitter;
    if !current_destination(app, destination) {
        return;
    }
    if let Some(window) = crate::surface::Surface::main(app) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        if let Some((_, item)) = destination {
            let _ = window.emit("kindred-notification-open", item);
        }
    }
}
pub(crate) fn current_destination(
    app: &tauri::AppHandle,
    destination: &Option<(u64, Value)>,
) -> bool {
    destination.as_ref().is_none_or(|(generation, _)| {
        app.state::<Desktop>().session.lock().unwrap().generation == *generation
    })
}
fn show_notification(
    app: &tauri::AppHandle,
    title: &str,
    body: &str,
    portrait: Option<&std::path::Path>,
    destination: Option<(u64, Value)>,
    _test: bool,
) -> Result<(), String> {
    if !current_destination(app, &destination) {
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    if crate::notch::native::show(app, title, body, portrait, &destination, _test).unwrap_or(false) {
        return Ok(());
    }
    show_system_notification(app, title, body, portrait, destination)
}
pub(crate) fn show_system_notification(
    app: &tauri::AppHandle,
    title: &str,
    body: &str,
    portrait: Option<&std::path::Path>,
    destination: Option<(u64, Value)>,
) -> Result<(), String> {
    let test = destination.is_none();
    #[cfg(windows)]
    {
        let _ = portrait;
        use windows::{
            Data::Xml::Dom::XmlDocument,
            Foundation::TypedEventHandler,
            UI::Notifications::{ToastNotification, ToastNotificationManager},
            core::HSTRING,
        };
        let send = || -> windows::core::Result<()> {
            let xml = XmlDocument::new()?;
            xml.LoadXml(&HSTRING::from(crate::notification_xml::toast_xml(
                title, body,
            )))?;
            let toast = ToastNotification::CreateToastNotification(&xml)?;
            let handle = app.clone();
            toast.Activated(&TypedEventHandler::new(move |_, _| {
                open_notification(&handle, &destination);
                Ok(())
            }))?;
            let notifier =
                ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(APP_ID))?;
            notifier.Show(&toast)?;
            crate::notification_sound::play_windows(&notifier, test);
            // Keep the callback-bearing object alive after Show returns.
            let state = app.state::<Desktop>();
            let mut active = state.toasts.lock().unwrap();
            active.push(toast);
            if active.len() > 64 {
                active.remove(0);
            }
            Ok(())
        };
        return send().map_err(|e| e.to_string());
    }
    #[cfg(not(windows))]
    {
        let mut notification = notify_rust::Notification::new();
        notification.summary(title).body(body).appname("Kindred");
        let sound = if crate::notification_sound::allow(test) {
            crate::notification_sound::file(app).ok()
        } else {
            None
        };
        #[cfg(target_os = "macos")]
        if sound.is_some() {
            notification.sound_name(crate::notification_sound::name());
        }
        #[cfg(not(target_os = "macos"))]
        if let Some(path) = &sound {
            notification.hint(notify_rust::Hint::SoundFile(
                path.to_string_lossy().into_owned(),
            ));
        } else {
            notification.hint(notify_rust::Hint::SuppressSound(true));
        }
        if let Some(path) = portrait {
            notification.icon(&path.to_string_lossy());
        }
        #[cfg(not(target_os = "macos"))]
        notification
            // Match the installed/bundled Kindred.desktop file so Plasma can
            // associate notifications with its per-application settings/history.
            .hint(notify_rust::Hint::DesktopEntry("Kindred".into()))
            .action("default", "Open Kindred");
        let handle = notification.show().map_err(|e| e.to_string())?;
        #[cfg(not(target_os = "macos"))]
        {
            let app = app.clone();
            std::thread::spawn(move || {
                handle.wait_for_action(move |action| {
                    if action == "open" || action == "default" {
                        open_notification(&app, &destination);
                    }
                })
            });
        }
        #[cfg(target_os = "macos")]
        let _ = (handle, destination, app);
        Ok(())
    }
}
#[cfg(not(windows))]
fn notification_portrait(
    app: &tauri::AppHandle,
    client: &reqwest::blocking::Client,
    token: &str,
    item: &Value,
) -> Option<std::path::PathBuf> {
    let bot = uuid::Uuid::parse_str(item["bot_id"].as_str()?).ok()?;
    let key = item["avatar_key"].as_str()?;
    if key.len() != 64 || !key.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let state = app.state::<Desktop>();
    let identity = format!("{}\n{bot}\n{key}", state.origin);
    let cache_key = ring::digest::digest(&ring::digest::SHA256, identity.as_bytes())
        .as_ref()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    let folder = app
        .path()
        .app_cache_dir()
        .ok()?
        .join("notification-portraits");
    std::fs::create_dir_all(&folder).ok()?;
    let path = folder.join(format!("{cache_key}.png"));
    if path.is_file() {
        return Some(path);
    }
    let url = state
        .origin
        .join(&format!("/api/bots/{bot}/avatar.png"))
        .ok()?;
    let response = client
        .get(url)
        .bearer_auth(token)
        .timeout(Duration::from_secs(3))
        .send()
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let mut bytes = Vec::new();
    response.take(32769).read_to_end(&mut bytes).ok()?;
    if bytes.len() > 32768 || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return None;
    }
    std::fs::write(&path, bytes).ok()?;
    Some(path)
}

#[derive(Default)]
pub struct Session {
    token: String,
    generation: u64,
    error: String,
    delivery_error: String,
}
pub struct Desktop {
    pub origin: tauri::Url,
    pub session: Mutex<Session>,
    #[cfg(windows)]
    toasts: Mutex<Vec<windows::UI::Notifications::ToastNotification>>,
}
impl Desktop {
    #[cfg(target_os = "macos")]
    pub fn session_generation(&self) -> u64 {
        self.session.lock().unwrap().generation
    }
    pub fn new(origin: tauri::Url) -> Self {
        Self {
            origin,
            session: Mutex::new(Session::default()),
            #[cfg(windows)]
            toasts: Mutex::new(Vec::new()),
        }
    }
    pub fn session_token(&self) -> String {
        self.session.lock().unwrap().token.clone()
    }
    pub fn notification_error(&self, error: String) {
        self.session.lock().unwrap().delivery_error = error;
    }
}
pub(crate) fn trusted(window: &crate::surface::Surface, state: &Desktop) -> Result<(), String> {
    let url = window.url().map_err(|e| e.to_string())?;
    if window.label() == "main" && url.origin() == state.origin.origin() {
        Ok(())
    } else {
        Err("Only the connected Kindred window can use desktop controls.".into())
    }
}
#[tauri::command]
pub fn window_action(
    window: crate::surface::Surface,
    state: tauri::State<'_, Desktop>,
    action: String,
) -> Result<bool, String> {
    let url = window.url().map_err(|e| e.to_string())?;
    let bundled = matches!(window.label(), "profile-home" | "local-access")
        && (url.scheme() == "tauri"
            || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost")));
    if bundled {
        if !matches!(action.as_str(), "close" | "drag" | "state") {
            return Err("Unsupported dialog action".into());
        }
    } else {
        trusted(&window, &state)?;
    }
    if action == "close" && bundled && window.label() == "profile-home" {
        let startup = window.state::<crate::connection::Startup>();
        let mut stage = startup.0.lock().map_err(|e| e.to_string())?;
        if *stage == 0 && crate::surface::Surface::main(window.app_handle()).is_some() {
            *stage = 2;
            drop(stage);
            crate::window_state::flush(window.app_handle());
            window.app_handle().exit(0);
            return Ok(false);
        }
    }
    match action.as_str() {
        "minimize" => window.minimize(),
        "maximize" => {
            if window.is_maximized().unwrap_or(false) {
                window.unmaximize()
            } else {
                window.maximize()
            }
        }
        "fullscreen" => window.set_fullscreen(!window.is_fullscreen().unwrap_or(false)),
        "drag" => window.start_dragging(),
        "close" => window.close(),
        "state" => Ok(()),
        _ => return Err("Unknown window action".into()),
    }
    .map_err(|e| e.to_string())?;
    Ok(window.is_maximized().unwrap_or(false))
}
#[tauri::command]
pub fn start_desktop(
    window: crate::surface::Surface,
    state: tauri::State<'_, Desktop>,
    token: String,
) -> Result<(), String> {
    trusted(&window, &state)?;
    if token.len() > 4096 || token.chars().any(char::is_control) {
        return Err("Invalid server token".into());
    }
    let mut session = state.session.lock().map_err(|e| e.to_string())?;
    if session.token != token {
        session.token = token;
        session.generation += 1;
        session.error.clear();
        drop(session);
        #[cfg(target_os = "macos")]
        crate::notch::native::clear(window.app_handle());
    }
    Ok(())
}
#[tauri::command]
pub async fn notification_status(
    window: crate::surface::Surface,
    state: tauri::State<'_, Desktop>,
) -> Result<Value, String> {
    trusted(&window, &state)?;
    let session = state.session.lock().map_err(|e| e.to_string())?;
    Ok(
        json!({"enabled":!session.token.is_empty(),"notch":crate::notch::status(window.app_handle()),"error":if session.error.is_empty(){&session.delivery_error}else{&session.error}}),
    )
}
#[tauri::command]
pub async fn test_notification(
    window: crate::surface::Surface,
    state: tauri::State<'_, Desktop>,
) -> Result<(), String> {
    trusted(&window, &state)?;
    let app = window.app_handle().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        show_notification(
            &app,
            "Kindred notifications",
            "You’ll be notified when a bot finishes or needs your input.",
            None,
            None,
            true,
        )
    })
    .await
    .map_err(|e| e.to_string())?;
    state.notification_error(result.as_ref().err().cloned().unwrap_or_default());
    result
}

pub fn watch(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let Ok(client) = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none())
            .build()
        else {
            return;
        };
        let mut cursor = None;
        let mut generation = 0;
        loop {
            let state = app.state::<Desktop>();
            let (token, next_generation) = {
                let session = state.session.lock().unwrap();
                (session.token.clone(), session.generation)
            };
            if next_generation != generation {
                cursor = None;
                generation = next_generation;
            }
            if !token.is_empty() {
                let mut url = state.origin.join("/api/notifications").unwrap();
                if let Some(c) = cursor {
                    url.query_pairs_mut().append_pair("after", &format!("{c}"));
                }
                let result = (|| -> Result<Value, String> {
                    let response = client
                        .get(url)
                        .bearer_auth(&token)
                        .send()
                        .map_err(|_| "Notification connection unavailable")?;
                    if !response.status().is_success() {
                        return Err(format!(
                            "Notification connection returned HTTP {}",
                            response.status().as_u16()
                        ));
                    }
                    let mut bytes = Vec::new();
                    response
                        .take(512 * 1024 + 1)
                        .read_to_end(&mut bytes)
                        .map_err(|_| "Could not read notification response")?;
                    if bytes.len() > 512 * 1024 {
                        return Err("Notification response exceeded limit".into());
                    }
                    serde_json::from_slice(&bytes)
                        .map_err(|_| "Invalid notification response".into())
                })();
                #[cfg(windows)]
                let portraits: Vec<Option<std::path::PathBuf>> = Vec::new();
                #[cfg(not(windows))]
                let portraits: Vec<_> = result
                    .as_ref()
                    .ok()
                    .and_then(|data| data["items"].as_array())
                    .map(|items| {
                        items
                            .iter()
                            .take(100)
                            .map(|item| notification_portrait(&app, &client, &token, item))
                            .collect()
                    })
                    .unwrap_or_default();
                if let Some(next) = deliver_notifications(
                    &state.session,
                    generation,
                    result,
                    |index, item, title, body| {
                        show_notification(
                            &app,
                            title,
                            body,
                            portraits.get(index).and_then(|p| p.as_deref()),
                            Some((
                                generation,
                                json!({"chat_id":item["chat_id"],"bot_id":item["bot_id"],"avatar":item["avatar"],"reduced_motion":item["reduced_motion"]}),
                            )),
                            false,
                        )
                    },
                ) {
                    cursor = Some(next);
                }
            }
            std::thread::sleep(Duration::from_secs(3));
        }
    });
}

// Native delivery can wait on the desktop notification service. Never hold the
// session mutex across it: Settings and profile switching also need that lock.
fn deliver_notifications(
    session: &Mutex<Session>,
    generation: u64,
    result: Result<Value, String>,
    mut show: impl FnMut(usize, &Value, &str, &str) -> Result<(), String>,
) -> Option<i64> {
    let data = {
        let mut state = session.lock().unwrap();
        if state.generation != generation {
            return None;
        }
        match result {
            Ok(data) => {
                state.error.clear();
                data
            }
            Err(error) => {
                state.error = error;
                return None;
            }
        }
    };
    if let Some(items) = data["items"].as_array() {
        for (index, item) in items.iter().take(100).enumerate() {
            if session.lock().unwrap().generation != generation {
                return None;
            }
            let title = item["title"].as_str().unwrap_or("Kindred");
            let body = item["body"]
                .as_str()
                .unwrap_or("Open Kindred for an update.");
            if title.len() > 240 || body.len() > 1000 {
                continue;
            }
            let error = show(index, item, title, body)
                .err()
                .map(|e| format!("Notifications unavailable: {e}"))
                .unwrap_or_default();
            let mut state = session.lock().unwrap();
            if state.generation != generation {
                return None;
            }
            state.delivery_error = error;
        }
    }
    data["cursor"].as_i64()
}
#[cfg(test)]
mod responsiveness_tests {
    use super::*;
    #[test]
    fn notification_delivery_does_not_block_settings_or_cross_sessions() {
        let session = Mutex::new(Session::default());
        let mut calls = 0;
        let next = deliver_notifications(
            &session,
            0,
            Ok(json!({"items":[{},{}],"cursor":2})),
            |_, _, _, _| {
                calls += 1;
                // A stalled native service must leave status and sign-out usable.
                let mut state = session.try_lock().expect("delivery held the session lock");
                state.generation += 1;
                Ok(())
            },
        );
        assert_eq!(calls, 1);
        assert_eq!(next, None);
    }
}
