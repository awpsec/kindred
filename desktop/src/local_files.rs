//! Native file operations. No paths or commands are accepted directly from web IPC.
use serde_json::{Value, json};
use std::{
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
type Result<T> = std::result::Result<T, String>;
const LIMIT: u64 = 1_048_576;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
pub fn install_root() -> Result<PathBuf> {
    #[cfg(not(windows))]
    {
        let home = std::env::var_os("HOME").ok_or("Home directory unavailable")?;
        #[cfg(target_os = "macos")]
        let root = PathBuf::from(home).join("Library/Application Support/Kindred");
        #[cfg(not(target_os = "macos"))]
        let root = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(home).join(".local/share"))
            .join("kindred");
        std::fs::create_dir_all(&root).map_err(err)?;
        return Ok(root);
    }
    #[cfg(windows)]
    {
        let exe = std::env::current_exe().map_err(err)?;
        let parent = exe.parent().ok_or("Cannot locate Kindred installation")?;
        Ok(
            if parent
                .parent()
                .is_some_and(|p| p.file_name().is_some_and(|n| n == "versions"))
            {
                parent
                    .parent()
                    .unwrap()
                    .parent()
                    .ok_or("Invalid installation")?
                    .to_owned()
            } else {
                parent.to_owned()
            },
        )
    }
}
pub fn atomic(path: &Path, v: &Value) -> Result<()> {
    let temp = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut f = options.open(&temp).map_err(err)?;
    f.write_all(v.to_string().as_bytes()).map_err(err)?;
    f.sync_all().map_err(err)?;
    drop(f);
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let from: Vec<u16> = temp.as_os_str().encode_wide().chain([0]).collect();
        let to: Vec<u16> = path.as_os_str().encode_wide().chain([0]).collect();
        if unsafe {
            windows_sys::Win32::Storage::FileSystem::MoveFileExW(
                from.as_ptr(),
                to.as_ptr(),
                0x1 | 0x8,
            )
        } == 0
        {
            let _ = std::fs::remove_file(temp);
            return Err(err(std::io::Error::last_os_error()));
        }
    }
    #[cfg(not(windows))]
    std::fs::rename(temp, path).map_err(err)?;
    Ok(())
}
fn plain(path: &Path) -> Result<()> {
    let mut part = PathBuf::new();
    for c in path.components() {
        if matches!(c, Component::ParentDir) {
            return Err(
                "Parent traversal is not allowed; use an absolute path for outside access".into(),
            );
        }
        part.push(c);
        if let Component::Normal(n) = c {
            let s = n.to_str().ok_or("Path is not Unicode")?;
            if s.chars().any(|c| c.is_control()) || s.contains(':') || s.ends_with(['.', ' ']) {
                return Err("Invalid path component".into());
            }
            let base = s.split('.').next().unwrap_or("").to_ascii_uppercase();
            if matches!(base.as_str(), "CON" | "PRN" | "AUX" | "NUL")
                || ["COM", "LPT"].iter().any(|p| {
                    base.strip_prefix(p).is_some_and(|n| {
                        matches!(n, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
                    })
                })
            {
                return Err("Device paths are not allowed".into());
            }
        }
        match std::fs::symlink_metadata(&part) {
            Ok(m) => {
                if m.file_type().is_symlink() {
                    return Err("Symbolic links are not allowed in local tool paths".into());
                }
                #[cfg(windows)]
                {
                    use std::os::windows::fs::MetadataExt;
                    if m.file_attributes() & 0x400 != 0 {
                        return Err("Reparse points are not allowed in local tool paths".into());
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(err(e)),
        }
    }
    Ok(())
}
// WSL's local redirector is a local OS surface, not an arbitrary SMB host.
// Accept only a named distribution registered to this Windows user. The normal
// path/link checks and native approval still run after this narrow exception.
fn registered_wsl_path(raw: &str) -> bool {
    #[cfg(windows)]
    {
        use std::path::Prefix;
        use winreg::{RegKey, enums::HKEY_CURRENT_USER};
        let Some(Component::Prefix(prefix)) = Path::new(raw).components().next() else {
            return false;
        };
        let Prefix::UNC(server, distribution) = prefix.kind() else {
            return false;
        };
        let (Some(server), Some(distribution)) = (server.to_str(), distribution.to_str()) else {
            return false;
        };
        if !(server.eq_ignore_ascii_case("wsl.localhost") || server.eq_ignore_ascii_case("wsl$")) {
            return false;
        }
        let Ok(root) = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Lxss")
        else {
            return false;
        };
        root.enum_keys().filter_map(|key| key.ok()).any(|key| {
            root.open_subkey(key)
                .ok()
                .and_then(|key| key.get_value::<String, _>("DistributionName").ok())
                .is_some_and(|name| name.eq_ignore_ascii_case(distribution))
        })
    }
    #[cfg(not(windows))]
    {
        let _ = raw;
        false
    }
}
pub fn resolve(root: &Path, raw: &str) -> Result<(PathBuf, bool)> {
    if raw.len() > 4000
        || raw.contains('\0')
        || ((raw.starts_with("\\\\") || raw.starts_with("//")) && !registered_wsl_path(raw))
    {
        return Err("Network and device paths are not allowed".into());
    }
    plain(root)?;
    let p = Path::new(raw);
    #[cfg(windows)]
    if !p.is_absolute()
        && p.components()
            .any(|c| matches!(c, Component::Prefix(_) | Component::RootDir))
    {
        return Err("Use a full absolute path or a workspace-relative path".into());
    }
    let path = if p.is_absolute() {
        p.to_owned()
    } else {
        root.join(p)
    };
    plain(&path)?;
    // Canonicalize existing parents, then append at most one new filename.
    let canonical = if path.exists() {
        std::fs::canonicalize(&path).map_err(err)?
    } else {
        let parent = path.parent().ok_or("Invalid path")?;
        std::fs::canonicalize(parent)
            .map_err(err)?
            .join(path.file_name().ok_or("Invalid filename")?)
    };
    let home = std::fs::canonicalize(root).map_err(err)?;
    Ok((canonical.clone(), canonical.starts_with(home)))
}
pub fn needs_approval(mode: &str, inside: bool, tool: &str) -> Result<bool> {
    match mode {
        "workspace" if inside && tool!="local_exec"=>Ok(false),
        "workspace"=>Err("Workspace-only access does not allow outside files or commands. Change permissions in the native Kindred window if intended".into()),
        "ask"=>Ok(!inside || tool=="local_exec"),
        "full"=>Ok(false),
        _=>Err("Local access is off on this desktop".into()),
    }
}
pub(crate) fn file(path: &Path, write: bool) -> Result<std::fs::File> {
    let mut opts = std::fs::OpenOptions::new();
    opts.read(!write).write(write);
    if write {
        opts.create(true);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        opts.custom_flags(0x00200000);
        opts.share_mode(1);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.custom_flags(libc::O_NOFOLLOW);
    }
    let f = opts.open(path).map_err(err)?;
    let m = f.metadata().map_err(err)?;
    if !m.is_file() {
        return Err("The target is not a regular file".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if m.nlink() > 1 {
            return Err("Hard-linked files are not allowed".into());
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Storage::FileSystem::{
            BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle,
        };
        let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
        if unsafe { GetFileInformationByHandle(f.as_raw_handle(), &mut info) } == 0 {
            return Err(err(std::io::Error::last_os_error()));
        }
        if info.nNumberOfLinks > 1 || info.dwFileAttributes & 0x400 != 0 {
            return Err("Linked files are not allowed".into());
        }
    }
    Ok(f)
}
pub fn execute(tool: &str, path: &Path, args: &Value, cancel: Arc<AtomicBool>) -> Result<Value> {
    if cancel.load(Ordering::SeqCst) {
        return Err("Local operation was cancelled".into());
    }
    match tool {
        "local_workspace_bundle" => crate::workspace_files::snapshot(path, cancel),
        "local_skill_scan" => crate::skill_files::scan(path),
        "local_skill_bundle" => crate::skill_files::bundle(path),
        "local_list" => {
            let mut entries = Vec::new();
            let mut truncated = false;
            for item in std::fs::read_dir(path).map_err(err)? {
                if entries.len() >= 1000 {
                    truncated = true;
                    break;
                }
                let entry = item.map_err(err)?;
                let kind = entry.file_type().map_err(err)?;
                entries.push(json!({"name":entry.file_name().to_string_lossy(),"directory":kind.is_dir(),"symlink":kind.is_symlink()}));
            }
            Ok(json!({"text":json!({"entries":entries,"truncated":truncated}).to_string()}))
        }
        "local_read" => {
            let f = file(path, false)?;
            if f.metadata().map_err(err)?.len() > LIMIT {
                return Err("File exceeds 1 MiB".into());
            }
            let mut s = String::new();
            f.take(LIMIT + 1).read_to_string(&mut s).map_err(err)?;
            if s.len() > LIMIT as usize {
                return Err("File exceeds 1 MiB".into());
            }
            Ok(json!({"text":s}))
        }
        "local_write" => {
            let s = args["text"].as_str().ok_or("Missing file text")?;
            if s.len() > LIMIT as usize {
                return Err("File exceeds 1 MiB".into());
            }
            let mut f = file(path, true)?;
            f.set_len(0).map_err(err)?;
            f.write_all(s.as_bytes()).map_err(err)?;
            f.sync_all().map_err(err)?;
            Ok(json!({"text":format!("Wrote {} bytes",s.len())}))
        }
        "local_mkdir" => {
            std::fs::create_dir(path).map_err(err)?;
            Ok(json!({"text":"Directory created"}))
        }
        "local_exec" => command(path, args, cancel),
        _ => Err("Unknown local operation".into()),
    }
}
fn command(path: &Path, args: &Value, cancel: Arc<AtomicBool>) -> Result<Value> {
    use std::process::{Command, Stdio};
    let script = args["command"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 16000)
        .ok_or("Invalid command")?;
    let timeout_seconds = match args.get("timeout_seconds") {
        None | Some(Value::Null) => 60,
        Some(v) => v
            .as_u64()
            .filter(|s| (1..=120).contains(s))
            .ok_or("Command timeout must be 1 to 120 seconds")?,
    };
    #[cfg(windows)]
    let mut cmd = {
        use std::os::windows::process::CommandExt;
        let mut c = Command::new("powershell.exe");
        // Parse the complete script, including multiline blocks, after stdin
        // closes. User command contents never appear in process arguments.
        c.args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
            "[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false); [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); $OutputEncoding = [Console]::OutputEncoding; & ([ScriptBlock]::Create([Console]::In.ReadToEnd()))"])
            .creation_flags(0x08000000);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = {
        use std::os::unix::process::CommandExt;
        let mut c = Command::new("/bin/sh");
        c.arg("-s").process_group(0);
        c
    };
    let mut child = cmd
        .current_dir(path)
        .env_remove("KINDRED_ACCESS_TOKEN")
        .env_remove("KINDRED_SERVER_URL")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(err)?;
    #[cfg(windows)]
    let job = match Job::attach(&child) {
        Ok(j) => j,
        Err(e) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(e);
        }
    };
    let drain = |mut stream: Box<dyn Read + Send>| {
        std::thread::spawn(move || {
            let mut output = Vec::new();
            let mut truncated = false;
            let mut buf = [0u8; 8192];
            while let Ok(n) = stream.read(&mut buf) {
                if n == 0 {
                    break;
                }
                let count = n.min((256 * 1024usize).saturating_sub(output.len()));
                truncated |= count < n;
                output.extend_from_slice(&buf[..count]);
            }
            (String::from_utf8_lossy(&output).into_owned(), truncated)
        })
    };
    let out = drain(Box::new(child.stdout.take().unwrap()));
    let errors = drain(Box::new(child.stderr.take().unwrap()));
    let write_result = if let Some(mut input) = child.stdin.take() {
        input.write_all(format!("{script}\n").as_bytes())
    } else {
        Ok(())
    };
    let start = Instant::now();
    let mut stopped = write_result.is_err();
    let status = loop {
        if stopped
            || cancel.load(Ordering::SeqCst)
            || start.elapsed() > Duration::from_secs(timeout_seconds)
        {
            stopped = true;
            break None;
        }
        match child.try_wait() {
            Ok(Some(s)) => break Some(s),
            Ok(None) => {}
            Err(_) => {
                stopped = true;
                break None;
            }
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    // Always terminate descendants, including background children after parent exit.
    #[cfg(windows)]
    drop(job);
    #[cfg(not(windows))]
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    let _ = child.kill();
    let _ = child.wait();
    let elapsed_seconds = start.elapsed().as_secs();
    let timed_out = stopped && !cancel.load(Ordering::SeqCst) && elapsed_seconds >= timeout_seconds;
    let failed = stopped || status.is_none_or(|s| !s.success());
    let exit_code = status.and_then(|s| s.code());
    let (stdout, stdout_truncated) = out.join().unwrap_or_default();
    let (stderr, stderr_truncated) = errors.join().unwrap_or_default();
    let output_truncated = stdout_truncated || stderr_truncated;
    let mut text = format!("{stdout}{stderr}");
    let outcome = if timed_out {
        format!(
            "Command timed out after {timeout_seconds}s. It was stopped and will not be replayed automatically. Partial output is shown above if available. A timeout does not prove a permissions problem or that WSL cannot be used; verify the desktop's current state before retrying."
        )
    } else if stopped {
        "Command stopped before completion (cancellation, connection loss, or input failure). Verify any partial effects before retrying.".into()
    } else if failed {
        format!(
            "Command exited with code {}.",
            exit_code
                .map(|n| n.to_string())
                .unwrap_or_else(|| "unknown".into())
        )
    } else if text.trim().is_empty() {
        "Command completed successfully with no output.".into()
    } else {
        String::new()
    };
    if !outcome.is_empty() {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(&outcome);
    }
    if output_truncated {
        let streams = match (stdout_truncated, stderr_truncated) {
            (true, true) => "standard output and standard error",
            (true, false) => "standard output",
            _ => "standard error",
        };
        text.push_str(&format!("\nOutput truncated: {streams} exceeded the 256 KiB per-stream capture limit. This is partial output; do not assume omitted lines were empty or successful."));
    }
    Ok(
        json!({"text":text,"failed":failed,"stopped":stopped,"timed_out":timed_out,"elapsed_seconds":elapsed_seconds,"exit_code":exit_code,"output_limit_bytes":524288,"output_truncated":output_truncated,"stdout_truncated":stdout_truncated,"stderr_truncated":stderr_truncated}),
    )
}
#[cfg(windows)]
pub(crate) struct Job(windows_sys::Win32::Foundation::HANDLE);
// A job is an owned kernel handle, independent of the creating thread. Moving it
// into the resident worker's mutex transfers ownership; it is never duplicated.
#[cfg(windows)]
unsafe impl Send for Job {}
#[cfg(windows)]
impl Job {
    pub(crate) fn attach(child: &std::process::Child) -> Result<Self> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::*;
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return Err(err(std::io::Error::last_os_error()));
            }
            let job = Self(handle);
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as _,
                std::mem::size_of_val(&limits) as u32,
            ) == 0
                || AssignProcessToJobObject(handle, child.as_raw_handle()) == 0
            {
                return Err(err(std::io::Error::last_os_error()));
            }
            Ok(job)
        }
    }
}
#[cfg(windows)]
impl Drop for Job {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

#[cfg(test)]
#[path = "local_command_tests.rs"]
mod command_tests;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn workspace_and_explicit_outside() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        let root = dir.join("workspace");
        std::fs::create_dir_all(&root).unwrap();
        assert!(resolve(&root, "../outside").is_err());
        assert!(resolve(&root, "NUL.txt").is_err());
        assert!(resolve(&root, "file:stream").is_err());
        assert!(resolve(&root, "\\\\server\\file").is_err());
        let (file, inside) = resolve(&root, "example.txt").unwrap();
        assert!(inside);
        let cancel = Arc::new(AtomicBool::new(false));
        execute(
            "local_write",
            &file,
            &json!({"text":"hello"}),
            cancel.clone(),
        )
        .unwrap();
        assert_eq!(
            execute("local_read", &file, &json!({}), cancel).unwrap()["text"],
            "hello"
        );
        let (_, inside) = resolve(&root, dir.join("outside").to_str().unwrap()).unwrap();
        assert!(!inside);
        assert!(needs_approval("workspace", inside, "local_read").is_err());
        assert_eq!(needs_approval("ask", inside, "local_read").unwrap(), true);
        assert!(needs_approval("workspace", true, "local_exec").is_err());
        assert!(needs_approval("ask", true, "local_exec").unwrap());
        assert!(!needs_approval("full", false, "local_exec").unwrap());
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn hard_links_cannot_reach_outside() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir(&dir).unwrap();
        let a = dir.join("a");
        let b = dir.join("b");
        std::fs::write(&a, "keep").unwrap();
        std::fs::hard_link(&a, &b).unwrap();
        assert!(file(&b, true).is_err());
        assert_eq!(std::fs::read_to_string(&a).unwrap(), "keep");
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn command_output_and_cancellation() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir(&dir).unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        #[cfg(windows)]
        let script = "Write-Output 'local bridge verified'";
        #[cfg(not(windows))]
        let script = "printf 'local bridge verified'";
        let result = execute(
            "local_exec",
            &dir,
            &json!({"command":script}),
            cancel.clone(),
        )
        .unwrap();
        assert_eq!(result["failed"], false);
        assert!(
            result["text"]
                .as_str()
                .unwrap()
                .contains("local bridge verified")
        );
        let flag = cancel.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(700));
            flag.store(true, Ordering::SeqCst);
        });
        #[cfg(windows)]
        let script = "Start-Sleep -Seconds 30";
        #[cfg(not(windows))]
        let script = "sleep 30";
        let start = Instant::now();
        let result = execute("local_exec", &dir, &json!({"command":script}), cancel).unwrap();
        assert_eq!(result["stopped"], true);
        assert!(start.elapsed() < Duration::from_secs(5));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
