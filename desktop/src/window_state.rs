//! Device-wide window placement, outside version and account directories.
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, sync::Mutex};
use tauri::Manager;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Placement {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale: f64,
    monitor: Option<String>,
    maximized: bool,
    // Linux can report an uninitialized outer rectangle before its first map.
    // Retain the measured frame rather than subtracting that startup geometry.
    #[serde(default)]
    frame: Option<(u32, u32)>,
}
#[derive(Clone, Debug)]
struct Screen {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale: f64,
    name: Option<String>,
}
#[derive(Default)]
pub struct Store(Mutex<BTreeMap<String, Placement>>);

fn fit(saved: &Placement, screens: &[Screen], minimum: (u32, u32)) -> Option<Placement> {
    if screens.is_empty() {
        return None;
    }
    let overlap = |s: &Screen| {
        let w = ((saved.x as i64 + saved.width as i64).min(s.x as i64 + s.width as i64)
            - (saved.x as i64).max(s.x as i64))
        .max(0);
        let h = ((saved.y as i64 + saved.height as i64).min(s.y as i64 + s.height as i64)
            - (saved.y as i64).max(s.y as i64))
        .max(0);
        w * h
    };
    let screen = screens
        .iter()
        .find(|s| saved.monitor.is_some() && s.name == saved.monitor)
        .or_else(|| {
            screens
                .iter()
                .filter(|s| overlap(s) > 0)
                .max_by_key(|s| overlap(s))
        })
        .unwrap_or(&screens[0]);
    let scale = if saved.scale.is_finite() && saved.scale > 0.0 {
        screen.scale / saved.scale
    } else {
        1.0
    };
    let frame = saved.frame.map(|(w, h)| {
        (
            (w as f64 * scale).round() as u32,
            (h as f64 * scale).round() as u32,
        )
    });
    let (fw, fh) = frame.unwrap_or_default();
    let width = ((saved.width as f64 * scale).round() as u32)
        .max(((minimum.0 as f64 * screen.scale).round() as u32).saturating_add(fw))
        .min(screen.width);
    let height = ((saved.height as f64 * scale).round() as u32)
        .max(((minimum.1 as f64 * screen.scale).round() as u32).saturating_add(fh))
        .min(screen.height);
    Some(Placement {
        x: (saved.x as i64).clamp(
            screen.x as i64,
            screen.x as i64 + (screen.width - width) as i64,
        ) as i32,
        y: (saved.y as i64).clamp(
            screen.y as i64,
            screen.y as i64 + (screen.height - height) as i64,
        ) as i32,
        width,
        height,
        scale: screen.scale,
        monitor: screen.name.clone(),
        maximized: saved.maximized,
        frame,
    })
}
fn path(label: &str) -> Option<std::path::PathBuf> {
    if !matches!(label, "main" | "profile-home") {
        return None;
    }
    let root = crate::local_files::install_root()
        .ok()?
        .join("window-state");
    std::fs::create_dir_all(&root).ok()?;
    Some(root.join(format!("{label}.json")))
}
fn capture(window: &tauri::Window) {
    #[cfg(windows)]
    {
        // Windows reports move/resize notifications before Tauri's maximized flag
        // settles. Read the OS restore rectangle so those events cannot overwrite it.
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetWindowPlacement, IsIconic, SW_SHOWMAXIMIZED, WINDOWPLACEMENT,
        };
        let Ok(hwnd) = window.hwnd() else {
            return;
        };
        let hwnd = hwnd.0 as _;
        if unsafe { IsIconic(hwnd) } != 0 || window.is_fullscreen().unwrap_or(true) {
            return;
        }
        let mut wp: WINDOWPLACEMENT = unsafe { std::mem::zeroed() };
        wp.length = std::mem::size_of::<WINDOWPLACEMENT>() as u32;
        if unsafe { GetWindowPlacement(hwnd, &mut wp) } == 0 {
            return;
        }
        let r = wp.rcNormalPosition;
        if r.right <= r.left || r.bottom <= r.top {
            return;
        }
        let monitor = window.current_monitor().ok().flatten();
        // WINDOWPLACEMENT uses workspace coordinates for normal app windows.
        let (dx, dy) = monitor
            .as_ref()
            .map(|m| {
                (
                    m.work_area().position.x - m.position().x,
                    m.work_area().position.y - m.position().y,
                )
            })
            .unwrap_or((0, 0));
        let p = Placement {
            x: r.left + dx,
            y: r.top + dy,
            width: (r.right - r.left) as u32,
            height: (r.bottom - r.top) as u32,
            scale: window.scale_factor().unwrap_or(1.0),
            monitor: monitor.and_then(|m| m.name().cloned()),
            maximized: wp.showCmd == SW_SHOWMAXIMIZED as u32,
            frame: None,
        };
        if let Ok(mut placements) = window.state::<Store>().0.lock() {
            placements.insert(window.label().into(), p);
        }
        return;
    }
    #[cfg(not(windows))]
    {
        #[cfg(target_os = "linux")]
        {
            use gtk::prelude::*;
            // Hidden GTK windows have not received their first geometry event.
            if !window.gtk_window().is_ok_and(|w| w.is_mapped()) {
                return;
            }
        }
        if window.is_minimized().unwrap_or(true) || window.is_fullscreen().unwrap_or(true) {
            return;
        }
        let state = window.state::<Store>();
        let Ok(mut placements) = state.0.lock() else {
            return;
        };
        let maximized = window.is_maximized().unwrap_or(false);
        if maximized {
            if let Some(p) = placements.get_mut(window.label()) {
                p.maximized = true;
            }
            return;
        }
        let (Ok(pos), Ok(size), Ok(scale)) = (
            window.outer_position(),
            window.outer_size(),
            window.scale_factor(),
        ) else {
            return;
        };
        if size.width < 320 || size.height < 240 {
            return;
        }
        let frame = window.inner_size().ok().and_then(|inner| {
            measured_frame(
                (size.width, size.height),
                (inner.width, inner.height),
                scale,
            )
        });
        #[cfg(target_os = "linux")]
        if frame.is_none() {
            return;
        }
        let monitor = window
            .current_monitor()
            .ok()
            .flatten()
            .and_then(|m| m.name().cloned());
        placements.insert(
            window.label().into(),
            Placement {
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                scale,
                monitor,
                maximized,
                frame,
            },
        );
    }
}
fn measured_frame(outer: (u32, u32), inner: (u32, u32), scale: f64) -> Option<(u32, u32)> {
    if inner.0 < 100 || inner.1 < 100 || outer.0 < inner.0 || outer.1 < inner.1 {
        return None;
    }
    let frame = (outer.0 - inner.0, outer.1 - inner.1);
    // Reject startup coordinates misreported as dimensions and corrupt state.
    let limit = (128.0 * scale.clamp(1.0, 8.0)) as u32;
    (frame.0 <= limit && frame.1 <= limit).then_some(frame)
}

fn content_bounds(
    p: &Placement,
    frame: (u32, u32),
    minimum: (u32, u32),
) -> ((u32, u32), (u32, u32)) {
    let frame = measured_frame(
        (p.width, p.height),
        (
            p.width.saturating_sub(frame.0),
            p.height.saturating_sub(frame.1),
        ),
        p.scale,
    )
    .unwrap_or_default();
    let available = (
        p.width.saturating_sub(frame.0).max(1),
        p.height.saturating_sub(frame.1).max(1),
    );
    let minimum = (
        ((minimum.0 as f64 * p.scale) as u32).min(available.0),
        ((minimum.1 as f64 * p.scale) as u32).min(available.1),
    );
    (available, minimum)
}
pub fn flush(app: &tauri::AppHandle) {
    let state = app.state::<Store>();
    let Ok(placements) = state.0.lock() else {
        return;
    };
    for (label, placement) in placements.iter() {
        if let (Some(path), Ok(value)) = (path(label), serde_json::to_value(placement)) {
            let _ = crate::local_files::atomic(&path, &value);
        }
    }
}
pub fn restore(window: &tauri::WebviewWindow) {
    let Some(file) = path(window.label()) else {
        return;
    };
    let saved = std::fs::read(file)
        .ok()
        .and_then(|b| serde_json::from_slice::<Placement>(&b).ok());
    let mut monitors = window.available_monitors().unwrap_or_default();
    // The primary screen is the fallback only when the old screen cannot be found.
    let primary = window
        .primary_monitor()
        .ok()
        .flatten()
        .and_then(|m| m.name().cloned());
    monitors.sort_by_key(|m| m.name() != primary.as_ref());
    let screens: Vec<_> = monitors
        .iter()
        .map(|m| {
            let area = m.work_area();
            Screen {
                x: area.position.x,
                y: area.position.y,
                width: area.size.width,
                height: area.size.height,
                scale: m.scale_factor(),
                name: m.name().cloned(),
            }
        })
        .collect();
    let minimum = if window.label() == "main" {
        (800, 580)
    } else {
        (420, 480)
    };
    if let Some(p) = saved.as_ref().and_then(|p| fit(p, &screens, minimum)) {
        // A smaller replacement display must still leave the controls reachable.
        #[cfg(target_os = "linux")]
        let frame = p.frame.unwrap_or_default();
        #[cfg(not(target_os = "linux"))]
        let frame = match (window.outer_size(), window.inner_size()) {
            (Ok(outer), Ok(inner)) => measured_frame(
                (outer.width, outer.height),
                (inner.width, inner.height),
                p.scale,
            )
            .unwrap_or_default(),
            _ => (0, 0),
        };
        let (content, minimum) = content_bounds(&p, frame, minimum);
        let _ = window.set_min_size(Some(tauri::PhysicalSize::new(minimum.0, minimum.1)));
        let _ = window.set_position(tauri::PhysicalPosition::new(p.x, p.y));
        let _ = window.set_size(tauri::PhysicalSize::new(content.0, content.1));
        let maximize = p.maximized;
        if let Ok(mut state) = window.state::<Store>().0.lock() {
            state.insert(window.label().into(), p);
        }
        if maximize {
            let _ = window.maximize();
        }
    } else {
        // New auxiliary windows follow the main window's monitor.
        if window.label() != "main" {
            if let Some(main) = window.app_handle().get_webview_window("main") {
                if let (Ok(Some(m)), Ok(size)) = (main.current_monitor(), window.outer_size()) {
                    let area = m.work_area();
                    let _ = window.set_position(tauri::PhysicalPosition::new(
                        area.position.x + (area.size.width.saturating_sub(size.width) / 2) as i32,
                        area.position.y + (area.size.height.saturating_sub(size.height) / 2) as i32,
                    ));
                }
            }
        }
        capture(&window.as_ref().window());
    }
    let w = window.as_ref().window().clone();
    window.on_window_event(move |event| {
        if matches!(
            event,
            tauri::WindowEvent::Moved(_)
                | tauri::WindowEvent::Resized(_)
                | tauri::WindowEvent::ScaleFactorChanged { .. }
                | tauri::WindowEvent::Focused(_)
                | tauri::WindowEvent::CloseRequested { .. }
        ) {
            capture(&w);
        }
        if matches!(
            event,
            tauri::WindowEvent::Focused(false) | tauri::WindowEvent::CloseRequested { .. }
        ) {
            flush(w.app_handle());
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    fn screen(x: i32, y: i32, w: u32, h: u32, scale: f64, name: &str) -> Screen {
        Screen {
            x,
            y,
            width: w,
            height: h,
            scale,
            name: Some(name.into()),
        }
    }
    fn saved() -> Placement {
        Placement {
            x: -1700,
            y: 110,
            width: 1300,
            height: 860,
            scale: 1.0,
            monitor: Some("left".into()),
            maximized: false,
            frame: None,
        }
    }
    #[test]
    fn preserves_negative_monitor_coordinates() {
        let p = fit(
            &saved(),
            &[
                screen(0, 0, 1920, 1040, 1.0, "primary"),
                screen(-1920, 0, 1920, 1040, 1.0, "left"),
            ],
            (320, 240),
        )
        .unwrap();
        assert_eq!((p.x, p.y, p.width), (-1700, 110, 1300));
    }
    #[test]
    fn disconnected_display_moves_whole_window_on_screen() {
        let p = fit(
            &saved(),
            &[screen(0, 0, 1280, 720, 1.0, "primary")],
            (320, 240),
        )
        .unwrap();
        assert_eq!((p.x, p.y, p.width, p.height), (0, 0, 1280, 720));
    }
    #[test]
    fn changed_scale_preserves_logical_size_and_maximized() {
        let mut s = saved();
        s.maximized = true;
        let p = fit(
            &s,
            &[screen(-3000, -400, 3000, 1700, 1.5, "left")],
            (320, 240),
        )
        .unwrap();
        assert_eq!((p.width, p.height, p.maximized), (1950, 1290, true));
        assert!(p.x >= -3000 && p.x + p.width as i32 <= 0);
    }
    #[test]
    fn renamed_monitor_uses_overlap_before_primary() {
        let p = fit(
            &saved(),
            &[
                screen(0, 0, 1920, 1040, 1.0, "primary"),
                screen(-1920, 0, 1920, 1040, 1.0, "new"),
            ],
            (320, 240),
        )
        .unwrap();
        assert_eq!(p.x, -1700);
    }
    #[test]
    fn invalid_and_extreme_bounds_are_clamped() {
        let mut s = saved();
        s.x = i32::MAX;
        s.y = i32::MIN;
        s.width = u32::MAX;
        s.scale = f64::NAN;
        let p = fit(&s, &[screen(0, 0, 1920, 1040, 1.0, "primary")], (320, 240)).unwrap();
        assert_eq!((p.x, p.y, p.width), (0, 0, 1920));
        assert!(fit(&s, &[], (320, 240)).is_none());
    }
    #[test]
    fn accounts_recovers_tiny_saved_window_and_hidden_startup_geometry() {
        let mut s = saved();
        s.width = 5;
        s.height = 400;
        let p = fit(&s, &[screen(0, 0, 2160, 1400, 1.0, "primary")], (420, 480)).unwrap();
        assert_eq!((p.width, p.height), (420, 480));
        assert_eq!(measured_frame((1920, 1080), (560, 620), 1.0), None);
        assert_eq!(
            content_bounds(&p, (1920, 1080), (420, 480)),
            ((420, 480), (420, 480))
        );
    }
    #[test]
    fn saved_frame_preserves_content_size_and_scales_with_display() {
        let mut s = saved();
        s.width = 562;
        s.height = 645;
        s.frame = Some((2, 25));
        let p = fit(&s, &[screen(0, 0, 3000, 2000, 2.0, "primary")], (420, 480)).unwrap();
        assert_eq!(
            content_bounds(&p, p.frame.unwrap(), (420, 480)),
            ((1120, 1240), (840, 960))
        );
    }
    #[test]
    fn small_display_limits_minimum_without_using_invalid_frame() {
        let p = fit(
            &saved(),
            &[screen(0, 0, 360, 300, 1.0, "primary")],
            (420, 480),
        )
        .unwrap();
        assert_eq!(
            content_bounds(&p, (0, 0), (420, 480)),
            ((360, 300), (360, 300))
        );
        let mut value = serde_json::to_value(saved()).unwrap();
        value.as_object_mut().unwrap().remove("frame");
        assert!(
            serde_json::from_value::<Placement>(value)
                .unwrap()
                .frame
                .is_none()
        );
    }
}
