//! Executes the production adapter with an API-shaped test double, not Apple APIs.
extern crate self as mac_notification_sys;
use std::cell::RefCell;
#[derive(Clone, Debug, Default)]
struct Receipt {
    title: String,
    body: String,
    sound: Option<String>,
    portrait: Option<String>,
    asynchronous: bool,
}
#[derive(Default)]
struct State {
    calls: Vec<Receipt>,
    fail: bool,
}
thread_local! { static STATE: RefCell<State> = RefCell::new(State::default()); }
#[derive(Default)]
pub struct Notification<'a> {
    receipt: Receipt,
    marker: std::marker::PhantomData<&'a str>,
}
impl<'a> Notification<'a> {
    pub fn title(&mut self, text: &'a str) -> &mut Self {
        self.receipt.title = text.into();
        self
    }
    pub fn message(&mut self, text: &'a str) -> &mut Self {
        self.receipt.body = text.into();
        self
    }
    pub fn asynchronous(&mut self, value: bool) -> &mut Self {
        self.receipt.asynchronous = value;
        self
    }
    pub fn sound(&mut self, name: &str) -> &mut Self {
        self.receipt.sound = Some(name.into());
        self
    }
    pub fn default_sound(&mut self) -> &mut Self {
        self.receipt.sound = Some("NSUserNotificationDefaultSoundName".into());
        self
    }
    pub fn content_image(&mut self, path: &'a str) -> &mut Self {
        self.receipt.portrait = Some(path.into());
        self
    }
    pub fn send(&self) -> Result<(), String> {
        STATE.with(|s| {
            let mut s = s.borrow_mut();
            s.calls.push(self.receipt.clone());
            if s.fail {
                Err("synthetic native failure".into())
            } else {
                Ok(())
            }
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
        production::send("Title", "Body", None, production::Sound::Default),
        Err("synthetic native failure".into())
    );
    assert!(receipt().asynchronous);
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
        Some("NSUserNotificationDefaultSoundName")
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
