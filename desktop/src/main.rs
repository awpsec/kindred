#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod chat_files;
mod composer_input;
mod client_release;
mod connection;
mod desktop;
mod dictation;
mod dictation_runtime;
mod external_links;
#[cfg(target_os = "linux")]
mod linux_media;
#[cfg(target_os = "linux")]
mod linux_setup;
mod linux_update;
mod local_access;
mod local_files;
mod local_server;
mod mac_update;
mod managed_process;
#[cfg(target_os = "linux")]
mod microphone_grants;
mod notch;
mod notification_sound;
#[cfg(any(windows, test))]
mod notification_xml;
mod profiles;
mod server_update;
mod session_handoff;
mod setup_progress;
mod skill_files;
mod surface;
mod updater;
mod window_state;
mod workspace_files;
use tauri::Manager;

fn main() {
    if managed_process::worker_argument() {
        return;
    }
    if connection::redirect_installed_version() {
        return;
    }
    // Consume before starting threads or spawning any workers. A temporary
    // sign-in survives this update only, preserving the user's remember choice.
    let update_session = std::env::var(session_handoff::ENV)
        .ok()
        .and_then(|s| session_handoff::Handoff::parse(&s, session_handoff::now()))
        .filter(|s| profiles::validate_url(&s.server).is_ok());
    unsafe {
        std::env::remove_var(session_handoff::ENV);
    }
    let selected = profiles::initial().unwrap_or_else(|e| {
        eprintln!("{e}");
        None
    });
    let force_home = std::env::args().any(|s| s == "--profiles");
    let address = std::env::args()
        .nth(1)
        .filter(|s| !s.starts_with("--"))
        .or_else(|| {
            if force_home {
                None
            } else {
                update_session.as_ref().map(|s| s.server.clone())
            }
        })
        .or_else(|| {
            if force_home {
                None
            } else {
                std::env::var("KINDRED_SERVER_URL").ok()
            }
        })
        .or_else(|| {
            selected
                .as_ref()
                .and_then(|e| e["server"].as_str().map(str::to_owned))
        });
    let onboarding = address.is_none();
    let address = address.unwrap_or_else(|| "http://127.0.0.1:7340".into());
    let url = match address.parse::<tauri::Url>() {
        Ok(url)
            if url.username().is_empty()
                && url.password().is_none()
                && (url.scheme() == "https"
                    || (url.scheme() == "http"
                        && matches!(
                            url.host_str(),
                            Some("127.0.0.1" | "localhost" | "[::1]")
                        ))) =>
        {
            url
        }
        _ => {
            eprintln!("Use an HTTPS server URL, or HTTP on localhost through an SSH tunnel.");
            std::process::exit(2);
        }
    };
    // Remote content cannot supply commands or paths. The update navigation only opens our bundled updater.
    let explicit_profile = std::env::var("KINDRED_PROFILE_ID").ok();
    let fresh_account = explicit_profile.as_deref() == Some("unassigned");
    let update_session = update_session.filter(|s| s.server == url.origin().ascii_serialization());
    let selected = selected.filter(|e| {
        e["server"] == url.origin().ascii_serialization()
            && explicit_profile
                .as_ref()
                .is_none_or(|p| e["profile_id"] == *p)
    });
    let recover_local = !onboarding && profiles::needs_local_start(&url);
    let client_only = std::env::var("KINDRED_CLIENT_ONLY").as_deref() == Ok("1");
    let update_local =
        !onboarding && !recover_local && profiles::local_update_available(&url);
    let allowed_origin = url.origin();
    let token = update_session
        .as_ref()
        .map(|s| s.token.clone())
        .or_else(|| std::env::var("KINDRED_ACCESS_TOKEN").ok())
        .or_else(|| {
            selected.as_ref().and_then(|e| {
                e["token"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned)
            })
        });
    let remember_session = update_session
        .as_ref()
        .map(|s| s.remember)
        .unwrap_or_else(|| {
            selected
                .as_ref()
                .is_none_or(|e| e["token"].as_str().is_some_and(|t| !t.is_empty()))
        });
    let initial_profile = update_session
        .as_ref()
        .map(|s| s.profile_id.clone())
        .or_else(|| explicit_profile.clone().filter(|p| p != "unassigned"))
        .or_else(|| {
            selected
                .as_ref()
                .and_then(|e| e["profile_id"].as_str().map(str::to_owned))
        });
    if std::env::var("KINDRED_PROFILE_ID").is_err() {
        if let Some(profile) = &initial_profile {
            unsafe {
                std::env::set_var("KINDRED_PROFILE_ID", profile);
            }
        }
    }
    // Establish the immutable native workspace before any worker threads start.
    if std::env::var("KINDRED_PROFILE_SCOPE").is_err() {
        if let Some(handoff) = &update_session {
            unsafe {
                std::env::set_var(
                    "KINDRED_PROFILE_SCOPE",
                    profiles::key(&handoff.server, &handoff.profile_id),
                );
                if handoff.profile_id == "legacy" {
                    std::env::set_var("KINDRED_LEGACY_LOCAL_ACCESS", "1");
                }
            }
        } else if let Some(entry) = &selected {
            if let Some(scope) = entry["key"].as_str() {
                unsafe {
                    std::env::set_var("KINDRED_PROFILE_SCOPE", scope);
                }
            }
            if entry["legacy"] == true {
                unsafe {
                    std::env::set_var("KINDRED_LEGACY_LOCAL_ACCESS", "1");
                }
            }
        } else if std::env::var("KINDRED_ACCESS_TOKEN").is_ok() {
            // Compatibility with the former SSH launcher for this installation.
            unsafe {
                std::env::set_var("KINDRED_LEGACY_LOCAL_ACCESS", "1");
            }
        }
    }
    tauri::Builder::default()
        .manage(desktop::Desktop::new(url.clone()))
        .manage(chat_files::Downloads::default())
        .manage(profiles::Host::default())
        .manage(connection::Startup::default())
        .manage(composer_input::Input::default())
        .on_webview_event(|view,event|{if let tauri::WebviewEvent::DragDrop(drop)=event {composer_input::dropped(view,drop);}})
        .manage(updater::Worker::default())
        .manage(server_update::Worker::default())
        .manage(linux_update::Worker::default())
        .manage(dictation::Worker::default())
        .manage(window_state::Store::default())
        .on_window_event(|window,event| {if window.label()=="main" && matches!(event,tauri::WindowEvent::Destroyed){dictation::close(window.app_handle());}})
        .manage(local_access::Bridge::default())
        .invoke_handler(tauri::generate_handler![
            chat_files::save_chat_file,chat_files::reveal_chat_file,
            composer_input::read_dropped_files,composer_input::read_clipboard_image,
            external_links::open_external_url,
            dictation::start_native_dictation,dictation::microphone_permission,dictation::decide_microphone_permission,dictation::configure_dictation,dictation::dictation_status,dictation::download_dictation_model,dictation::cancel_dictation_download,dictation::transcribe_dictation,dictation::cancel_dictation,
            connection::connection_ready,
            profiles::open_profile_home,
            profiles::position_profile_home,
            profiles::close_profile_home,
            profiles::open_profile_transfer,
            profiles::transfer_profile,
            profiles::cancel_profile_transfer,
            profiles::remember_profile,
            profiles::profile_home_state,
            profiles::connect_profile_server,
            profiles::switch_native_profile,
            profiles::forget_profile,
            profiles::profile_activity,
            profiles::start_standalone,
            profiles::prepare_local_server,
            profiles::restart_local_server,
            profiles::standalone_status,
            profiles::set_launch_on_startup,
            profiles::set_hardware_acceleration,
            local_access::prepare_profile_switch,
            linux_update::open_linux_update, linux_update::linux_update_state, linux_update::choose_linux_appimage, linux_update::install_linux_appimage, linux_update::restart_linux_client,
            updater::begin_update,
            updater::update_status,
            updater::close_update,
            updater::restart_update,
            desktop::window_action,
            desktop::start_desktop,
            desktop::notification_status,
            desktop::test_notification,
            notch::set_notch_notifications,notch::notch_action,
            local_access::open_local_access,
            local_access::position_local_access,
            local_access::local_access_status,
            local_access::local_access_state,
            local_access::set_local_access,
            local_access::decide_local_access
        ])
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            {
                app.manage(notch::native::Notch::default());
                app.add_capability(tauri::ipc::CapabilityBuilder::new("notch-alert")
                    .window("notch-alert").permission("allow-notch-action")
                    .permission("core:event:allow-listen").permission("core:event:allow-unlisten"))?;
                notch::native::watch(app.handle().clone());
            }
            let mut controls = tauri::ipc::CapabilityBuilder::new("connected-desktop")
                .window("main")
                .local(false)
                .remote(format!("{}/*", url.origin().ascii_serialization()));
            for permission in [
                "core:event:allow-listen", "core:event:allow-unlisten",
                "allow-start-native-dictation", "allow-microphone-permission", "allow-decide-microphone-permission", "allow-download-dictation-model", "allow-cancel-dictation-download", "allow-configure-dictation", "allow-dictation-status", "allow-transcribe-dictation", "allow-cancel-dictation",
                "allow-connection-ready",
                "allow-open-external-url",
                "allow-save-chat-file", "allow-reveal-chat-file", "allow-read-dropped-files", "allow-read-clipboard-image",
                "allow-open-profile-home", "allow-open-profile-transfer",
                "allow-position-profile-home",
                "allow-remember-profile",
                "allow-profile-home-state", "allow-switch-native-profile", "allow-profile-activity", "allow-connect-profile-server",
                "allow-prepare-profile-switch", "allow-set-launch-on-startup", "allow-set-hardware-acceleration",
                "allow-window-action",
                "allow-start-desktop",
                "allow-notification-status",
                "allow-test-notification",
                "allow-set-notch-notifications", "allow-open-linux-update",
                "allow-open-local-access",
                "allow-position-local-access",
                "allow-local-access-status",
            ] {
                controls = controls.permission(permission);
            }
            app.add_capability(controls)?;
            app.add_capability(tauri::ipc::CapabilityBuilder::new("local-server-administration")
                .window("main").local(false).remote("http://127.0.0.1:9444/".to_string())
                .permission("allow-prepare-local-server")
                .permission("allow-restart-local-server")
                .permission("allow-standalone-status"))?;
            app.add_capability(tauri::ipc::CapabilityBuilder::new("embedded-local-permissions")
                .webview("local-access-settings")
                .permission("allow-local-access-state")
                .permission("allow-set-local-access"))?;
            let mut home=tauri::ipc::CapabilityBuilder::new("profile-home").window("profile-home");
            for permission in ["allow-open-linux-update","allow-transfer-profile","allow-cancel-profile-transfer","allow-window-action","allow-profile-home-state","allow-connect-profile-server","allow-switch-native-profile","allow-forget-profile","allow-profile-activity","allow-start-standalone","allow-standalone-status","allow-set-launch-on-startup"] {home=home.permission(permission);}
            app.add_capability(home)?;
            let mut accounts=tauri::ipc::CapabilityBuilder::new("embedded-accounts").webview("profile-home-settings");
            for permission in ["allow-profile-home-state","allow-connect-profile-server","allow-switch-native-profile","allow-forget-profile","allow-profile-activity","allow-start-standalone","allow-standalone-status","allow-close-profile-home"] {accounts=accounts.permission(permission);}
            app.add_capability(accounts)?;
            if cfg!(target_os = "linux") {
                app.add_capability(tauri::ipc::CapabilityBuilder::new("linux-client-updater")
                    .window("linux-update")
                    .permission("allow-linux-update-state").permission("allow-choose-linux-appimage")
                    .permission("allow-install-linux-appimage").permission("allow-restart-linux-client"))?;
            }
            if onboarding||recover_local {
                profiles::show(app.handle()).map_err(std::io::Error::other)?;
                if recover_local && !client_only{profiles::start_setup(app.handle().clone()).map_err(std::io::Error::other)?;}
                return Ok(());
            }
            if update_local {
                *app.state::<profiles::Host>().intent.lock().unwrap()=serde_json::json!({"mode":"standalone-update"});
                profiles::show(app.handle()).map_err(std::io::Error::other)?;
            }
            app.add_capability(
                tauri::ipc::CapabilityBuilder::new("local-updater")
                    .window("updater")
                    .permission("allow-begin-update")
                    .permission("allow-update-status")
                    .permission("allow-close-update")
                    .permission("allow-restart-update"),
            )?;
            app.add_capability(
                tauri::ipc::CapabilityBuilder::new("local-permissions")
                    .window("local-access")
                    .permission("allow-window-action")
                    .permission("allow-local-access-state")
                    .permission("allow-set-local-access")
                    .permission("allow-decide-local-access"),
            )?;
            if let Err(error) = desktop::register_notifications() {
                app.state::<desktop::Desktop>()
                    .notification_error(error.to_string());
            }
            let update_handle = app.handle().clone();
            let nav_handle = update_handle.clone();
            let nav_server = url.origin().ascii_serialization();
            let nav_key = selected.as_ref().and_then(|e| e["key"].as_str().map(str::to_owned));
            let mut window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::External(url.clone()),
            )
            .initialization_script(&format!("if(window.top===window){{window.__KINDRED_INITIAL_PROFILE={};window.__KINDRED_REMEMBER_SESSION={};window.__KINDRED_NEW_ACCOUNT={};window.__KINDRED_EXPLICIT_PROFILE={};}}",serde_json::to_string(&initial_profile)?,remember_session,fresh_account,explicit_profile.is_some()&&!fresh_account))
            .title("Kindred")
            .visible(false)
            .initialization_script(format!("if(window.top===window){{{}}}",connection::READY_SCRIPT))
            .initialization_script("if(window.top===window){window.__KINDRED_FILE_DELIVERY=true;window.__KINDRED_ARTIFACT_FRAME=true;}")
            .initialization_script("if(window.top===window){window.__KINDRED_EXTERNAL_LINKS=true;}")
            .enable_clipboard_access()
            .initialization_script("if(window.top===window){window.__KINDRED_NATIVE_ATTACHMENTS=true;}")
            .inner_size(1320.0, 860.0)
            .min_inner_size(800.0, 580.0)
            .decorations(cfg!(any(target_os = "linux", target_os = "macos")))
            .resizable(true)
            .initialization_script(&format!(
                "if(window.top===window){{window.__KINDRED_EMBEDDED_ACCOUNTS=true;window.__KINDRED_SYSTEM_SETTINGS=true;window.__KINDRED_LOCAL_DICTATION=true;window.__KINDRED_DICTATION_MODELS=true;window.__KINDRED_NATIVE_DICTATION={};window.__KINDRED_PROFILE_HOST=true;window.__KINDRED_LOCAL_ACCESS=true;window.__KINDRED_DESKTOP={{platform:{:?}}};}}",
                cfg!(target_os = "macos"), std::env::consts::OS
            ))
            .initialization_script(include_str!("../../ui/local-server-admin.js"))
            .initialization_script(&format!(
                "if(window.top===window){{window.__KINDRED_SERVER_UPDATER={};window.__KINDRED_LINUX_UPDATER={};window.__KINDRED_NATIVE_UPDATER={};window.__KINDRED_DESKTOP_VERSION={:?};}}",
                client_release::platform()!="unsupported", cfg!(target_os = "linux"), cfg!(windows)&&local_files::install_root().is_ok_and(|p|p.join("current.json").is_file()),
                env!("CARGO_PKG_VERSION")
            ))
            .on_navigation(move |destination| {
                // WebKit reports sandboxed artifact subframe navigations here
                // too. They must not trigger the main-window connection watcher.
                if connection::artifact_frame_navigation(destination) { return true; }
                if destination.scheme() == "kindred-update"
                    && destination.host_str() == Some("check")
                {
                    updater::show(&nav_handle);
                    return false;
                }
                if destination.origin() != allowed_origin { return false; }
                // The isolated renderer is a subframe navigation, not a new
                // app connection. Its HTTP response enforces an opaque sandbox.
                if destination.path() == "/artifact-frame.html" && destination.query().is_none() { return true; }
                if nav_handle.state::<connection::Startup>().0.lock().is_ok_and(|stage| *stage == 2) { return false; }
                let fragment_only = {
                    let state=nav_handle.state::<connection::Startup>();
                    let Ok(mut last)=state.2.lock() else { return false; };
                    let same=last.as_ref().is_some_and(|current| {
                        let changed=current.fragment()!=destination.fragment();
                        let mut current=current.clone();current.set_fragment(None);
                        let mut next=destination.clone();next.set_fragment(None);
                        changed && current==next
                    });
                    *last=Some(destination.clone());same
                };
                if !fragment_only { connection::watch(nav_handle.clone(), nav_server.clone(), nav_key.clone()); }
                true
            })
            .on_new_window(move |destination, _| {
                if destination.scheme() == "kindred-update"
                    && destination.host_str() == Some("check")
                {
                    updater::show(&update_handle);
                    return tauri::webview::NewWindowResponse::Deny;
                }
                if matches!(destination.scheme(), "https" | "http")
                    && destination.username().is_empty()
                    && destination.password().is_none()
                {
                    let _ = open::that_detached(destination.as_str());
                }
                tauri::webview::NewWindowResponse::Deny
            });
            window = window.initialization_script(&format!(
                "if(window.top===window){{window.__KINDRED_NATIVE_SESSION_BOOTSTRAP=true;if(sessionStorage.getItem('kindred-native-launch')!=={0}){{const token={1};if(token)sessionStorage.setItem('kindred-token',token);else sessionStorage.removeItem('kindred-token');sessionStorage.setItem('kindred-native-launch',{0});}}}}",
                serde_json::to_string(&uuid::Uuid::new_v4().to_string())?,serde_json::to_string(&token)?
            ));
            #[cfg(windows)]
            if !profiles::hardware_acceleration() { window = window.additional_browser_args("--disable-gpu"); }
            #[cfg(target_os = "linux")]
            { window = window.initialization_script(include_str!("../../ui/microphone-permission.js")); }
            // Keep AppKit's rounded frame and native fullscreen behavior while
            // allowing the web header to extend behind the transparent titlebar.
            #[cfg(target_os = "macos")]
            {
                window = window
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true)
                    .traffic_light_position(tauri::LogicalPosition::new(16.0, 24.0))
                    .initialization_script("if(window.top===window){window.__KINDRED_MAC_OVERLAY=true;}");
            }
            let window = window.build()?;
            #[cfg(target_os = "linux")]
            {
                // Retain GTK client-side resize borders without its separate
                // title row. Kindred renders controls in the conversation header.
                use gtk::prelude::*;
                let titlebar = gtk::Box::new(gtk::Orientation::Horizontal, 0);
                titlebar.set_size_request(-1, 0);
                let css = gtk::CssProvider::new();
                css.load_from_data(b"* { min-height: 0; padding: 0; margin: 0; border: 0; }")?;
                titlebar.style_context().add_provider(&css, gtk::STYLE_PROVIDER_PRIORITY_APPLICATION);
                titlebar.show();
                window.gtk_window()?.set_titlebar(Some(&titlebar));
            }

            #[cfg(target_os = "macos")]
            {
                // AppKit owns drawing, hit targets and fullscreen behavior. Use
                // current macOS metrics rather than opting into compact controls.
                // The selector only exists on macOS 26; older systems keep their
                // native metrics. Setup runs on the main thread.
                use objc2::sel;
                use objc2_app_kit::NSWindow;
                use objc2_foundation::NSObjectProtocol;
                let native = window.ns_window()?;
                let native = unsafe { &*native.cast::<NSWindow>() };
                if let Some(content) = native.contentView() {
                    if let Some(frame) = unsafe { content.superview() } {
                        if frame.respondsToSelector(sel!(setPrefersCompactControlSizeMetrics:)) {
                            frame.setPrefersCompactControlSizeMetrics(false);
                        }
                    }
                }
            }
            #[cfg(target_os = "linux")]
            linux_media::attach(&window, url.origin().ascii_serialization())?;
            window_state::restore(&window);
            if app.state::<connection::Startup>().1.load(std::sync::atomic::Ordering::SeqCst) == 0 {
                connection::watch(app.handle().clone(), url.origin().ascii_serialization(), selected.as_ref().and_then(|e| e["key"].as_str().map(str::to_owned)));
            }
            desktop::watch(app.handle().clone());
            local_access::watch(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Kindred desktop could not start");
}
