//! Stage and validate a signed-release DMG before replacing this user's app bundle.
#[cfg(any(target_os = "macos", all(test, unix)))]
use std::{
    path::{Path, PathBuf},
    process::Command,
};
#[cfg(any(target_os = "macos", all(test, unix)))]
fn run(command: &mut Command) -> Result<String, String> {
    let result = command.output().map_err(|e| e.to_string())?;
    if !result.status.success() {
        return Err(format!(
            "Mac client update failed: {}",
            String::from_utf8_lossy(&result.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&result.stdout).trim().to_owned())
}
#[cfg(any(target_os = "macos", all(test, unix)))]
fn field(app: &Path, key: &str) -> Result<String, String> {
    run(Command::new("/usr/libexec/PlistBuddy")
        .arg("-c")
        .arg(format!("Print {key}"))
        .arg(app.join("Contents/Info.plist")))
}
#[cfg(any(target_os = "macos", all(test, unix)))]
fn validate(app: &Path, version: &str) -> Result<(), String> {
    if app.is_symlink()
        || field(app, "CFBundleIdentifier")? != "dev.kindred.personal"
        || field(app, "CFBundleShortVersionString")? != version
        || field(app, "CFBundleExecutable")? != "kindred-desktop"
    {
        return Err("The downloaded Mac app does not match the signed release".into());
    }
    run(Command::new("/usr/bin/codesign")
        .args(["--verify", "--deep", "--strict"])
        .arg(app))?;
    let arch = if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "x86_64"
    };
    run(Command::new("/usr/bin/lipo")
        .arg(app.join("Contents/MacOS/kindred-desktop"))
        .args(["-verify_arch", arch]))?;
    Ok(())
}
#[cfg(any(target_os = "macos", all(test, unix)))]
pub fn install(
    dmg: &Path,
    version: &str,
    cancelled: &std::sync::atomic::AtomicBool,
) -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let target = exe
        .ancestors()
        .find(|p| p.extension().is_some_and(|e| e == "app"))
        .ok_or("Install Kindred in Applications before updating it.")?;
    install_at(
        dmg,
        version,
        cancelled,
        target,
        &crate::local_files::install_root()?,
    )
}
#[cfg(any(target_os = "macos", all(test, unix)))]
fn install_at(
    dmg: &Path,
    version: &str,
    cancelled: &std::sync::atomic::AtomicBool,
    target: &Path,
    root: &Path,
) -> Result<PathBuf, String> {
    use fs2::FileExt;
    use std::os::unix::fs::OpenOptionsExt;
    let lock = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .mode(0o600)
        .open(root.join("mac-client-update.lock"))
        .map_err(|e| e.to_string())?;
    lock.try_lock_exclusive()
        .map_err(|_| "Another Kindred client update is already running")?;
    if target.to_string_lossy().contains("/AppTranslocation/")
        || target.starts_with("/Volumes")
        || target.is_symlink()
    {
        return Err(
            "Drag Kindred into Applications, open that copy, then retry the update.".into(),
        );
    }
    if field(&target, "CFBundleIdentifier")? != "dev.kindred.personal" {
        return Err("The installed application is not a Kindred bundle".into());
    }
    let parent = target.parent().ok_or("Missing application directory")?;
    let id = uuid::Uuid::new_v4();
    let staged = parent.join(format!(".Kindred-update-{id}.app"));
    let backup = parent.join(format!(".Kindred-previous-{id}.app"));
    // Probe write access before mounting/copying; never request elevation silently.
    std::fs::create_dir(&staged).map_err(|_|"This Applications folder is not writable. Install Kindred in your user's Applications folder, or update it with your administrator.")?;
    let mount = dmg.parent().unwrap().join(format!("mount-{id}"));
    let mut mounted = false;
    let result = (|| {
        std::fs::create_dir(&mount).map_err(|e| e.to_string())?;
        run(Command::new("/usr/bin/hdiutil")
            .args([
                "attach",
                "-readonly",
                "-nobrowse",
                "-noautoopen",
                "-mountpoint",
            ])
            .arg(&mount)
            .arg(dmg))?;
        mounted = true;
        let source = mount.join("Kindred.app");
        validate(&source, version)?;
        run(Command::new("/usr/bin/ditto").arg(&source).arg(&staged))?;
        validate(&staged, version)?;
        if cancelled.load(std::sync::atomic::Ordering::Relaxed) {
            return Err("Update cancelled. Your installed app was kept.".into());
        }
        replace_bundle(&staged, &target, &backup)?;
        let receipt = serde_json::json!({"version":version,"current":target,"previous":backup});
        // Recovery metadata stays beside local client data, never in a profile/server.
        let _ = crate::local_files::atomic(&root.join("mac-client-update.json"), &receipt);
        Ok(target.to_path_buf())
    })();
    if mounted {
        let _ = run(Command::new("/usr/bin/hdiutil").arg("detach").arg(&mount));
    }
    let _ = std::fs::remove_dir(&mount);
    if staged.is_dir() {
        let _ = std::fs::remove_dir_all(&staged);
    }
    result
}
// Same-filesystem renames keep the old bundle recoverable until the new one is ready.
#[cfg(any(target_os = "macos", all(test, unix)))]
fn replace_bundle(staged: &Path, target: &Path, backup: &Path) -> Result<(), String> {
    std::fs::rename(target, backup)
        .map_err(|e| format!("Could not retain the previous app: {e}"))?;
    if let Err(error) = std::fs::rename(staged, target) {
        std::fs::rename(backup, target).map_err(|restore| {
            format!(
                "Could not install ({error}) or restore ({restore}). Your previous app is at {}.",
                backup.display()
            )
        })?;
        return Err(format!(
            "Could not replace Kindred; the previous app was restored: {error}"
        ));
    }
    Ok(())
}
#[cfg(any(target_os = "macos", all(test, unix)))]
pub fn launch(app: &tauri::AppHandle, target: &Path) -> Result<(), String> {
    let mut command = Command::new(target.join("Contents/MacOS/kindred-desktop"));
    command
        .env_remove("KINDRED_ACCESS_TOKEN")
        .env_remove(crate::session_handoff::ENV)
        .env("KINDRED_CLIENT_ONLY", "1");
    if let Some(handoff) = crate::profiles::update_handoff(app)? {
        command.env(
            crate::session_handoff::ENV,
            serde_json::to_string(&handoff).map_err(|e| e.to_string())?,
        );
    }
    let mut child = command
        .stdin(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    std::thread::sleep(std::time::Duration::from_millis(1200));
    if child.try_wait().map_err(|e| e.to_string())?.is_some() {
        return Err("The new client closed during startup. Your current window and previous app backup are still available.".into());
    }
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "requires an exact candidate DMG and isolated installed app on a native Mac"]
    fn native_candidate_installation() {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        use std::sync::atomic::AtomicBool;
        let app = PathBuf::from(std::env::var_os("KINDRED_TEST_MAC_APP").expect("candidate app"));
        let dmg = PathBuf::from(std::env::var_os("KINDRED_TEST_MAC_DMG").expect("candidate DMG"));
        let root =
            PathBuf::from(std::env::var_os("KINDRED_TEST_MAC_DATA").expect("isolated client data"));
        let version = env!("CARGO_PKG_VERSION");
        let binary = app.join("Contents/MacOS/kindred-desktop");
        let bytes = std::fs::read(&binary).unwrap();
        let inode = std::fs::metadata(&app).unwrap().ino();
        let keep = root.join("standalone-preservation-marker");
        std::fs::write(&keep, b"keep existing server and accounts").unwrap();
        for path in [
            Path::new("/Volumes/Kindred/Kindred.app"),
            Path::new("/private/AppTranslocation/fixture/Kindred.app"),
        ] {
            assert!(
                install_at(&dmg, version, &AtomicBool::new(false), path, &root)
                    .unwrap_err()
                    .contains("Applications")
            );
        }
        assert!(install_at(&dmg, "999.0.0", &AtomicBool::new(false), &app, &root).is_err());
        assert!(
            install_at(&dmg, version, &AtomicBool::new(true), &app, &root)
                .unwrap_err()
                .contains("cancelled")
        );
        assert_eq!(std::fs::metadata(&app).unwrap().ino(), inode);
        let parent = app.parent().unwrap();
        let permissions = std::fs::metadata(parent).unwrap().permissions();
        std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o555)).unwrap();
        let refused = install_at(&dmg, version, &AtomicBool::new(false), &app, &root);
        std::fs::set_permissions(parent, permissions).unwrap();
        assert!(refused.unwrap_err().contains("not writable"));
        assert_eq!(
            install_at(&dmg, version, &AtomicBool::new(false), &app, &root).unwrap(),
            app
        );
        assert_ne!(std::fs::metadata(&app).unwrap().ino(), inode);
        validate(&app, version).unwrap();
        let receipt: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.join("mac-client-update.json")).unwrap())
                .unwrap();
        let previous = Path::new(receipt["previous"].as_str().unwrap());
        assert_eq!(
            std::fs::read(previous.join("Contents/MacOS/kindred-desktop")).unwrap(),
            bytes
        );
        assert_eq!(std::fs::read(&binary).unwrap(), bytes);
        assert_eq!(
            std::fs::read(&keep).unwrap(),
            b"keep existing server and accounts"
        );
    }
    #[test]
    fn replacement_retains_previous_bundle_and_recovers_failed_swap() {
        let root = std::env::temp_dir().join(format!("kindred-mac-swap-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let target = root.join("Kindred.app");
        let staged = root.join("staged.app");
        let backup = root.join("previous.app");
        std::fs::create_dir(&target).unwrap();
        std::fs::write(target.join("version"), "old").unwrap();
        assert!(replace_bundle(&staged, &target, &backup).is_err());
        assert_eq!(
            std::fs::read_to_string(target.join("version")).unwrap(),
            "old"
        );
        assert!(!backup.exists());
        std::fs::create_dir(&staged).unwrap();
        std::fs::write(staged.join("version"), "new").unwrap();
        replace_bundle(&staged, &target, &backup).unwrap();
        assert_eq!(
            std::fs::read_to_string(target.join("version")).unwrap(),
            "new"
        );
        assert_eq!(
            std::fs::read_to_string(backup.join("version")).unwrap(),
            "old"
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
