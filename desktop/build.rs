fn main() {
    println!("cargo:rerun-if-changed=dictation");
    println!("cargo:rerun-if-env-changed=KINDRED_DICTATION_BUILD_JOBS");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux") {
        let out = std::env::var("OUT_DIR").expect("Build output directory");
        let target = std::env::var("TARGET").expect("Build target");
        assert!(
            std::process::Command::new("python3")
                .args(["dictation/build-linux.py", &out, &target])
                .status()
                .expect(
                    "Linux dictation requires Python 3, Git, CMake and a C++ compiler at build time"
                )
                .success(),
            "The bundled Linux CPU dictation runtime could not build"
        );
    }
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let out = std::env::var("OUT_DIR").expect("Build output directory");
        let target = std::env::var("TARGET").expect("Build target");
        assert!(std::process::Command::new("python3")
            .args(["dictation/build-macos.py", &out, &target])
            .status().expect("macOS dictation requires Python 3, CMake and Xcode command line tools at build time").success(),
            "The bundled Metal dictation runtime could not build");
    }
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "decide_microphone_permission",
            "microphone_permission",
            "start_native_dictation",
            "configure_dictation",
            "dictation_status",
            "download_dictation_model",
            "cancel_dictation_download",
            "transcribe_dictation",
            "cancel_dictation",
            "connection_ready",
            "open_external_url",
            "read_dropped_files",
            "read_clipboard_image",
            "save_chat_file",
            "reveal_chat_file",
            "open_profile_home",
            "position_profile_home",
            "close_profile_home",
            "open_profile_transfer",
            "transfer_profile",
            "profile_transfer_status",
            "cancel_profile_transfer",
            "remember_profile",
            "profile_home_state",
            "connect_profile_server",
            "switch_native_profile",
            "forget_profile",
            "profile_activity",
            "start_standalone",
            "prepare_local_server",
            "restart_local_server",
            "standalone_status",
            "set_launch_on_startup",
            "set_hardware_acceleration",
            "prepare_profile_switch",
            "window_action",
            "start_desktop",
            "notification_status",
            "test_notification",
            "set_notch_notifications",
            "notch_action",
            "open_linux_update",
            "linux_update_state",
            "choose_linux_appimage",
            "install_linux_appimage",
            "restart_linux_client",
            "begin_update",
            "restart_update",
            "update_status",
            "close_update",
            "open_local_access",
            "position_local_access",
            "local_access_status",
            "local_access_state",
            "set_local_access",
            "decide_local_access",
        ]),
    ))
    .expect("Desktop command permissions could not be generated");
}
