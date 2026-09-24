//! Detached, journaled command worker shared with the native desktop.
//! The launch marker is never removed: an uncertain execution is never replayed.
use fs2::FileExt;
use serde_json::{Value, json};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
const LIMIT: usize = 32768;
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn directory(root: &Path, id: &str) -> Result<PathBuf> {
    if uuid::Uuid::parse_str(id).is_err() {
        return Err("Invalid command ID".into());
    }
    let dir = root.join(id);
    if fs::symlink_metadata(&dir).is_ok_and(|m| m.file_type().is_symlink()) {
        return Err("Command directory cannot be a link".into());
    }
    Ok(dir)
}
fn save(path: &Path, value: &Value) -> Result<()> {
    // Readers see complete JSON. Windows needs an explicit replacement step;
    // a missing progress snapshot is retried, never interpreted as completion.
    let tmp = path.with_extension("new");
    let mut file = File::create(&tmp)?;
    file.write_all(&serde_json::to_vec(value)?)?;
    file.sync_all()?;
    #[cfg(windows)]
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(tmp, path)?;
    Ok(())
}
pub fn start(root: &Path, id: &str, args: &Value) -> Result<Value> {
    let script = args["command"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 32000)
        .ok_or("Command must be 1..32000 bytes")?;
    let _ = script;
    let seconds = args["max_seconds"].as_u64().unwrap_or(86400);
    if !(1..=604800).contains(&seconds) {
        return Err("Maximum duration must be 1 second to 7 days".into());
    }
    let dir = directory(root, id)?;
    fs::create_dir_all(root)?;
    match fs::create_dir(&dir) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => return status(root, id),
        Err(e) => return Err(e.into()),
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o700))?;
    }
    let mut request = args.clone();
    request["created"] = json!(now());
    request["max_seconds"] = json!(seconds);
    save(&dir.join("request.json"), &request)?;
    let mut command = Command::new(std::env::current_exe()?);
    command
        .arg("--kindred-command-worker")
        .arg(&dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000 | 0x00000200);
    }
    match command.spawn() {
        Ok(mut child) => {
            std::thread::spawn(move || {
                let _ = child.wait();
            });
        }
        Err(e) => {
            save(
                &dir.join("result.json"),
                &json!({"status":"failed","failed":true,"text":format!("Could not start command worker: {e}")}),
            )?;
        }
    }
    status(root, id)
}
pub fn stop(root: &Path, id: &str) -> Result<Value> {
    let dir = directory(root, id)?;
    if dir.is_dir() {
        File::create(dir.join("stop"))?.sync_all()?;
    }
    status(root, id)
}
pub fn status(root: &Path, id: &str) -> Result<Value> {
    let dir = directory(root, id)?;
    let read = |name: &str| -> Option<Value> {
        serde_json::from_slice(&fs::read(dir.join(name)).ok()?).ok()
    };
    let mut value = if let Some(result) = read("result.json") {
        result
    } else {
        let request = read("request.json");
        let created = request
            .as_ref()
            .and_then(|v| v["created"].as_u64())
            .unwrap_or(0);
        let held = OpenOptions::new()
            .read(true)
            .write(true)
            .open(dir.join("lock"))
            .ok()
            .is_some_and(|f| f.try_lock_exclusive().is_err());
        if held || (created > 0 && now().saturating_sub(created) < 30) {
            let mut progress =
                read("progress.json").unwrap_or_else(|| json!({"text":"Starting command…"}));
            progress["status"] = json!(if held { "running" } else { "starting" });
            progress
        } else {
            json!({"status":"unknown","failed":true,"text":"Command worker is unavailable. Its outcome is unknown; it was not replayed. Inspect existing effects before starting another command."})
        }
    };
    value["id"] = json!(id);
    Ok(value)
}
pub fn worker_argument() -> bool {
    if std::env::args().nth(1).as_deref() != Some("--kindred-command-worker") {
        return false;
    }
    if let Some(dir) = std::env::args_os().nth(2) {
        let dir = PathBuf::from(dir);
        // Acquire before the immutable claim. Two accidentally started workers
        // can never both execute the script, including after a worker crash.
        if let Err(e) = worker(&dir) {
            eprintln!("Command worker: {e}");
        }
    }
    true
}
fn worker(dir: &Path) -> Result<()> {
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(dir.join("lock"))?;
    lock.try_lock_exclusive()?;
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dir.join("claimed"))?
        .sync_all()?;
    let result = run(dir).unwrap_or_else(|e|json!({"status":"failed","failed":true,"text":format!("Command worker failed: {e}. Inspect partial effects before retrying.")}));
    save(&dir.join("result.json"), &result)?;
    Ok(())
}
fn run(dir: &Path) -> Result<Value> {
    let request: Value = serde_json::from_slice(&fs::read(dir.join("request.json"))?)?;
    if dir.join("stop").exists() {
        return Ok(json!({"status":"cancelled","failed":true,"text":"Stopped before launch"}));
    }
    let script = request["command"].as_str().ok_or("Missing command")?;
    #[cfg(windows)]
    let mut command = {
        use std::os::windows::process::CommandExt;
        let mut c = Command::new("powershell.exe");
        c.args(["-NoLogo","-NoProfile","-NonInteractive","-Command","[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false); [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); & ([ScriptBlock]::Create([Console]::In.ReadToEnd()))"]).creation_flags(0x08000000);
        c
    };
    #[cfg(unix)]
    let mut command = {
        use std::os::unix::process::CommandExt;
        let mut c = Command::new("/bin/sh");
        c.arg("-s").process_group(0);
        c
    };
    command
        .current_dir(request["path"].as_str().ok_or("Missing working folder")?)
        .env_remove("KINDRED_ACCESS_TOKEN")
        .env_remove("KINDRED_SERVER_URL");
    if let Some(zone) = request["timezone"].as_str() {
        command.env("TZ", zone);
    }
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    #[cfg(windows)]
    let job = match crate::local_files::Job::attach(&child) {
        Ok(job) => job,
        Err(e) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(e.into());
        }
    };
    let output = Arc::new(Mutex::new((Vec::<u8>::new(), 0u64)));
    let drain = |mut input: Box<dyn Read + Send>| {
        let output = output.clone();
        std::thread::spawn(move || {
            let mut bytes = [0u8; 4096];
            while let Ok(n) = input.read(&mut bytes) {
                if n == 0 {
                    break;
                }
                let mut tail = output.lock().unwrap();
                tail.1 += n as u64;
                tail.0.extend_from_slice(&bytes[..n]);
                if tail.0.len() > LIMIT {
                    let excess = tail.0.len() - LIMIT;
                    tail.0.drain(..excess);
                }
            }
        })
    };
    let _out = drain(Box::new(child.stdout.take().unwrap()));
    let _err = drain(Box::new(child.stderr.take().unwrap()));
    // A shell can execute its first line before reading the rest. Never let a
    // full stdin pipe prevent deadline/cancellation checks on a long script.
    let mut input = child.stdin.take().unwrap();
    let script = format!("{script}\n").into_bytes();
    let input_failed = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let failed = input_failed.clone();
    std::thread::spawn(move || {
        if input.write_all(&script).is_err() {
            failed.store(true, std::sync::atomic::Ordering::SeqCst);
        }
    });
    let start = Instant::now();
    let mut last_save = Instant::now() - Duration::from_secs(2);
    let mut failure = None;
    let exit = loop {
        if input_failed.load(std::sync::atomic::Ordering::SeqCst) {
            failure = Some("failed");
            break None;
        }
        if dir.join("stop").exists() {
            failure = Some("cancelled");
            break None;
        }
        if start.elapsed().as_secs() >= request["max_seconds"].as_u64().unwrap_or(86400) {
            failure = Some("timed_out");
            break None;
        }
        match child.try_wait() {
            Ok(Some(code)) => break Some(code),
            Ok(None) => {}
            Err(_) => {
                failure = Some("unknown");
                break None;
            }
        }
        if last_save.elapsed() >= Duration::from_secs(1) {
            let tail = output.lock().unwrap();
            let _ = save(
                &dir.join("progress.json"),
                &json!({"text":String::from_utf8_lossy(&tail.0),"output_bytes":tail.1,"output_truncated":tail.1>LIMIT as u64,"elapsed_seconds":start.elapsed().as_secs()}),
            );
            last_save = Instant::now();
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    #[cfg(windows)]
    drop(job);
    #[cfg(unix)]
    {
        let _ = Command::new("/bin/kill")
            .args(["-KILL", "--", &format!("-{}", child.id())])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
    // Pipe readers normally finish immediately after the group exits. A command
    // that deliberately escapes the group must not hold completion indefinitely.
    for _ in 0..10 {
        if _out.is_finished() && _err.is_finished() {
            break;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let tail = output.lock().unwrap();
    let state = failure.unwrap_or(if exit.is_some_and(|s| s.success()) {
        "completed"
    } else {
        "failed"
    });
    Ok(
        json!({"status":state,"failed":state!="completed","exit_code":exit.and_then(|s|s.code()),"text":String::from_utf8_lossy(&tail.0),"output_bytes":tail.1,"output_truncated":tail.1>LIMIT as u64,"elapsed_seconds":start.elapsed().as_secs(),"finished":now()}),
    )
}
