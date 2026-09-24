//! WebKitGTK microphone consent is rendered inside the trusted Kindred window.
use gtk::prelude::*;
use std::{
    cell::{Cell, RefCell},
    collections::HashMap,
    rc::Rc,
    sync::OnceLock,
    time::Duration,
};
use webkit2gtk::{PermissionRequestExt, SettingsExt, UserMediaPermissionRequestExt, WebViewExt};

// Serialize permission writes so a concurrent reset cannot be undone by a
// late persistence operation. This mutex never blocks GTK while waiting.
static STORE: OnceLock<tauri::async_runtime::Mutex<()>> = OnceLock::new();
struct Consent {
    origin: String,
    grant: crate::microphone_grants::Grant,
    granted: Cell<bool>,
    persistent: Cell<bool>,
}
struct Pending {
    id: String,
    origin: String,
    request: Option<webkit2gtk::PermissionRequest>,
    reply: Option<tauri::async_runtime::Sender<Result<serde_json::Value, String>>>,
    view: gtk::glib::WeakRef<webkit2gtk::WebView>,
    consent: Rc<Consent>,
    deciding: bool,
    window: tauri::WebviewWindow,
}
thread_local! {
    static PENDING: RefCell<HashMap<String, Pending>> = RefCell::new(HashMap::new());
    static CONSENT: RefCell<HashMap<String, Rc<Consent>>> = RefCell::new(HashMap::new());
}
fn same_origin(view: &webkit2gtk::WebView, origin: &str) -> bool {
    view.uri()
        .and_then(|uri| tauri::Url::parse(&uri).ok())
        .is_some_and(|url| url.origin().ascii_serialization() == origin)
}
fn settle(label: &str, id: &str, allowed: bool) {
    let pending = PENDING.with(|all| {
        let mut all = all.borrow_mut();
        if all.get(label).is_some_and(|p| p.id == id) {
            all.remove(label)
        } else {
            None
        }
    });
    if let Some(p) = pending {
        if allowed && p.view.upgrade().is_some_and(|v| same_origin(&v, &p.origin)) {
            p.consent.granted.set(true);
            if let Some(request) = &p.request {
                request.allow();
            }
            if let Some(reply) = &p.reply {
                let _ = reply.try_send(Ok(serde_json::json!({"allowed":true})));
            }
        } else {
            if let Some(request) = &p.request {
                request.deny();
            }
            if let Some(reply) = &p.reply {
                let _ = reply.try_send(Err("Microphone access was not allowed.".into()));
            }
        }
        // with_webview holds Tauri's window registry while invoking us. Queue
        // evaluation after that callback returns instead of locking it again.
        gtk::glib::idle_add_local_once(move || {
            let _ = p.window.eval(&format!("window.dispatchEvent(new CustomEvent('kindred-microphone-settled',{{detail:{}}}));", serde_json::json!({"id":p.id})));
        });
    }
}
// Keep persistence off the GTK thread and reply only after consent was saved.
pub async fn decide(
    window: tauri::WebviewWindow,
    id: String,
    allowed: bool,
    remember: bool,
) -> Result<(), String> {
    let label = window.label().to_owned();
    let (send, mut reply) = tauri::async_runtime::channel(1);
    window
        .with_webview(move |_| {
            let consent = PENDING.with(|all| {
                let mut all = all.borrow_mut();
                let p = all.get_mut(&label).filter(|p| p.id == id && !p.deciding)?;
                if !p.view.upgrade().is_some_and(|v| same_origin(&v, &p.origin)) {
                    return None;
                }
                p.deciding = true;
                Some(p.consent.clone())
            });
            let Some(consent) = consent else {
                let _ = send.try_send(Err("Microphone request expired. Try again.".into()));
                return;
            };
            gtk::glib::MainContext::default().spawn_local(async move {
                let _guard = STORE
                    .get_or_init(|| tauri::async_runtime::Mutex::new(()))
                    .lock()
                    .await;
                let valid = || {
                    PENDING.with(|all| {
                        all.borrow().get(&label).is_some_and(|p| {
                            p.id == id
                                && p.view.upgrade().is_some_and(|v| same_origin(&v, &p.origin))
                        })
                    })
                };
                if !valid() {
                    let _ = send.try_send(Err("Microphone request expired. Try again.".into()));
                    return;
                }
                if allowed && remember {
                    let grant = consent.grant.clone();
                    let result = tauri::async_runtime::spawn_blocking(move || grant.save(true))
                        .await
                        .map_err(|e| e.to_string())
                        .and_then(|v| v);
                    if let Err(e) = result {
                        PENDING.with(|all| {
                            if let Some(p) = all.borrow_mut().get_mut(&label).filter(|p| p.id == id)
                            {
                                p.deciding = false;
                            }
                        });
                        let _ = send.try_send(Err(e));
                        return;
                    }
                    if !valid() {
                        let grant = consent.grant.clone();
                        let _ =
                            tauri::async_runtime::spawn_blocking(move || grant.save(false)).await;
                        let _ = send.try_send(Err("Microphone request expired. Try again.".into()));
                        return;
                    }
                    consent.persistent.set(true);
                }
                settle(&label, &id, allowed);
                let _ = send.try_send(Ok(()));
            });
        })
        .map_err(|e| e.to_string())?;
    reply
        .recv()
        .await
        .ok_or_else(|| "Microphone permission did not respond.".to_string())?
}
pub async fn permission(
    window: tauri::WebviewWindow,
    forget: bool,
    request: bool,
) -> Result<serde_json::Value, String> {
    let label = window.label().to_owned();
    let (send, mut reply) = tauri::async_runtime::channel(1);
    let native = window.clone();
    window.with_webview(move |platform| {
        let consent = CONSENT.with(|all| all.borrow().get(&label).cloned())
            .filter(|c|same_origin(&platform.inner(), &c.origin));
        let Some(consent) = consent else { let _=send.try_send(Err("Only the connected Kindred window can manage microphone permission.".into())); return; };
        if request && !forget && !consent.granted.get() {
            if PENDING.with(|all|all.borrow().contains_key(&label)) { let _=send.try_send(Err("A microphone request is already open.".into())); return; }
            let id=uuid::Uuid::new_v4().to_string();
            let payload=serde_json::json!({"id":id,"origin":consent.origin});
            PENDING.with(|all| { all.borrow_mut().insert(label.clone(),Pending {
                id:id.clone(),origin:consent.origin.clone(),request:None,reply:Some(send),view:platform.inner().downgrade(),consent,deciding:false,window:native.clone(),
            }); });
            let expired_label=label.clone(); let expired_id=id.clone();
            gtk::glib::timeout_add_local_once(Duration::from_secs(90),move||settle(&expired_label,&expired_id,false));
            // Called through with_webview; do not reenter the window registry.
            gtk::glib::idle_add_local_once(move|| {
                if native.eval(&format!("window.dispatchEvent(new CustomEvent('kindred-microphone-permission',{{detail:{payload}}}));")).is_err() { settle(&label,&id,false); }
            });
            return;
        }
        gtk::glib::MainContext::default().spawn_local(async move {
            let _guard=STORE.get_or_init(||tauri::async_runtime::Mutex::new(())).lock().await;
            if forget {
                let pending=PENDING.with(|all|all.borrow().get(&label).map(|p|p.id.clone()));
                if let Some(id)=pending { settle(&label,&id,false); }
                let grant=consent.grant.clone();
                let result=tauri::async_runtime::spawn_blocking(move||grant.save(false)).await
                    .map_err(|e|e.to_string()).and_then(|v|v);
                if let Err(e)=result { let _=send.try_send(Err(e)); return; }
                consent.persistent.set(false); consent.granted.set(false);
                gtk::glib::idle_add_local_once(move|| { let _=native.eval("window.dispatchEvent(new Event('kindred-microphone-revoked'));"); });
            }
            let _=send.try_send(Ok(serde_json::json!({"persistent":consent.persistent.get(),"session":consent.granted.get()})));
        });
    }).map_err(|e|e.to_string())?;
    reply
        .recv()
        .await
        .ok_or_else(|| "Microphone permission did not respond.".to_string())?
}
pub fn cancel(window: &tauri::WebviewWindow) {
    let label = window.label().to_owned();
    let _ = window.with_webview(move |_| {
        let id = PENDING.with(|all| all.borrow().get(&label).map(|p| p.id.clone()));
        if let Some(id) = id {
            settle(&label, &id, false);
        }
    });
}
pub fn attach(window: &tauri::WebviewWindow, origin: String) -> tauri::Result<()> {
    let native = window.clone();
    let grant = crate::microphone_grants::Grant::new(
        crate::profiles::data_root().map_err(std::io::Error::other)?,
        origin.clone(),
        crate::profiles::profile_id(),
    );
    let persistent = grant.allowed();
    window.with_webview(move |platform| {
        let view = platform.inner();
        if let Some(settings) = webkit2gtk::WebViewExt::settings(&view) {
            settings.set_enable_media_stream(true);
            #[cfg(debug_assertions)]
            if std::env::var("KINDRED_TEST_MOCK_MICROPHONE").as_deref() == Ok("1")
                && tauri::Url::parse(&origin).is_ok_and(|url| matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]")))
            { settings.set_enable_mock_capture_devices(true); }
        }
        let label = native.label().to_owned();
        let close_label = label.clone();
        view.connect_load_changed(move |_, state| {
            if state == webkit2gtk::LoadEvent::Started {
                let id = PENDING.with(|all| all.borrow().get(&close_label).map(|p| p.id.clone()));
                if let Some(id) = id { settle(&close_label, &id, false); }
            }
        });
        let close_label = label.clone();
        view.connect_destroy(move |_| {
            let id = PENDING.with(|all| all.borrow().get(&close_label).map(|p| p.id.clone()));
            if let Some(id) = id { settle(&close_label, &id, false); }
        });
        let consent = Rc::new(Consent {origin:origin.clone(),grant,granted:Cell::new(persistent),persistent:Cell::new(persistent)});
        CONSENT.with(|all| { all.borrow_mut().insert(label.clone(),consent.clone()); });
        view.connect_permission_request(move |view, request| {
            if request.is::<webkit2gtk::DeviceInfoPermissionRequest>() {
                if consent.granted.get() && same_origin(view, &origin) { request.allow(); } else { request.deny(); }
                return true;
            }
            let Some(media) = request.downcast_ref::<webkit2gtk::UserMediaPermissionRequest>() else { return false; };
            if !same_origin(view, &origin) || !media.is_for_audio_device() || media.is_for_video_device() {
                request.deny(); return true;
            }
            if consent.granted.get() { request.allow(); return true; }
            if PENDING.with(|all| all.borrow().contains_key(&label)) { request.deny(); return true; }
            let id = uuid::Uuid::new_v4().to_string();
            PENDING.with(|all| { all.borrow_mut().insert(label.clone(), Pending {
                id: id.clone(), origin: origin.clone(), request: Some(request.clone()), reply:None, view: view.downgrade(),
                consent: consent.clone(), deciding:false, window: native.clone(),
            }); });
            let payload = serde_json::json!({"id":id,"origin":origin});
            if native.eval(&format!("window.dispatchEvent(new CustomEvent('kindred-microphone-permission',{{detail:{payload}}}));")).is_err() {
                settle(&label, &id, false); return true;
            }
            let label = label.clone();
            gtk::glib::timeout_add_local_once(Duration::from_secs(90), move || settle(&label, &id, false));
            true
        });
    })
}
