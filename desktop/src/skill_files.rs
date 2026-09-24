//! Read-only, bounded discovery of portable command, prompt and skill packages.
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};
type Result<T> = std::result::Result<T, String>;
fn plain(p: &Path) -> Result<()> {
    for parent in p.ancestors() {
        let m = std::fs::symlink_metadata(parent).map_err(|e| e.to_string())?;
        if m.file_type().is_symlink() {
            return Err("Linked paths are not imported".into());
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if m.file_attributes() & 0x400 != 0 {
                return Err("Linked paths are not imported".into());
            }
        }
    }
    Ok(())
}
// Return paths that callers can send back through the ordinary path validator.
// Canonical Windows verbatim prefixes are internal implementation details.
fn public_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    #[cfg(windows)]
    {
        if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{rest}");
        }
        if let Some(rest) = value.strip_prefix(r"\\?\") {
            return rest.to_owned();
        }
    }
    value.into_owned()
}
pub fn default_root() -> Result<String> {
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .ok_or("Home directory unavailable")?;
    Ok(PathBuf::from(home).to_string_lossy().into())
}
fn walk(root: &Path, at: &Path, depth: usize, out: &mut Vec<PathBuf>) -> Result<()> {
    if depth > 12 {
        return Err("Skill folder nesting exceeds 12 levels".into());
    }
    plain(at)?;
    let mut entries = std::fs::read_dir(at)
        .map_err(|e| e.to_string())?
        .collect::<std::io::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let p = e.path();
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.')
            || matches!(
                name.as_str(),
                "node_modules" | "__pycache__" | "target" | "venv"
            )
        {
            continue;
        }
        plain(&p)?;
        if e.file_type().map_err(|e| e.to_string())?.is_dir() {
            walk(root, &p, depth + 1, out)?;
        } else {
            out.push(p.strip_prefix(root).map_err(|e| e.to_string())?.to_owned());
            if out.len() > 5000 {
                return Err("Too many files; choose a smaller skills folder".into());
            }
        }
    }
    Ok(())
}
pub fn command_path(path: &str) -> bool {
    path.ends_with(".md")
        && (path.starts_with("commands/")
            || path.starts_with("prompts/")
            || path.contains("/commands/")
            || path.contains("/prompts/"))
}
pub fn scan(root: &Path) -> Result<Value> {
    let mut candidates = BTreeMap::new();
    let mut warnings = Vec::new();
    let mut bases = Vec::new();
    // An omitted path searches these known home locations only, never the home
    // tree. An explicit project also gets all supported project-local layouts.
    for prefix in ["", ".claude", ".codex", ".agents", ".pi", ".pi/agent"] {
        for folder in ["commands", "prompts", "skills"] {
            let base = root.join(prefix).join(folder);
            if base.is_dir() {
                bases.push((base, folder == "skills"));
            }
        }
    }
    if root.join("SKILL.md").is_file()
        || root
            .file_name()
            .is_some_and(|n| n == "skills" || n == "commands" || n == "prompts")
    {
        bases.push((
            root.to_owned(),
            root.join("SKILL.md").is_file() || root.file_name().is_some_and(|n| n == "skills"),
        ));
    }
    for (base, skills) in bases {
        let mut paths = Vec::new();
        if let Err(e) = walk(&base, &base, 0, &mut paths) {
            warnings.push(format!("{}: {e}", public_path(&base)));
            continue;
        }
        for relative in paths {
            let is_skill = relative.file_name().is_some_and(|s| s == "SKILL.md");
            let loose = skills
                && relative.components().count() == 1
                && relative.extension().is_some_and(|s| s == "md")
                && loose_skill(&base.join(&relative));
            if (skills && (is_skill || loose))
                || (!skills && relative.extension().is_some_and(|s| s == "md"))
            {
                let path = public_path(&base.join(&relative));
                candidates.insert(path.clone(), json!({"path":path,"kind":if skills{"skill"}else{"command"},"name":relative.to_string_lossy()}));
                if candidates.len() > 256 {
                    return Err("Choose up to 256 workflows per import".into());
                }
            }
        }
    }
    let candidates: Vec<_> = candidates.into_values().collect();
    Ok(
        json!({"text":json!({"instructions":"Discovered portable workflows on the paired desktop. Review each with skill_import_local action=preview before import. Use skill_refresh_local for existing linked workflows. This bounded scan does not search arbitrary nested projects or external configured paths.","candidates":candidates,"warnings":warnings,"root":public_path(root)}).to_string(),"candidates":candidates,"warnings":warnings,"root":public_path(root)}),
    )
}
// Pi also accepts a single Markdown skill with descriptive frontmatter.
// The server performs full YAML validation when the candidate is previewed.
pub fn loose_skill(path: &Path) -> bool {
    use std::io::Read;
    if plain(path).is_err() {
        return false;
    }
    let Ok(file) = std::fs::File::open(path) else {
        return false;
    };
    let mut text = String::new();
    if file.take(8192).read_to_string(&mut text).is_err() {
        return false;
    }
    let text = text.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    text.strip_prefix("---\n")
        .and_then(|t| t.split_once("\n---"))
        .is_some_and(|(front, _)| {
            front
                .lines()
                .any(|line| line.starts_with("description:") && !line[12..].trim().is_empty())
        })
}
pub fn bundle(entry: &Path) -> Result<Value> {
    plain(entry)?;
    if entry.extension().is_none_or(|e| e != "md") {
        return Err("Choose a command .md file or SKILL.md".into());
    }
    let root = entry.parent().ok_or("Missing parent folder")?;
    let skill = entry.file_name().is_some_and(|n| n == "SKILL.md");
    let mut paths = vec![entry.file_name().ok_or("Missing file name")?.into()];
    if skill {
        paths.clear();
        walk(root, root, 0, &mut paths)?;
    }
    let mut files = BTreeMap::new();
    let mut total = 0;
    for rel in paths {
        if files.len() >= 128 {
            return Err("A skill may contain up to 128 files".into());
        }
        let p = root.join(&rel);
        plain(&p)?;
        let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
        if !meta.is_file() || meta.len() > 2 * 1024 * 1024 {
            return Err("Each imported file must be a regular file up to 2 MiB".into());
        }
        use std::io::Read;
        let mut bytes = Vec::new();
        std::fs::File::open(&p)
            .map_err(|e| e.to_string())?
            .take(2 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        total += bytes.len();
        if total > 8 * 1024 * 1024 {
            return Err("Skill bundle exceeds 8 MiB".into());
        }
        files.insert(
            rel.to_string_lossy().replace('\\', "/"),
            STANDARD.encode(bytes),
        );
    }
    Ok(
        json!({"entry":entry.file_name().unwrap().to_string_lossy(),"name":if skill{root.file_name().unwrap_or_default().to_string_lossy()}else{entry.file_stem().unwrap_or_default().to_string_lossy()},"source":public_path(entry),"files":files}),
    )
}
