//! Explicit system-owned delivery; dropping a notify-rust handle hides errors.
use std::path::Path;

pub enum Sound {
    Silent,
    Custom(&'static str),
    Default,
}

pub fn prepare_sound<E>(
    allowed: bool,
    name: &'static str,
    prepare: impl FnOnce() -> Result<(), E>,
) -> Sound {
    if !allowed {
        return Sound::Silent;
    }
    match prepare() {
        Ok(()) => Sound::Custom(name),
        Err(_) => {
            eprintln!("Kindred custom notification sound is unavailable; using the system sound");
            Sound::Default
        }
    }
}

pub fn send(title: &str, body: &str, portrait: Option<&Path>, sound: Sound) -> Result<(), String> {
    // The previous NS bridge did not forward Notification.icon to the system
    // banner. Keep that appearance; notch portraits use their separate path.
    let _ = portrait;
    let mut notification = mac_notification_sys::Notification::default();
    notification.title(title).message(body).asynchronous(true);
    match sound {
        Sound::Silent => {}
        Sound::Custom(name) => {
            notification.sound(name);
        }
        Sound::Default => {
            notification.default_sound();
        }
    }
    // The OS owns playback, including Focus and the application's sound setting.
    // Do not add an afplay fallback or retry a possibly delivered notification.
    notification
        .send()
        .map(|_| ())
        .map_err(|error| error.to_string())
}
