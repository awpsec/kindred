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

pub fn send(title: &str, body: &str, portrait: Option<&Path>, sound: Sound) -> Result<mac_usernotifications::NotificationHandle, String> {
    // Regular banners use Notification Center, with Kindred's real bundle identity.
    // The notch remains a separate, explicitly selected presentation.
    let _ = portrait;
    if !mac_usernotifications::blocking::request_auth().map_err(|e| e.to_string())? {
        return Err("Notifications are disabled for Kindred. Enable them in System Settings → Notifications → Kindred.".into());
    }
    let notification = mac_usernotifications::Notification::new()
        .title(title).message(body).timeout(std::time::Duration::from_secs(86400));
    let notification = match sound {
        Sound::Silent => notification,
        Sound::Custom(name) => notification.sound(name),
        Sound::Default => notification.default_sound(),
    };
    // Keep the response handle: discarding it loses the conversation on click.
    // Notification Center owns sound playback and respects Focus/system settings.
    notification.send_blocking().map_err(|error| error.to_string())
}
