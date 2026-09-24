fn escape(value: &str) -> String {
    value
        .chars()
        .filter(|c| {
            matches!(c, '\t' | '\r' | '\n') || (*c >= ' ' && !matches!(c, '\u{fffe}' | '\u{ffff}'))
        })
        .collect::<String>()
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

pub fn toast_xml(title: &str, body: &str) -> String {
    let title = escape(title);
    format!(
        r#"<toast><visual><binding template="ToastGeneric"><text>{title}</text><text>{}</text></binding></visual><audio silent="true"/></toast>"#,
        escape(body)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bot_name_and_untrusted_preview_form_safe_text_only_xml() {
        let xml = toast_xml("Mira & Atlas", "Review <done>\0 \"quoted\"");
        assert!(xml.contains("Mira &amp; Atlas"));
        assert!(xml.contains("Review &lt;done&gt; &quot;quoted&quot;"));
        assert!(!xml.contains('\0'));
        assert!(!xml.contains("<image"));
        assert!(xml.contains("<audio silent=\"true\"/>"));
        assert!(!xml.contains("Notification.Default"));
    }
}
