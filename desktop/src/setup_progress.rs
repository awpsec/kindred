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
    progress: impl FnMut(String),
) -> Result<(), String> {
    run_detailed(command, log_path, limit, progress)
        .map(|_| ())
        .map_err(|failure| failure.message)
}

#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RunFailureKind {
    Log,
    Spawn,
    Nonzero,
    Wait,
    Timeout,
}

#[derive(Clone, Debug, Default, serde::Serialize)]
pub struct Cleanup {
    pub kill_attempted: bool,
    pub kill_succeeded: bool,
    pub reaped: bool,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct RunFailure {
    pub kind: RunFailureKind,
    pub elapsed_ms: u64,
    pub exit_code: Option<i32>,
    pub io_error_kind: Option<String>,
    pub cleanup: Cleanup,
    // Preserve the existing setup UI messages, without including them or raw
    // subprocess output in a machine-readable diagnostic receipt.
    #[serde(skip)]
    message: String,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct RunReceipt {
    pub elapsed_ms: u64,
}

fn elapsed_ms(start: Instant) -> u64 {
    u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX)
}

pub fn run_detailed(
    command: &mut Command,
    log_path: &Path,
    limit: Duration,
    mut progress: impl FnMut(String),
) -> Result<RunReceipt, RunFailure> {
    let began = Instant::now();
    let failure = |kind, error: Option<&std::io::Error>, message: String| RunFailure {
        kind,
        elapsed_ms: elapsed_ms(began),
        exit_code: None,
        io_error_kind: error.map(|e| format!("{:?}", e.kind())),
        cleanup: Cleanup::default(),
        message,
    };
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|e| failure(RunFailureKind::Log, Some(&e), e.to_string()))?;
    let start = log
        .metadata()
        .map_err(|e| failure(RunFailureKind::Log, Some(&e), e.to_string()))?
        .len();
    command
        .stdin(Stdio::null())
        .stdout(
            log.try_clone()
                .map_err(|e| failure(RunFailureKind::Log, Some(&e), e.to_string()))?,
        )
        .stderr(log);
    let mut child = command.spawn().map_err(|e| {
        failure(RunFailureKind::Spawn, Some(&e),
            "Docker could not start. Open Docker Desktop, or start Docker Engine, then retry setup.".to_owned())
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
                    Ok(RunReceipt {
                        elapsed_ms: elapsed_ms(began),
                    })
                } else {
                    let mut value = failure(RunFailureKind::Nonzero, None,
                        "Docker could not finish this step. Check the setup details below, then retry. Your existing data is preserved.".into());
                    value.exit_code = status.code();
                    value.cleanup.reaped = true;
                    Err(value)
                };
            }
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(400)),
            other => {
                let mut value = match other {
                    Err(e) => failure(RunFailureKind::Wait, Some(&e), format!("Could not check Docker: {e}")),
                    _ => failure(RunFailureKind::Timeout, None,
                        "This setup step timed out. Check the setup details, then retry to continue. Your existing data is preserved.".into()),
                };
                value.cleanup.kill_attempted = true;
                value.cleanup.kill_succeeded = child.kill().is_ok();
                value.cleanup.reaped = child.wait().is_ok();
                value.elapsed_ms = elapsed_ms(began);
                return Err(value);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn owned_root() -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!(
            "kindred-runner-diagnostics-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir(&root).unwrap();
        root
    }

    #[test]
    fn detailed_runner_log_and_spawn_failures_are_distinct_without_dispatch() {
        let root = owned_root();
        let mut missing = Command::new(root.join("nonexistent-program"));
        let failure = run_detailed(
            &mut missing,
            &root.join("missing-parent/log"),
            Duration::from_secs(1),
            |_| {},
        )
        .unwrap_err();
        assert_eq!(failure.kind, RunFailureKind::Log);
        assert!(!failure.cleanup.kill_attempted);
        let failure = run_detailed(
            &mut missing,
            &root.join("log"),
            Duration::from_secs(1),
            |_| {},
        )
        .unwrap_err();
        assert_eq!(failure.kind, RunFailureKind::Spawn);
        assert_eq!(failure.io_error_kind.as_deref(), Some("NotFound"));
        assert!(!failure.cleanup.kill_attempted);
        assert!(failure.elapsed_ms < 1000);
        assert_eq!(
            run(
                &mut missing,
                &root.join("log"),
                Duration::from_secs(1),
                |_| {}
            )
            .unwrap_err(),
            "Docker could not start. Open Docker Desktop, or start Docker Engine, then retry setup."
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn detailed_runner_nonzero_and_success_keep_exit_and_elapsed() {
        let root = owned_root();
        let log = root.join("log");
        let failure = run_detailed(
            Command::new("sh").args(["-c", "printf PRIVATE_STDERR >&2; exit 17"]),
            &log,
            Duration::from_secs(2),
            |_| {},
        )
        .unwrap_err();
        assert_eq!(failure.kind, RunFailureKind::Nonzero);
        assert_eq!(failure.exit_code, Some(17));
        assert!(failure.cleanup.reaped);
        assert!(!failure.cleanup.kill_attempted);
        assert!(
            !serde_json::to_string(&failure)
                .unwrap()
                .contains("PRIVATE_STDERR")
        );
        let result = run_detailed(
            Command::new("sh").args(["-c", "printf success"]),
            &log,
            Duration::from_secs(2),
            |_| {},
        )
        .unwrap();
        assert!(result.elapsed_ms < 2000);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn detailed_runner_timeout_is_bounded_and_reaps_the_child() {
        let root = owned_root();
        let failure = run_detailed(
            Command::new("sh").args(["-c", "exec sleep 30"]),
            &root.join("log"),
            Duration::from_millis(50),
            |_| {},
        )
        .unwrap_err();
        assert_eq!(failure.kind, RunFailureKind::Timeout);
        assert!((50..2000).contains(&failure.elapsed_ms));
        assert!(
            failure.cleanup.kill_attempted
                && failure.cleanup.kill_succeeded
                && failure.cleanup.reaped
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn detailed_runner_actual_wait_failure_retains_the_wait_cause() {
        let root = owned_root();
        let mut reaped_pid = None;
        // Reap this owned child externally after the runner first observes it
        // alive. Its next real try_wait must report ECHILD, not a timeout.
        let failure = run_detailed(
            Command::new("sh").args(["-c", "printf '%s\\n' \"$$\"; exec sleep 1"]),
            &root.join("log"),
            Duration::from_secs(4),
            |text| {
                if reaped_pid.is_none() {
                    let pid = text.trim().parse::<i32>().unwrap();
                    let mut status = 0;
                    assert_eq!(unsafe { libc::waitpid(pid, &mut status, 0) }, pid);
                    reaped_pid = Some(pid);
                }
            },
        )
        .unwrap_err();
        assert!(reaped_pid.is_some());
        assert_eq!(failure.kind, RunFailureKind::Wait);
        assert!(failure.io_error_kind.is_some());
        assert!(failure.cleanup.kill_attempted);
        assert!(!failure.cleanup.reaped);
        assert!(failure.elapsed_ms < 4000);
        assert_eq!(unsafe { libc::kill(reaped_pid.unwrap(), 0) }, -1);
        std::fs::remove_dir_all(root).unwrap();
    }
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
