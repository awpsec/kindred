use super::*;

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("kindred-shell-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&path).unwrap();
        Self(path.canonicalize().unwrap())
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let temp = std::env::temp_dir().canonicalize().unwrap();
        assert!(self.0.starts_with(&temp) && self.0 != temp);
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn run(path: &Path, script: &str, seconds: u64, cancel: Arc<AtomicBool>) -> Value {
    execute(
        "local_exec",
        path,
        &json!({"command":script,"timeout_seconds":seconds}),
        cancel,
    )
    .unwrap()
}
fn flag() -> Arc<AtomicBool> {
    Arc::new(AtomicBool::new(false))
}

#[test]
fn cancelled_command_never_starts() {
    let fixture = Fixture::new();
    let cancelled = Arc::new(AtomicBool::new(true));
    #[cfg(windows)]
    let script = "[IO.File]::WriteAllText('unexpected.txt','started')";
    #[cfg(not(windows))]
    let script = "printf started > unexpected.txt";
    assert!(
        execute(
            "local_exec",
            &fixture.0,
            &json!({"command":script}),
            cancelled
        )
        .is_err()
    );
    assert!(!fixture.0.join("unexpected.txt").exists());
}

#[test]
fn output_limits_are_explicit_and_keep_exit_status() {
    let fixture = Fixture::new();
    #[cfg(windows)]
    let script =
        "[Console]::Out.Write(('A' * 300000)); [Console]::Error.Write(('B' * 300000)); exit 7";
    #[cfg(not(windows))]
    let script =
        "head -c 300000 /dev/zero | tr '\\0' A; head -c 300000 /dev/zero | tr '\\0' B >&2; exit 7";
    let result = run(&fixture.0, script, 15, flag());
    assert_eq!(result["exit_code"], 7);
    assert_eq!(result["failed"], true);
    assert_eq!(
        result["output_truncated"], true,
        "Clipped command output must not appear complete"
    );
    assert_eq!(result["stdout_truncated"], true);
    assert_eq!(result["stderr_truncated"], true);
    assert!(result["text"].as_str().unwrap().len() < 525000);
    assert!(
        result["text"]
            .as_str()
            .unwrap()
            .contains("Output truncated")
    );
}

#[cfg(windows)]
fn alive(pid: u32) -> bool {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            &format!(
                "if(Get-Process -Id {pid} -ErrorAction SilentlyContinue){{exit 0}}else{{exit 1}}"
            ),
        ])
        .creation_flags(0x08000000)
        .status()
        .unwrap()
        .success()
}
#[cfg(windows)]
fn pid(path: &Path, name: &str) -> u32 {
    std::fs::read_to_string(path.join(name))
        .unwrap()
        .trim()
        .parse()
        .unwrap()
}
#[cfg(windows)]
fn child_script(wait: bool) -> String {
    format!(
        "$child=Start-Process powershell.exe -WindowStyle Hidden -WorkingDirectory (Get-Location).Path -ArgumentList '-NoProfile','-NonInteractive','-Command','Start-Sleep -Seconds 25' -PassThru\n[IO.File]::WriteAllText('child.pid',[string]$child.Id)\n[IO.File]::WriteAllText('parent.pid',[string]$PID)\nWrite-Output 'owned shell ready'\n{}",
        if wait {
            "Start-Sleep -Seconds 25"
        } else {
            "exit 0"
        }
    )
}

#[cfg(windows)]
#[test]
fn concurrent_shells_cancel_only_the_owned_process_tree() {
    let fixture = Fixture::new();
    let cancel_a = flag();
    let cancel_b = flag();
    let path_a = fixture.0.clone();
    let path_b = fixture.0.clone();
    let a = cancel_a.clone();
    let b = cancel_b.clone();
    let first = std::thread::spawn(move || run(&path_a, &child_script(true), 15, a));
    let second = std::thread::spawn(move || {
        run(
            &path_b,
            "[IO.File]::WriteAllText('independent.pid',[string]$PID); Write-Output 'independent shell ready'; Start-Sleep -Seconds 5; Write-Output 'independent shell finished'",
            15,
            b,
        )
    });
    let deadline = Instant::now() + Duration::from_secs(8);
    while !(fixture.0.join("parent.pid").exists() && fixture.0.join("independent.pid").exists())
        && Instant::now() < deadline
    {
        std::thread::sleep(Duration::from_millis(30));
    }
    let ready = fixture.0.join("parent.pid").exists() && fixture.0.join("independent.pid").exists();
    cancel_a.store(true, Ordering::SeqCst);
    let first = first.join().unwrap();
    let second_alive = ready && alive(pid(&fixture.0, "independent.pid"));
    let second = second.join().unwrap();
    assert!(ready);
    assert_eq!(first["stopped"], true);
    assert_eq!(first["timed_out"], false);
    assert!(
        second_alive,
        "Cancelling one shell must leave the other running"
    );
    assert!(!alive(pid(&fixture.0, "parent.pid")));
    assert!(!alive(pid(&fixture.0, "child.pid")));
    assert_eq!(second["failed"], false);
    assert_eq!(second["exit_code"], 0);
    assert_eq!(second["output_truncated"], false);
    assert_eq!(second["stdout_truncated"], false);
    assert_eq!(second["stderr_truncated"], false);
    assert!(
        second["text"]
            .as_str()
            .unwrap()
            .contains("independent shell finished")
    );
    assert!(!second["text"].as_str().unwrap().contains("owned shell"));
}

#[cfg(windows)]
#[test]
fn timeout_keeps_partial_output_and_stops_descendants() {
    let fixture = Fixture::new();
    let started = Instant::now();
    let result = run(&fixture.0, &child_script(true), 3, flag());
    assert_eq!(result["timed_out"], true);
    assert_eq!(result["stopped"], true);
    assert!(
        result["text"]
            .as_str()
            .unwrap()
            .contains("owned shell ready")
    );
    assert!(started.elapsed() < Duration::from_secs(9));
    assert!(!alive(pid(&fixture.0, "parent.pid")));
    assert!(!alive(pid(&fixture.0, "child.pid")));
}

#[cfg(windows)]
#[test]
fn successful_parent_exit_does_not_leave_background_children() {
    let fixture = Fixture::new();
    let result = run(&fixture.0, &child_script(false), 15, flag());
    assert_eq!(result["failed"], false);
    assert_eq!(result["exit_code"], 0);
    assert!(!alive(pid(&fixture.0, "child.pid")));
}
