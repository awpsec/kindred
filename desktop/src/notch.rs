//! Local, non-activating macOS alert surface. No server credentials enter it.
use serde_json::{Value, json};
#[cfg(target_os = "macos")]
use tauri::Manager;

#[tauri::command]
pub fn set_notch_notifications(
    window: crate::surface::Surface,
    state: tauri::State<'_, crate::desktop::Desktop>,
    enabled: bool,
) -> Result<(), String> {
    crate::desktop::trusted(&window, &state)?;
    #[cfg(target_os = "macos")]
    {
        let app = window.app_handle();
        let settings = app.state::<native::Notch>();
        let mut inner = settings.0.lock().unwrap();
        crate::local_files::atomic(&native::path()?, &json!({"enabled":enabled}))
            .map_err(|e| e.to_string())?;
        inner.enabled = enabled;
        if !enabled {
            inner.queue.clear();
        }
        drop(inner);
        native::sync(app)?;
        return Ok(());
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = enabled;
        Err("Notch notifications require the macOS app".into())
    }
}

pub fn status(app: &tauri::AppHandle) -> Value {
    #[cfg(target_os = "macos")]
    {
        return json!({"supported":true,"enabled":app.state::<native::Notch>().0.lock().unwrap().enabled});
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        json!({"supported":false,"enabled":false})
    }
}

#[tauri::command]
pub fn notch_action(
    window: crate::surface::Surface,
    action: String,
    id: Option<String>,
) -> Result<Value, String> {
    let url = window.url().map_err(|e| e.to_string())?;
    if window.label() != "notch-alert" || !bundled(&url) {
        return Err("Only the bundled notification surface can control this alert".into());
    }
    #[cfg(target_os = "macos")]
    {
        return native::action(window.app_handle(), &action, id.as_deref());
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (action, id);
        Err("Notch notifications require the macOS app".into())
    }
}

fn bundled(url: &tauri::Url) -> bool {
    ((url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost")))
        && url.path() == "/notch.html"
}

#[cfg(any(target_os = "macos", test))]
#[path = "notch_geometry.rs"]
mod geometry;

// The surface renders only a name, avatar and fixed phrase. The message body
// stays native for the system-banner fallback and never enters the webview.
#[cfg(any(target_os = "macos", test))]
fn payload(id: &str, title: &str, avatar: &Value, reduced_motion: bool, queued: usize) -> Value {
    json!({"id":id,"title":title,"avatar":avatar,"reduced_motion":reduced_motion,"queued":queued})
}

#[cfg(any(target_os = "macos", test))]
fn frame(x: f64, y: f64, width: f64, height: f64, inset: f64, bridge: f64) -> [f64; 5] {
    let top = inset.clamp(0., 96.).max(12.);
    let alert_width = (bridge + 80.).min((width - 24.).max(1.));
    let alert_height = (top + 44.).min(height);
    [
        x + (width - alert_width) / 2.,
        y + height - alert_height,
        alert_width,
        alert_height,
        top,
    ]
}

#[cfg(target_os = "macos")]
pub mod native {
    use super::*;
    use objc2::{MainThreadMarker, sel};
    use objc2_app_kit::{NSApplication, NSScreen, NSStatusWindowLevel, NSWindow, NSWindowCollectionBehavior};
    use objc2_foundation::{NSObjectProtocol, NSPoint, NSRect, NSSize};
    use std::{
        collections::VecDeque,
        path::PathBuf,
        sync::Mutex,
        time::{Duration, Instant},
    };
    use tauri::Emitter;

    pub struct Alert {
        id: String,
        title: String,
        body: String,
        avatar: Value,
        reduced_motion: bool,
        portrait: Option<PathBuf>,
        destination: Option<(u64, Value)>,
        started: Option<Instant>,
        presented: bool,
        test: bool,
    }
    pub struct Inner {
        pub enabled: bool,
        pub queue: VecDeque<Alert>,
    }
    pub struct Notch(pub Mutex<Inner>);
    impl Default for Notch {
        fn default() -> Self {
            let enabled = path()
                .ok()
                .and_then(|p| std::fs::read(p).ok())
                .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
                .is_some_and(|v| v["enabled"] == true);
            Self(Mutex::new(Inner {
                enabled,
                queue: VecDeque::new(),
            }))
        }
    }
    pub fn path() -> Result<PathBuf, String> {
        Ok(crate::local_files::install_root()
            .map_err(|e| e.to_string())?
            .join("notch-notifications.json"))
    }
    fn window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
        if let Some(window) = app.get_webview_window("notch-alert") {
            return Ok(window);
        }
        tauri::WebviewWindowBuilder::new(
            app,
            "notch-alert",
            tauri::WebviewUrl::App("notch.html".into()),
        )
        .title("Kindred notification")
        .inner_size(360., 132.)
        .decorations(false)
        .resizable(false)
        .transparent(true)
        .shadow(false)
        .focused(false)
        .focusable(false)
        .visible(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .accept_first_mouse(true)
        .on_navigation(bundled)
        .build()
        .map_err(|e| e.to_string())
    }
    // All NSWindow/NSScreen access happens on Tauri's main thread. Cocoa's global
    // coordinate space handles Retina, negative origins and vertically stacked displays.
    fn layout(app: &tauri::AppHandle, window: &tauri::WebviewWindow) -> Result<Value, String> {
        let mtm = MainThreadMarker::new().ok_or("Display layout requires the main thread")?;
        let main = crate::surface::Surface::main(app);
        let screen = main
            .and_then(|w| w.ns_window().ok())
            .and_then(|p| unsafe { (&*p.cast::<NSWindow>()).screen() })
            .or_else(|| NSScreen::mainScreen(mtm))
            .ok_or("No display available")?;
        let frame = screen.frame();
        let inset = if screen.respondsToSelector(sel!(safeAreaInsets)) {
            screen.safeAreaInsets().top
        } else {
            0.
        };
        let (aux_height, aux_gap) = if screen.respondsToSelector(sel!(auxiliaryTopRightArea))
            && screen.respondsToSelector(sel!(auxiliaryTopLeftArea)) {
            let left = screen.auxiliaryTopLeftArea();
            let right = screen.auxiliaryTopRightArea();
            if left.size.width > 0. && right.size.width > 0. {
                (left.size.height.max(right.size.height), right.origin.x - left.origin.x - left.size.width)
            } else { (0., 0.) }
        } else { (0., 0.) };
        let (top, bridge) = super::geometry::clearance(inset, aux_height, aux_gap);
        let bridge = bridge.min((frame.size.width - 64.).max(1.));
        let [x, y, width, height, safe_top] = super::frame(
            frame.origin.x,
            frame.origin.y,
            frame.size.width,
            frame.size.height,
            top,
            bridge,
        );
        let rect = NSRect::new(NSPoint::new(x, y), NSSize::new(width, height));
        let native = window.ns_window().map_err(|e| e.to_string())?;
        let native = unsafe { &*native.cast::<NSWindow>() };
        native.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::FullScreenAuxiliary
                | NSWindowCollectionBehavior::IgnoresCycle,
        );
        native.setLevel(NSStatusWindowLevel);
        native.setHidesOnDeactivate(false);
        if native.frame() != rect {
            native.setFrame_display(rect, true);
        }
        Ok(json!({"top":safe_top,"notched":top>0.,"bridge_width":bridge}))
    }
    fn app_active() -> Result<bool, String> {
        let mtm = MainThreadMarker::new().ok_or("Application focus requires the main thread")?;
        Ok(NSApplication::sharedApplication(mtm).isActive())
    }
    fn suppress_foreground(app: &tauri::AppHandle) -> Result<bool, String> {
        if !app_active()? { return Ok(false); }
        let state = app.state::<Notch>();
        let mut inner = state.0.lock().unwrap();
        let had_alerts = !inner.queue.is_empty();
        // Explicit tests must remain visible even from the focused settings window.
        // Real alerts are still discarded when the app becomes active.
        inner.queue.retain(|alert| alert.test);
        if !inner.queue.is_empty() { return Ok(false); }
        drop(inner);
        if let Some(window) = app.get_webview_window("notch-alert") {
            window.hide().map_err(|e| e.to_string())?;
            if had_alerts { let _ = window.emit("kindred-notch-changed", ()); }
        }
        Ok(true)
    }
    pub fn sync(app: &tauri::AppHandle) -> Result<(), String> {
        if suppress_foreground(app)? { return Ok(()); }
        let generation = app.state::<crate::desktop::Desktop>().session_generation();
        let state = app.state::<Notch>();
        let mut inner = state.0.lock().unwrap();
        inner
            .queue
            .retain(|a| a.destination.as_ref().is_none_or(|(g, _)| *g == generation));
        let active = inner.queue.front_mut();
        if let Some(alert) = active {
            alert.started.get_or_insert_with(Instant::now);
            let window = window(app)?;
            drop(inner);
            let _ = layout(app, &window)?;
            window
                .emit("kindred-notch-changed", ())
                .map_err(|e| e.to_string())?;
        } else if let Some(window) = app.get_webview_window("notch-alert") {
            drop(inner);
            window.hide().map_err(|e| e.to_string())?;
            let _ = window.emit("kindred-notch-changed", ());
        }
        Ok(())
    }
    pub fn clear(app: &tauri::AppHandle) {
        app.state::<Notch>().0.lock().unwrap().queue.clear();
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            let _ = sync(&handle);
        });
    }
    pub fn show(
        app: &tauri::AppHandle,
        title: &str,
        body: &str,
        portrait: Option<&std::path::Path>,
        destination: &Option<(u64, Value)>,
        test: bool,
    ) -> Result<bool, String> {
        let state = app.state::<Notch>();
        let mut inner = state.0.lock().unwrap();
        if !inner.enabled || inner.queue.len() >= 12 {
            return Ok(false);
        }
        let item = destination
            .as_ref()
            .map(|(_, v)| v)
            .cloned()
            .unwrap_or_default();
        let id = uuid::Uuid::new_v4().to_string();
        inner.queue.push_back(Alert {
            id: id.clone(),
            title: title.into(),
            body: body.into(),
            avatar: item["avatar"].clone(),
            reduced_motion: item["reduced_motion"] == true,
            portrait: portrait.map(ToOwned::to_owned),
            destination: destination.clone(),
            started: None,
            presented: false,
            test,
        });
        drop(inner);
        let handle = app.clone();
        let (send, receive) = std::sync::mpsc::sync_channel(1);
        let dispatched = app
            .run_on_main_thread(move || {
                let _ = send.send(sync(&handle));
            })
            .map_err(|e| e.to_string());
        let result = dispatched.and_then(|_| {
            receive
                .recv_timeout(Duration::from_secs(4))
                .map_err(|_| "Notification window did not respond".to_string())
                .and_then(|r| r)
        });
        if result.is_err() {
            let mut inner = state.0.lock().unwrap();
            let Some(at) = inner.queue.iter().position(|a| a.id == id) else {
                // The watchdog already delivered the fallback, or the user
                // cleared this alert. Do not send a second system banner.
                return Ok(true);
            };
            inner.queue.remove(at);
            drop(inner);
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                let _ = sync(&handle);
            });
        }
        result.map(|_| true)
    }
    pub fn action(app: &tauri::AppHandle, action: &str, id: Option<&str>) -> Result<Value, String> {
        // Synchronous Tauri commands execute on the main thread.
        // Recheck before presenting, and clear an existing alert on focus return.
        // A click may itself activate the app before this command arrives.
        if action != "open" && suppress_foreground(app)? { return Ok(Value::Null); }
        let generation = app.state::<crate::desktop::Desktop>().session_generation();
        let state = app.state::<Notch>();
        let mut inner = state.0.lock().unwrap();
        inner
            .queue
            .retain(|a| a.destination.as_ref().is_none_or(|(g, _)| *g == generation));
        // Lets the surface hand an expiring alert to the next without collapsing.
        let queued = inner.queue.len().saturating_sub(1);
        let Some(alert) = inner.queue.front_mut() else {
            return Ok(Value::Null);
        };
        if action != "state" && id != Some(alert.id.as_str()) {
            return Ok(Value::Null);
        }
        match action {
            "state" => {
                let value = super::payload(&alert.id, &alert.title, &alert.avatar, alert.reduced_motion, queued);
                drop(inner);
                let mut value = value;
                value["layout"] = layout(app, &window(app)?)?;
                Ok(value)
            }
            "present" => {
                let window = window(app)?;
                let _ = layout(app, &window)?;
                let native = window.ns_window().map_err(|e| e.to_string())?;
                // Do not makeKeyAndOrderFront: showing a notification must never
                // activate Kindred or interrupt typing in another application.
                unsafe {
                    (&*native.cast::<NSWindow>()).orderFrontRegardless();
                }
                alert.presented = true;
                alert.started = Some(Instant::now());
                Ok(Value::Null)
            }
            "hold" | "release" => {
                // Renew while hovered; if the renderer stops responding the
                // watchdog still expires this alert instead of pinning it forever.
                if alert.presented { alert.started = Some(Instant::now()); }
                Ok(Value::Null)
            }
            "dismiss" | "open" => {
                let alert = inner.queue.pop_front().unwrap();
                drop(inner);
                if action == "open" {
                    crate::desktop::open_notification(app, &alert.destination);
                }
                sync(app)?;
                Ok(Value::Null)
            }
            _ => Err("Unknown notification action".into()),
        }
    }
    pub fn watch(app: tauri::AppHandle) {
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(Duration::from_millis(500));
                let state = app.state::<Notch>();
                let mut inner = state.0.lock().unwrap();
                if let Some(id) = inner.queue.front().filter(|a| a.presented).map(|a| a.id.clone()) {
                    let handle = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        let current = handle.state::<Notch>().0.lock().unwrap().queue.front()
                            .is_some_and(|a| a.presented && a.id == id);
                        if current {
                            if let Some(window) = handle.get_webview_window("notch-alert") {
                                let _ = track_background_pointer(&window, &id);
                            }
                        }
                    });
                }
                let expired = inner.queue.front().is_some_and(|a| {
                    a.started.is_some_and(|start| {
                        let seconds = start.elapsed().as_secs();
                        if !a.presented {
                            seconds >= 5
                        } else {
                            seconds >= 4
                        }
                    })
                });
                if !expired {
                    continue;
                }
                let alert = inner.queue.pop_front().unwrap();
                drop(inner);
                let handle = app.clone();
                let _ = app.run_on_main_thread(move || {
                    let _ = sync(&handle);
                });
                // A broken/blocked webview must not consume an alert silently.
                if !alert.presented && crate::desktop::current_destination(&app, &alert.destination)
                {
                    let result = crate::desktop::show_system_notification(
                        &app,
                        &alert.title,
                        &alert.body,
                        alert.portrait.as_deref(),
                        alert.destination,
                    );
                    if let Err(error) = result {
                        app.state::<crate::desktop::Desktop>()
                            .notification_error(format!(
                                "Notch and system notifications unavailable: {error}"
                            ));
                    }
                }
            }
        });
    }
    // WKWebView's normal tracking area is active only in a key window. This
    // alert deliberately cannot become key, so use Cocoa's live pointer position
    // without activating it. DOM hit testing preserves the animated silhouette;
    // only transitions enter the existing hover/expiry path. The renderer must
    // still renew its lease, allowing the watchdog to recover a stalled webview.
    fn track_background_pointer(window: &tauri::WebviewWindow, id: &str) -> Result<(), String> {
        let _mtm = MainThreadMarker::new().ok_or("Pointer tracking requires the main thread")?;
        let native = window.ns_window().map_err(|e| e.to_string())?;
        let native = unsafe { &*native.cast::<NSWindow>() };
        if !native.isVisible() { return Ok(()); }
        let point = native.mouseLocationOutsideOfEventStream();
        let x = point.x;
        let y = native.frame().size.height - point.y;
        if !x.is_finite() || !y.is_finite() { return Ok(()); }
        let id = serde_json::to_string(id).map_err(|e| e.to_string())?;
        window.eval(&format!(r#"(() => {{
            const card = document.getElementById('alert');
            if (!card || card.hidden) return;
            const inside = card.contains(document.elementFromPoint({x}, {y}));
            const previous = window.__kindredNativeHover;
            window.__kindredNativeHover = {{id: {id}, inside}};
            if ((!previous || previous.id !== {id}) ? inside : previous.inside !== inside)
                card.dispatchEvent(new PointerEvent(inside ? 'pointerenter' : 'pointerleave', {{pointerType: 'mouse', clientX: {x}, clientY: {y}}}));
        }})()"#)).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn anchors_in_cocoa_points_on_notched_external_and_stacked_displays() {
        assert_eq!(
            frame(0., 0., 1512., 982., 32., 176.),
            [628., 906., 256., 76., 32.]
        );
        assert_eq!(
            frame(-1920., 0., 1920., 1080., 0., 240.),
            [-1120., 1024., 320., 56., 12.]
        );
        assert_eq!(
            frame(0., 982., 2560., 1440., 0., 240.),
            [1120., 2366., 320., 56., 12.]
        );
        let narrow = frame(0., 0., 320., 480., 0., 300.);
        assert_eq!(narrow[0], 12.);
        assert_eq!(narrow[2], 296.);
    }
    #[test]
    fn surface_payload_omits_the_message_body() {
        let value = payload("a", "Harold", &json!({"shape":"round"}), true, 2);
        let mut keys: Vec<_> = value.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        assert_eq!(keys, ["avatar", "id", "queued", "reduced_motion", "title"]);
        assert_eq!(value["queued"], 2);
    }
    #[test]
    fn only_the_bundled_alert_document_is_trusted() {
        for url in [
            "tauri://localhost/notch.html",
            "http://tauri.localhost/notch.html",
        ] {
            assert!(bundled(&url.parse().unwrap()));
        }
        for url in [
            "https://server.test/notch.html",
            "tauri://foreign/notch.html",
            "http://evil.test/notch.html",
            "tauri://localhost/index.html",
        ] {
            assert!(!bundled(&url.parse().unwrap()));
        }
    }
}
