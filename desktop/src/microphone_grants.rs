//! Device-local consent, scoped to both the connected server and account.
use serde_json::json;
use std::path::PathBuf;

#[derive(Clone)]
pub struct Grant {
    path: PathBuf,
    origin: String,
    profile: String,
}
impl Grant {
    pub fn new(root: PathBuf, origin: String, profile: String) -> Self {
        Self {
            path: root.join(format!(
                "microphone-{}.json",
                crate::profiles::key(&origin, &profile)
            )),
            origin,
            profile,
        }
    }
    pub fn allowed(&self) -> bool {
        std::fs::read(&self.path)
            .ok()
            .filter(|s| s.len() < 8192)
            .and_then(|s| serde_json::from_slice::<serde_json::Value>(&s).ok())
            .is_some_and(|v| {
                v["origin"] == self.origin && v["profile"] == self.profile && v["allowed"] == true
            })
    }
    pub fn save(&self, allowed: bool) -> Result<(), String> {
        crate::local_files::atomic(
            &self.path,
            &json!({"origin":self.origin,"profile":self.profile,"allowed":allowed}),
        )
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persists_revokes_and_isolates_accounts_and_servers() {
        let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&root).unwrap();
        let grant = Grant::new(root.clone(), "https://one.test".into(), "alice".into());
        assert!(!grant.allowed());
        grant.save(true).unwrap();
        assert!(Grant::new(root.clone(), "https://one.test".into(), "alice".into()).allowed());
        assert!(!Grant::new(root.clone(), "https://one.test".into(), "bob".into()).allowed());
        assert!(!Grant::new(root.clone(), "https://two.test".into(), "alice".into()).allowed());
        grant.save(false).unwrap();
        assert!(!grant.allowed());
        std::fs::write(&grant.path, b"invalid").unwrap();
        assert!(!grant.allowed());
        std::fs::remove_dir_all(root).unwrap();
    }
}
