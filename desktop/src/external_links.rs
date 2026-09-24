//! Open web links in the system browser without navigating the trusted webview.
use crate::{
    desktop::{self, Desktop},
    surface::Surface,
};

fn web_url(value: &str) -> Result<tauri::Url, String> {
    let invalid = "Only HTTP or HTTPS links without embedded credentials can open in your browser.";
    if value.len() > 8192 || value.chars().any(char::is_control) {
        return Err(invalid.into());
    }
    let url = tauri::Url::parse(value).map_err(|_| invalid.to_owned())?;
    if !matches!(url.scheme(), "https" | "http")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(invalid.into());
    }
    Ok(url)
}

#[tauri::command]
pub async fn open_external_url(
    window: Surface,
    state: tauri::State<'_, Desktop>,
    url: String,
) -> Result<(), String> {
    desktop::trusted(&window, &state)?;
    let url = web_url(&url)?;
    // Browser startup must not hold the webview thread or a desktop state lock.
    tauri::async_runtime::spawn_blocking(move || open::that(url.as_str()))
        .await
        .map_err(|_| {
            "Your browser could not start. Copy the link and open it in your browser.".to_owned()
        })?
        .map_err(|_| {
            "Your browser could not open the link. Copy it and open it in your browser.".to_owned()
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_device_sign_in_and_web_links() {
        for value in [
            "https://auth.openai.com/codex/device",
            "https://example.com/oauth?state=a%2Bb#continue",
            "http://127.0.0.1:8000/help",
        ] {
            assert_eq!(web_url(value).unwrap().as_str(), value);
        }
    }

    #[test]
    fn rejects_non_web_schemes_credentials_and_control_characters() {
        for value in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,hello",
            "kindred-update://check",
            "//example.com",
            "https://user:password@example.com/",
            "https://user@example.com/",
            "https://example.com/\n",
            "https://example.com/\0",
        ] {
            assert!(web_url(value).is_err(), "{value:?}");
        }
        assert!(web_url(&format!("https://example.com/{}", "x".repeat(8192))).is_err());
    }
}
