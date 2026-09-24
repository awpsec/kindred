//! Linux setup recovery is displayed for a person to run; never auto-elevated.
use std::{
    path::Path,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

pub const SCRIPT: &str = include_str!("../linux/setup.sh");

pub fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

pub fn recovery_command(appimage: Option<&str>, binary: Option<&str>) -> String {
    let argument = appimage
        .filter(|p| !p.is_empty())
        .map(shell_quote)
        .or_else(|| binary.map(|p| format!("--native {}", shell_quote(p))))
        .unwrap_or_default();
    let script = SCRIPT.replace("\r\n", "\n");
    format!("bash -s -- {argument} <<'KINDRED_LINUX_SETUP'\n{script}\nKINDRED_LINUX_SETUP\n")
}

pub fn current_appimage() -> Option<String> {
    std::env::var("APPIMAGE")
        .ok()
        .filter(|p| Path::new(p).is_absolute() && Path::new(p).is_file())
}

fn succeeds(program: &str, args: &[&str]) -> bool {
    let Ok(mut child) = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    else {
        return false;
    };
    let end = Instant::now() + Duration::from_secs(6);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) if Instant::now() < end => std::thread::sleep(Duration::from_millis(40)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return false;
            }
        }
    }
}

pub fn prerequisite_error() -> Option<&'static str> {
    if !succeeds("docker", &["--version"]) {
        Some(
            "Docker Engine is missing or cannot start. Copy the Linux setup block below to install the prerequisites.",
        )
    } else if !succeeds("docker", &["compose", "version"]) {
        Some(
            "Docker Compose v2 is missing or unavailable. Copy the Linux setup block below to install it.",
        )
    } else if !succeeds("docker", &["info", "--format", "{{.ServerVersion}}"]) {
        Some(
            "Docker is installed, but this desktop session cannot reach it. Start Docker; if you just joined the docker group, sign out of the desktop and sign back in. The recovery block below checks the dependencies.",
        )
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn copied_block_quotes_paths_and_keeps_the_script_literal() {
        let path = "/home/user/Downloads/Kindred's $file;$(touch bad).AppImage";
        let block = recovery_command(Some(path), None);
        assert!(block.starts_with("bash -s -- '/home/user/Downloads/Kindred'\"'\"'s $file;$(touch bad).AppImage' <<'KINDRED_LINUX_SETUP'\n"));
        assert!(block.contains(&SCRIPT.replace("\r\n", "\n")));
        assert!(block.ends_with("\nKINDRED_LINUX_SETUP\n"));
        assert!(recovery_command(None, None).starts_with("bash -s --  <<'KINDRED_LINUX_SETUP'"));
        assert!(
            recovery_command(None, Some("/opt/Kindred/usr/bin/kindred-desktop"))
                .starts_with("bash -s -- --native '/opt/Kindred/usr/bin/kindred-desktop'")
        );
        assert!(!block.contains('\r'));
    }
}
