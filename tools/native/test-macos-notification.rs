//! Executes the production adapter with an API-shaped test double, not Apple APIs.
extern crate self as mac_usernotifications;
use std::cell::RefCell;
#[derive(Clone, Debug, Default)]
struct Receipt {
    title: String,
    body: String,
    sound: Option<String>,
    portrait: Option<String>,
    timeout: Option<std::time::Duration>,
}
#[derive(Default)]
struct State {
    calls: Vec<Receipt>,
    fail: bool,
    denied: bool,
}
thread_local! { static STATE: RefCell<State> = RefCell::new(State::default()); }
#[derive(Default)]
pub struct Notification<'a> {
    receipt: Receipt,
    marker: std::marker::PhantomData<&'a str>,
}
#[derive(Debug)]
pub struct NotificationHandle;
pub mod blocking {
    pub fn request_auth() -> Result<bool, String> { super::STATE.with(|s| Ok(!s.borrow().denied)) }
}
impl<'a> Notification<'a> {
    pub fn new() -> Self { Self::default() }
    pub fn title(mut self, text: &'a str) -> Self { self.receipt.title = text.into(); self }
    pub fn message(mut self, text: &'a str) -> Self { self.receipt.body = text.into(); self }
    pub fn timeout(mut self, value: std::time::Duration) -> Self { self.receipt.timeout = Some(value); self }
    pub fn sound(mut self, name: &str) -> Self { self.receipt.sound = Some(name.into()); self }
    pub fn default_sound(mut self) -> Self { self.receipt.sound = Some("".into()); self }
    pub fn send_blocking(self) -> Result<NotificationHandle, String> {
        STATE.with(|s| {
            let mut s = s.borrow_mut(); s.calls.push(self.receipt);
            if s.fail { Err("synthetic native failure".into()) } else { Ok(NotificationHandle) }
        })
    }
}
#[path = "../../desktop/src/macos_notification.rs"]
mod production;
fn reset(fail: bool) {
    STATE.with(|s| {
        *s.borrow_mut() = State {
            calls: vec![],
            fail,
            denied: false,
        }
    });
}
fn receipt() -> Receipt {
    STATE.with(|s| {
        let s = s.borrow();
        assert_eq!(s.calls.len(), 1, "one delivery only, no replay");
        s.calls[0].clone()
    })
}
#[test]
fn explicit_delivery_error_reaches_caller_without_retry() {
    reset(true);
    assert_eq!(
        production::send("Title", "Body", None, production::Sound::Default).map(|_| ()),
        Err("synthetic native failure".into())
    );
    assert_eq!(receipt().timeout, Some(std::time::Duration::from_secs(86400)));
}
#[test]
fn prepared_cue_is_requested_from_notification_center() {
    reset(false);
    let sound = production::prepare_sound(true, "Kindred-Pop-v1.wav", || Ok::<_, ()>(()));
    assert!(production::send("Original title", "Original body", None, sound).is_ok());
    let r = receipt();
    assert_eq!(r.sound.as_deref(), Some("Kindred-Pop-v1.wav"));
    assert_eq!(
        (r.title, r.body),
        ("Original title".into(), "Original body".into())
    );
}
#[test]
fn preparation_failure_uses_system_default_and_still_delivers() {
    reset(false);
    let sound = production::prepare_sound(true, "Kindred-Pop-v1.wav", || {
        Err::<(), _>("secret path must not be logged")
    });
    assert!(production::send("Title", "Body", None, sound).is_ok());
    assert_eq!(
        receipt().sound.as_deref(),
        Some("")
    );
}
#[test]
fn throttled_delivery_is_silent_without_installing_or_playing() {
    reset(false);
    let sound = production::prepare_sound(false, "Kindred-Pop-v1.wav", || -> Result<(), ()> {
        panic!("suppressed cue preparation")
    });
    assert!(production::send("Title", "Body", None, sound).is_ok());
    assert!(receipt().sound.is_none());
}
#[test]
fn existing_system_banner_does_not_add_a_portrait() {
    reset(false);
    let p = std::path::Path::new("/synthetic/avatar.png");
    assert!(production::send("Title", "Body", Some(p), production::Sound::Silent).is_ok());
    assert!(receipt().portrait.is_none());
}

#[test]
fn denied_permission_is_actionable_and_does_not_claim_delivery() {
    reset(false);
    STATE.with(|s| s.borrow_mut().denied = true);
    let error = production::send("Title", "Body", None, production::Sound::Silent).unwrap_err();
    assert!(error.contains("System Settings"));
    STATE.with(|s| assert!(s.borrow().calls.is_empty()));
}
