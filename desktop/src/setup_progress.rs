//! Observable setup stages. The bar counts completed stages, not estimated bytes.
use serde_json::{Value, json};
use std::{
    fs::OpenOptions,
    io::{Read, Seek, SeekFrom},
    path::Path,
    process::{Command, Stdio},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

pub const STAGES: [&str; 5] = [
    "Checking Docker",
    "Preparing setup files",
    "Downloading and building server software",
    "Starting the local server",
    "Checking that the server is ready",
];

pub fn begin() -> Value {
    let mut value = json!({"status":"working","started_at":SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs(),"stage_count":STAGES.len()});
    stage(&mut value, 0);
    value
}
pub fn stage(value: &mut Value, index: usize) {
    value["stage_index"] = json!(index + 1);
    value["completed_stages"] = json!(index);
    value["stage"] = json!(STAGES[index]);
    value["message"] = value["stage"].clone();
}
pub fn finish(value: &mut Value, result: Result<(), String>) {
    match result {
        Ok(()) => {
            value["status"] = json!("ready");
            value["completed_stages"] = json!(STAGES.len());
            value["message"] = json!("Your local server is ready.");
            value["url"] = json!(crate::local_server::ORIGIN);
        }
        Err(error) => {
            value["status"] = json!("error");
            value["message"] = json!(error);
        }
    }
}

fn log_tail(path: &Path, start: u64) -> std::io::Result<String> {
    let mut file = std::fs::File::open(path)?;
    let end = file.metadata()?.len();
    file.seek(SeekFrom::Start(start.max(end.saturating_sub(4096))))?;
    let mut bytes = Vec::new();
    file.take(4096).read_to_end(&mut bytes)?;
    let text = String::from_utf8_lossy(&bytes).replace('\r', "\n");
    // Compose's plain output normally has no escapes. Strip any terminal control
    // sequences before putting the bounded tail into an accessible text node.
    let mut clean = String::new();
    let mut escape = false;
    for c in text.chars() {
        if c == '\u{1b}' {
            escape = true;
            continue;
        }
        if escape {
            if c.is_ascii_alphabetic() {
                escape = false;
            }
            continue;
        }
        if !c.is_control() || c == '\n' || c == '\t' {
            clean.push(c);
        }
    }
    let lines: Vec<_> = clean
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();
    Ok(lines[lines.len().saturating_sub(6)..].join("\n"))
}

pub fn run(
    command: &mut Command,
    log_path: &Path,
    limit: Duration,
    mut progress: impl FnMut(String),
) -> Result<(), String> {
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|e| e.to_string())?;
    let start = log.metadata().map_err(|e| e.to_string())?.len();
    command
        .stdin(Stdio::null())
        .stdout(log.try_clone().map_err(|e| e.to_string())?)
        .stderr(log);
    let mut child = command.spawn().map_err(|_| {
        "Docker could not start. Open Docker Desktop, or start Docker Engine, then retry setup."
            .to_owned()
    })?;
    let deadline = Instant::now() + limit;
    let mut previous = String::new();
    loop {
        let exit = child.try_wait();
        if let Ok(tail) = log_tail(log_path, start) {
            if !tail.is_empty() && tail != previous {
                progress(tail.clone());
                previous = tail;
            }
        }
        match exit {
            Ok(Some(status)) => {
                return if status.success() {
                    Ok(())
                } else {
                    Err("Docker could not finish this step. Check the setup details below, then retry. Your existing data is preserved.".into())
                };
            }
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(400)),
            other => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(match other {
                    Err(e) => format!("Could not check Docker: {e}"),
                    _ => "This setup step timed out. Check the setup details, then retry to continue. Your existing data is preserved.".into(),
                });
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn failures_retain_the_failed_stage_and_never_claim_completion() {
        let mut v = begin();
        stage(&mut v, 2);
        v["detail"] = json!("Download failed");
        finish(&mut v, Err("Offline".into()));
        assert_eq!(v["stage"], STAGES[2]);
        assert_eq!(v["completed_stages"], 2);
        assert_eq!(v["detail"], "Download failed");
        assert_eq!(v["status"], "error");
        finish(&mut v, Ok(()));
        assert_eq!(v["completed_stages"], 5);
        assert_eq!(v["status"], "ready");
    }
    #[cfg(unix)]
    #[test]
    fn reports_output_while_running_and_bounds_the_timeout() {
        let root =
            std::env::temp_dir().join(format!("kindred-setup-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let log = root.join("setup.log");
        std::fs::write(&log, "Previous attempt must not appear\n").unwrap();
        let mut seen = Vec::new();
        run(
            Command::new("sh").args([
                "-c",
                "printf 'Downloading layer\\n'; sleep 1; printf 'Ready\\n'",
            ]),
            &log,
            Duration::from_secs(4),
            |s| seen.push(s),
        )
        .unwrap();
        assert!(seen.iter().any(|s| s == "Downloading layer"));
        assert!(seen.last().unwrap().ends_with("Ready"));
        assert!(seen.iter().all(|s| !s.contains("Previous attempt")));
        let start = Instant::now();
        assert!(
            run(
                Command::new("sh").args(["-c", "exec sleep 5"]),
                &log,
                Duration::from_millis(100),
                |_| {}
            )
            .is_err()
        );
        assert!(start.elapsed() < Duration::from_secs(2));
        std::fs::remove_dir_all(root).unwrap();
    }
}
