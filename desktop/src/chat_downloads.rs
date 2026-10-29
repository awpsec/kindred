//! A device-local index. Receipts never grant arbitrary path access to a page.
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};
#[derive(Clone, Deserialize, Serialize)]
pub struct SavedFile {
    pub scope: String,
    pub file_id: String,
    pub path: PathBuf,
}
pub struct DownloadIndex {
    file: PathBuf,
    records: HashMap<String, SavedFile>,
}
impl DownloadIndex {
    pub fn load(file: PathBuf) -> Self {
        let records = std::fs::metadata(&file)
            .ok()
            .filter(|m| m.len() < 1024 * 1024)
            .and_then(|_| std::fs::read(&file).ok())
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        Self { file, records }
    }
    pub fn get(&self, receipt: &str, scope: &str) -> Option<&SavedFile> {
        self.records
            .get(receipt)
            .filter(|r| r.scope == scope && regular_file(&r.path))
    }
    pub fn find(&self, id: &str, scope: &str) -> Option<String> {
        self.records
            .iter()
            .find(|(_, r)| r.file_id == id && r.scope == scope && regular_file(&r.path))
            .map(|(key, _)| key.clone())
    }
    pub fn insert(&mut self, receipt: String, record: SavedFile) -> Result<(), String> {
        self.records.retain(|_, r| {
            regular_file(&r.path) && !(r.scope == record.scope && r.file_id == record.file_id)
        });
        // Bound metadata, without deleting any downloaded files.
        if self.records.len() >= 2048 {
            if let Some(key) = self.records.keys().next().cloned() {
                self.records.remove(&key);
            }
        }
        self.records.insert(receipt, record);
        let parent = self
            .file
            .parent()
            .ok_or("Download index folder unavailable")?;
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let temporary = self.file.with_extension("tmp");
        let bytes = serde_json::to_vec(&self.records).map_err(|e| e.to_string())?;
        std::fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
        // On Windows rename cannot replace an existing destination.
        #[cfg(windows)]
        if self.file.exists() {
            std::fs::remove_file(&self.file).map_err(|e| e.to_string())?;
        }
        std::fs::rename(&temporary, &self.file).map_err(|e| e.to_string())
    }
}
fn regular_file(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok_and(|m| m.is_file() && !m.file_type().is_symlink())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn receipts_survive_reload_but_never_cross_accounts_or_devices() {
        let root = std::env::temp_dir().join(format!("kindred-downloads-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let file = root.join("report.xlsx");
        std::fs::write(&file, b"original").unwrap();
        let index_path = root.join("index.json");
        let mut index = DownloadIndex::load(index_path.clone());
        index
            .insert(
                "receipt".into(),
                SavedFile {
                    scope: "account-a".into(),
                    file_id: "attachment-a".into(),
                    path: file.clone(),
                },
            )
            .unwrap();
        let index = DownloadIndex::load(index_path);
        assert_eq!(
            index.find("attachment-a", "account-a"),
            Some("receipt".into())
        );
        assert!(index.find("attachment-a", "account-b").is_none());
        assert!(index.get("receipt", "account-b").is_none());
        assert!(
            DownloadIndex::load(root.join("other-device.json"))
                .find("attachment-a", "account-a")
                .is_none()
        );
        std::fs::remove_file(&file).unwrap();
        assert!(index.find("attachment-a", "account-a").is_none());
        assert!(index.get("receipt", "account-a").is_none());
        std::fs::remove_dir_all(root).unwrap();
    }
}
