//! Freedesktop notifications, retaining the compositor's click activation token.
use std::{collections::HashMap, path::Path};
use zbus::{blocking::{Connection, MessageIterator, Proxy}, MatchRule, zvariant::Value};
const SERVICE: &str = "org.freedesktop.Notifications";
const PATH: &str = "/org/freedesktop/Notifications";

pub struct Listener {
    id: u32,
    signals: MessageIterator,
    _connection: Connection,
}

pub fn send(title: &str, body: &str, portrait: Option<&Path>, sound: Option<&Path>) -> Result<Listener, String> {
    send_inner(title, body, portrait, sound).map_err(|e| e.to_string())
}
fn send_inner(title: &str, body: &str, portrait: Option<&Path>, sound: Option<&Path>) -> zbus::Result<Listener> {
    let connection = Connection::session()?;
    let owner = zbus::blocking::fdo::DBusProxy::new(&connection)?
        .get_name_owner(SERVICE.try_into()?)?;
    // Subscribe BEFORE Notify, on the same connection; rapid clicks must not be lost.
    let rule = MatchRule::builder().msg_type(zbus::message::Type::Signal)
        .sender(owner.as_str())?.path(PATH)?.interface(SERVICE)?.build();
    let signals = MessageIterator::for_match_rule(rule, &connection, Some(64))?;
    let proxy = Proxy::new(&connection, SERVICE, PATH, SERVICE)?;
    let sound = sound.map(|p| p.to_string_lossy().into_owned());
    let mut hints = HashMap::<&str, Value<'_>>::new();
    hints.insert("desktop-entry", Value::from("Kindred"));
    if let Some(path) = sound.as_deref() { hints.insert("sound-file", Value::from(path)); }
    else { hints.insert("suppress-sound", Value::from(true)); }
    let icon = portrait.map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
    // Server text is plain text, not notification-daemon markup.
    let body = body.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    let id: u32 = proxy.call("Notify", &("Kindred", 0u32, icon.as_str(), title,
        body.as_str(), vec!["default", "Open Kindred"], hints, -1i32))?;
    drop(proxy);
    Ok(Listener { id, signals, _connection: connection })
}
impl Listener {
    pub fn clicked(mut self) -> Option<Option<String>> {
        let mut activation = None;
        for signal in &mut self.signals {
            let Ok(signal) = signal else { return None; };
            let header = signal.header();
            match header.member().map(|m| m.as_str()) {
                Some("ActivationToken") => {
                    if let Ok((id, token)) = signal.body().deserialize::<(u32, String)>() {
                        if id == self.id && !token.is_empty() && token.len() <= 4096 && !token.contains('\0') {
                            activation = Some(token);
                        }
                    }
                }
                Some("ActionInvoked") => {
                    if let Ok((id, action)) = signal.body().deserialize::<(u32, String)>() {
                        if id == self.id { return (action == "default" || action == "open").then_some(activation); }
                    }
                }
                Some("NotificationClosed") => {
                    if let Ok((id, _)) = signal.body().deserialize::<(u32, u32)>() {
                        if id == self.id { return None; }
                    }
                }
                _ => {}
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // Run with dbus-run-session: this is an isolated real D-Bus service, not a
    // desktop popup. Emit before Notify returns to exercise the subscription race.
    fn click_case(token: Option<(u32, &str)>, action: &str) -> Option<Option<String>> {
        let service = Connection::session().unwrap();
        service.request_name(SERVICE).unwrap();
        let mut requests = MessageIterator::from(&service);
        let token = token.map(|(id,t)|(id,t.to_owned()));
        let action = action.to_owned();
        let worker = std::thread::spawn(move || {
            for message in &mut requests {
                let message = message.unwrap();
                if message.header().member().is_some_and(|m| m.as_str() == "Notify") {
                    let (_, _, _, _, body, actions, hints, _): (String,u32,String,String,String,Vec<String>,HashMap<String,zbus::zvariant::OwnedValue>,i32) = message.body().deserialize().unwrap();
                    assert_eq!(body, "Read &lt;draft&gt; &amp; review");
                    assert_eq!(actions, ["default", "Open Kindred"]);
                    assert!(hints.contains_key("desktop-entry"));
                    let destination = message.header().sender().unwrap().to_owned();
                    if let Some((id,token)) = token {
                        service.emit_signal(Some(destination.as_str()),PATH,SERVICE,"ActivationToken",&(id,token)).unwrap();
                    }
                    if action == "closed" {
                        service.emit_signal(Some(destination.as_str()),PATH,SERVICE,"NotificationClosed",&(7u32,2u32)).unwrap();
                    } else {
                        service.emit_signal(Some(destination.as_str()),PATH,SERVICE,"ActionInvoked",&(7u32,action)).unwrap();
                    }
                    service.reply(&message.header(),&7u32).unwrap();
                    // Keep the service name alive through listener receipt.
                    return service;
                }
            }
            panic!("Notify missing");
        });
        let listener = send("Orion", "Read <draft> & review", None, None).unwrap();
        let service = worker.join().unwrap();
        let clicked = listener.clicked();
        drop(service);
        clicked
    }
    #[test] fn click_keeps_activation_token_even_before_notify_returns() { assert_eq!(click_case(Some((7,"wayland-test-token")),"default"),Some(Some("wayland-test-token".into()))); }
    #[test] fn token_from_another_notification_is_not_used() { assert_eq!(click_case(Some((8,"wrong-token")),"default"),Some(None)); }
    #[test] fn older_daemons_without_tokens_still_open_chat() { assert_eq!(click_case(None,"default"),Some(None)); }
    #[test] fn dismiss_does_not_activate_or_navigate() { assert_eq!(click_case(Some((7,"unused")),"closed"),None); }
    #[test] fn unsupported_actions_do_not_activate() { assert_eq!(click_case(None,"unexpected"),None); }
    #[test] fn invalid_token_is_not_forwarded_to_gtk() { assert_eq!(click_case(Some((7,&"x".repeat(4097))),"default"),Some(None)); }
}
