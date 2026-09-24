//! An update may carry the live session through its child process environment.
//! No token is placed in argv, update status, a log, or an extra disk file.
use serde::{Deserialize, Serialize};

#[cfg_attr(test, allow(dead_code))]
pub const ENV: &str = "KINDRED_UPDATE_SESSION";
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Handoff {
    pub server: String,
    pub profile_id: String,
    pub token: String,
    pub remember: bool,
    pub expires: u64,
}
impl Handoff {
    pub fn parse(value: &str, now: u64) -> Option<Self> {
        if value.len() > 4096 {
            return None;
        }
        let v: Self = serde_json::from_str(value).ok()?;
        if v.expires <= now
            || v.expires > now + 900
            || v.token.is_empty()
            || v.token.len() > 256
            || v.token.chars().any(char::is_control)
            || !(v.profile_id == "legacy" || uuid::Uuid::parse_str(&v.profile_id).is_ok())
        {
            return None;
        }
        Some(v)
    }
}
#[cfg_attr(test, allow(dead_code))]
pub fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn update_session_is_short_lived_and_preserves_temporary_choice() {
        let v = Handoff {
            server: "https://example.test".into(),
            profile_id: "legacy".into(),
            token: "fixture-secret".into(),
            remember: false,
            expires: 1200,
        };
        let text = serde_json::to_string(&v).unwrap();
        assert!(!Handoff::parse(&text, 1000).unwrap().remember);
        assert!(Handoff::parse(&text, 1200).is_none());
        assert!(Handoff::parse(&text, 1).is_none());
        assert!(Handoff::parse(&text.replace("legacy", "unassigned"), 1000).is_none());
        assert!(Handoff::parse(&text.replace("fixture-secret", ""), 1000).is_none());
    }
}
