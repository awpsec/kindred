//! The OS opener accepts only an existing regular Markdown download.
use std::path::{Path, PathBuf};
pub fn checked_path(path: &Path) -> Result<PathBuf, String> {
    let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    if !["md", "markdown"]
        .iter()
        .any(|value| extension.eq_ignore_ascii_case(value))
    {
        return Err("Only Markdown downloads can be opened here".into());
    }
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|_| "This download was moved or removed. Download it again.".to_string())?;
    if !metadata.file_type().is_file() {
        return Err("This download is no longer a regular file. Download it again.".into());
    }
    let resolved = path.canonicalize().map_err(|e| e.to_string())?;
    // save_unique stores a canonical directory plus the generated file name.
    // Reject changed parent links as well as a replaced file symlink.
    if resolved != path {
        return Err("The download location changed. Download it again.".into());
    }
    Ok(resolved)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_only_regular_markdown_downloads() {
        let dir =
            std::env::temp_dir().join(format!("kindred-markdown-open-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let dir = dir.canonicalize().unwrap();
        for name in ["skill.md", "Unicode 🦋.MD", "notes.markdown"] {
            let path = dir.join(name);
            std::fs::write(&path, "# Draft\n日本語 é 🦋").unwrap();
            assert_eq!(checked_path(&path).unwrap(), path);
        }
        for name in ["run.exe", "run.md.exe", "run.sh", "report.pdf", "folder.md"] {
            let path = dir.join(name);
            if name == "folder.md" {
                std::fs::create_dir_all(&path).unwrap();
            } else {
                std::fs::write(&path, b"contents").unwrap();
            }
            assert!(checked_path(&path).is_err(), "{name}");
        }
        assert!(checked_path(&dir.join("missing.md")).is_err());
        #[cfg(unix)]
        {
            let link = dir.join("link.md");
            std::os::unix::fs::symlink(dir.join("skill.md"), &link).unwrap();
            assert!(checked_path(&link).is_err());
        }
        std::fs::remove_dir_all(dir).unwrap();
    }
}
