//! Read-only workspace snapshots. Never evaluate hooks, commands or instructions.
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use std::{
    io::Read,
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};
type Result<T> = std::result::Result<T, String>;
const MAX_BYTES: usize = 8 * 1024 * 1024;
fn document(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    let name = lower.rsplit('/').next().unwrap_or("");
    matches!(
        name,
        "claude.md"
            | "claude.local.md"
            | "agents.md"
            | "agents.override.md"
            | "memory.md"
            | "system.md"
            | "append_system.md"
    ) || lower == "readme.md"
        || (lower.ends_with(".md")
            && [
                ".claude/rules/",
                ".claude/memory/",
                ".codex/memory/",
                ".codex/memories/",
                ".agents/memory/",
                ".pi/memory/",
                ".pi/memories/",
                ".pi/agent/memory/",
                ".pi/agent/memories/",
                "memory/",
                "memories/",
            ]
            .iter()
            .any(|prefix| lower.starts_with(prefix)))
}
fn walk(
    root: &Path,
    dir: &Path,
    depth: usize,
    paths: &mut Vec<String>,
    skipped: &mut Vec<String>,
    cancel: &AtomicBool,
) -> Result<()> {
    if cancel.load(Ordering::SeqCst) {
        return Err("Workspace scan cancelled".into());
    }
    if depth > 12 {
        return Err("Choose a smaller workspace (maximum depth 12)".into());
    }
    let mut entries = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .collect::<std::io::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.')
            && !matches!(name.as_str(), ".claude" | ".codex" | ".agents" | ".pi")
        {
            continue;
        }
        if matches!(
            name.as_str(),
            "node_modules" | "target" | "vendor" | "venv" | "__pycache__" | "dist" | "build"
        ) {
            continue;
        }
        let relative = path
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        let mut linked = kind.is_symlink();
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            linked |= std::fs::symlink_metadata(&path)
                .map_err(|e| e.to_string())?
                .file_attributes()
                & 0x400
                != 0;
        }
        #[cfg(not(windows))]
        let _ = &mut linked;
        if linked {
            if skipped.len() < 100 {
                skipped.push(format!("Linked path omitted: {relative}"));
            }
            continue;
        }
        if kind.is_dir() {
            walk(root, &path, depth + 1, paths, skipped, cancel)?;
        } else if kind.is_file() {
            paths.push(relative);
            if paths.len() > 5000 {
                return Err("Choose a smaller workspace (up to 5,000 candidate files)".into());
            }
        }
    }
    Ok(())
}
pub fn snapshot(root: &Path, cancel: Arc<AtomicBool>) -> Result<Value> {
    let mut paths = Vec::new();
    let mut warnings = Vec::new();
    walk(root, root, 0, &mut paths, &mut warnings, &cancel)?;
    let mut documents = Vec::new();
    let mut packages = Vec::new();
    let mut bytes = 0usize;
    for relative in paths.iter().filter(|p| document(p)) {
        if documents.len() >= 64 {
            return Err("Choose up to 64 instruction/memory files".into());
        }
        if cancel.load(Ordering::SeqCst) {
            return Err("Workspace scan cancelled".into());
        }
        let mut data = Vec::new();
        crate::local_files::file(&root.join(relative), false)?
            .take(65537)
            .read_to_end(&mut data)
            .map_err(|e| e.to_string())?;
        if data.len() > 65536 {
            warnings.push(format!("Instruction file exceeds 64 KiB: {relative}"));
            continue;
        }
        let content = String::from_utf8(data)
            .map_err(|_| format!("Instruction file must be UTF-8: {relative}"))?;
        bytes += content.len();
        documents.push(json!({"path":relative,"text":content}));
    }
    // Follow in-workspace Markdown references only; all other context stays explicit.
    for _ in 0..4 {
        let mut extra = Vec::new();
        for doc in &documents {
            let parent = Path::new(doc["path"].as_str().unwrap())
                .parent()
                .unwrap_or(Path::new(""));
            for word in doc["text"].as_str().unwrap().split_whitespace() {
                if let Some(reference) = word.strip_prefix('@') {
                    let reference = reference.trim_end_matches([',', ';', ')']);
                    if reference.ends_with(".md")
                        && !reference.contains(['~', ':', '\\'])
                        && !Path::new(reference)
                            .components()
                            .any(|c| !matches!(c, std::path::Component::Normal(_)))
                    {
                        let relative = parent.join(reference).to_string_lossy().replace('\\', "/");
                        if paths.contains(&relative)
                            && !documents.iter().any(|d| d["path"] == relative)
                            && !extra.contains(&relative)
                        {
                            extra.push(relative);
                        }
                    }
                }
            }
        }
        if extra.is_empty() {
            break;
        }
        for relative in extra {
            if documents.len() >= 64 {
                return Err("Too many referenced instruction files".into());
            }
            let mut data = Vec::new();
            crate::local_files::file(&root.join(&relative), false)?
                .take(65537)
                .read_to_end(&mut data)
                .map_err(|e| e.to_string())?;
            if data.len() > 65536 {
                warnings.push(format!("Referenced file exceeds 64 KiB: {relative}"));
                continue;
            }
            let text = String::from_utf8(data)
                .map_err(|_| format!("Referenced file must be UTF-8: {relative}"))?;
            bytes += text.len();
            documents.push(json!({"path":relative,"text":text}));
        }
    }
    if bytes > 512 * 1024 {
        return Err("Instruction and memory text exceeds 512 KiB".into());
    }
    for relative in &paths {
        let skill = relative.rsplit('/').next() == Some("SKILL.md");
        let loose = [".pi/skills/", ".pi/agent/skills/"].iter().any(|prefix| {
            relative
                .strip_prefix(prefix)
                .is_some_and(|p| !p.contains('/') && p.ends_with(".md"))
        }) && crate::skill_files::loose_skill(&root.join(relative));
        let command = crate::skill_files::command_path(relative) || loose;
        if !skill && !command {
            continue;
        }
        if packages.len() >= 256 {
            return Err("Choose a workspace with at most 256 workflows".into());
        }
        let package = (|| -> Result<Value> {
            let parent = Path::new(relative).parent().unwrap_or(Path::new(""));
            let candidates = if skill {
                paths
                    .iter()
                    .filter(|p| {
                        Path::new(p).starts_with(parent)
                            && Path::new(p).strip_prefix(parent).is_ok_and(|r| {
                                !r.components()
                                    .any(|c| c.as_os_str().to_string_lossy().starts_with('.'))
                            })
                    })
                    .collect::<Vec<_>>()
            } else {
                vec![relative]
            };
            if candidates.len() > 128 {
                return Err("A workflow may contain up to 128 files".into());
            }
            let mut files = serde_json::Map::new();
            for path in candidates {
                if cancel.load(Ordering::SeqCst) {
                    return Err("Workspace scan cancelled".into());
                }
                let mut content = Vec::new();
                crate::local_files::file(&root.join(path), false)?
                    .take(2 * 1024 * 1024 + 1)
                    .read_to_end(&mut content)
                    .map_err(|e| e.to_string())?;
                if content.len() > 2 * 1024 * 1024 {
                    return Err("Each supporting file must fit within 2 MiB".into());
                }
                let key = Path::new(path)
                    .strip_prefix(parent)
                    .map_err(|e| e.to_string())?
                    .to_string_lossy()
                    .replace('\\', "/");
                files.insert(key, json!(STANDARD.encode(content)));
                if serde_json::to_vec(&files).map_err(|e| e.to_string())?.len() > MAX_BYTES {
                    return Err("Workflow exceeds 8 MiB".into());
                }
            }
            let name = if skill {
                parent
                    .file_name()
                    .or_else(|| root.file_name())
                    .unwrap_or_default()
            } else {
                Path::new(relative).file_stem().unwrap_or_default()
            };
            Ok(
                json!({"source":relative,"entry":Path::new(relative).file_name().unwrap().to_string_lossy(),"name":name.to_string_lossy(),"files":files}),
            )
        })();
        match package {
            Ok(package) => {
                bytes += serde_json::to_vec(&package)
                    .map_err(|e| e.to_string())?
                    .len();
                if bytes > MAX_BYTES {
                    return Err("Workspace snapshot exceeds 8 MiB".into());
                }
                packages.push(package);
            }
            Err(error) => {
                if cancel.load(Ordering::SeqCst) {
                    return Err(error);
                }
                warnings.push(format!("{relative}: {error}"));
            }
        }
    }
    if documents.is_empty() && packages.is_empty() {
        return Err("No CLAUDE.md, AGENTS.md, memory, command or SKILL.md files found".into());
    }
    documents.sort_by_key(|d| d["path"].as_str().unwrap().to_owned());
    Ok(
        json!({"documents":documents,"packages":packages,"warnings":warnings,"root":root.to_string_lossy()}),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn snapshot_preserves_scopes_and_excludes_unrelated_files() {
        let root = std::env::temp_dir().join(format!("kindred-workspace-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join(".agents/skills/a/references")).unwrap();
        std::fs::create_dir_all(root.join("docs")).unwrap();
        for (path, text) in [
            ("AGENTS.md", "Read @docs/guide.md"),
            ("docs/guide.md", "Scoped guidance"),
            (".agents/skills/a/SKILL.md", "A workflow"),
            (".agents/skills/a/references/a.txt", "Reference"),
            (".env", "secret"),
            ("unrelated.rs", "not context"),
        ] {
            std::fs::write(root.join(path), text).unwrap();
        }
        #[cfg(unix)]
        std::os::unix::fs::symlink("/etc/passwd", root.join("MEMORY.md")).unwrap();
        let v = snapshot(&root, Arc::new(AtomicBool::new(false))).unwrap();
        assert_eq!(v["documents"].as_array().unwrap().len(), 2);
        assert_eq!(v["packages"].as_array().unwrap().len(), 1);
        assert!(!v.to_string().contains("secret"));
        assert!(v.to_string().contains("Scoped guidance"));
        assert!(snapshot(&root, Arc::new(AtomicBool::new(true))).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn discovers_256_cross_harness_workflows_and_rejects_the_257th() {
        let root = std::env::temp_dir().join(format!("kindred-many-{}", uuid::Uuid::new_v4()));
        for folder in [
            ".claude/commands",
            ".codex/prompts",
            ".pi/prompts",
            ".pi/skills",
            ".agents/skills/check",
        ] {
            std::fs::create_dir_all(root.join(folder)).unwrap();
        }
        std::fs::write(root.join("AGENTS.md"), "Portable instructions").unwrap();
        std::fs::write(
            root.join(".pi/skills/review.md"),
            "---\ndescription: Review inputs\n---\nUse supplied arguments",
        )
        .unwrap();
        std::fs::write(root.join(".agents/skills/check/SKILL.md"), "Review things").unwrap();
        for i in 0..254 {
            let folder = [".claude/commands", ".codex/prompts", ".pi/prompts"][i % 3];
            std::fs::write(
                root.join(format!("{folder}/task-{i}.md")),
                "Review $ARGUMENTS",
            )
            .unwrap();
        }
        let scan = snapshot(&root, Arc::new(AtomicBool::new(false))).unwrap();
        assert_eq!(scan["packages"].as_array().unwrap().len(), 256);
        assert_eq!(
            crate::skill_files::scan(&root).unwrap()["candidates"]
                .as_array()
                .unwrap()
                .len(),
            256
        );
        std::fs::write(root.join(".pi/prompts/overflow.md"), "Extra").unwrap();
        assert!(
            snapshot(&root, Arc::new(AtomicBool::new(false)))
                .unwrap_err()
                .contains("256")
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
