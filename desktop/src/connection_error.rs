//! Safe connection guidance from transport causes, never from the requested URL.
//! Does not retry, change schemes, trust certificates, or expose raw error data.
use std::{error::Error, io};

pub fn explain(cause: Option<&(dyn Error + 'static)>, timed_out: bool, https: bool) -> &'static str {
    let mut messages = String::new();
    let mut refused = false;
    let mut timeout = timed_out;
    let mut cause = cause;
    // Defensive bound for third-party error implementations with cyclic sources.
    for _ in 0..16 {
        let Some(current) = cause else { break };
        if let Some(error) = current.downcast_ref::<io::Error>() {
            refused |= error.kind() == io::ErrorKind::ConnectionRefused;
            timeout |= error.kind() == io::ErrorKind::TimedOut;
        }
        messages.push_str(&current.to_string().to_ascii_lowercase());
        messages.push('\n');
        cause = current.source();
    }
    let has = |needles: &[&str]| needles.iter().any(|needle| messages.contains(needle));
    if timeout {
        "The server did not respond in time. Check that it is running and that its address, port, and network connection are reachable."
    } else if refused || has(&["connection refused", "actively refused"]) {
        "The server refused the connection. Check that Kindred or its HTTPS proxy is running and listening on the port in this address."
    } else if has(&["dns error", "failed to lookup address", "name or service not known", "no such host", "nodename nor servname", "temporary failure in name resolution"]) {
        "The server name could not be resolved. Check the hostname and your DNS, VPN, or Tailscale connection."
    } else if https && has(&["invalid peer certificate", "invalid certificate:", "certificate verify failed", "certificate verification failed", "unknownissuer", "notvalidforname"]) {
        "The server's HTTPS certificate could not be verified. Use the hostname covered by the certificate and check its expiry and trusted certificate chain."
    } else if https && has(&["invalidcontenttype", "invalid content type", "wrong version number", "unknown protocol", "packet length too long", "record overflow"]) {
        "The HTTPS handshake received an unexpected protocol response. This port may serve plain HTTP. Use the server's HTTPS proxy or Tailscale HTTPS address and port. For a local server or SSH tunnel, enter its http://localhost address explicitly."
    } else if https && has(&["tls", "ssl", "handshake"]) {
        "The HTTPS handshake failed. Check that this port serves HTTPS and that the server's TLS configuration is working."
    } else {
        "Could not connect to the server. Check its address and port, confirm it is running, and check your network or VPN connection."
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[derive(Debug)]
    struct Wrapped(Box<dyn Error>);
    impl std::fmt::Display for Wrapped {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { f.write_str("transport failed") }
    }
    impl Error for Wrapped {
        fn source(&self) -> Option<&(dyn Error + 'static)> { Some(self.0.as_ref()) }
    }
    fn text(message: &str, https: bool) -> &'static str {
        let cause = Wrapped(Box::new(io::Error::other(message.to_owned())));
        explain(Some(&cause), false, https)
    }
    #[test]
    fn plain_http_response_is_not_certificate_failure() {
        for error in ["received corrupt message of type InvalidContentType", "SSL routines:wrong version number"] {
            let message = text(error, true);
            assert!(message.contains("may serve plain HTTP"));
            assert!(!message.contains("certificate"));
            assert!(message.contains("HTTPS address and port"));
            assert!(message.contains("http://localhost"));
        }
    }
    #[test]
    fn actual_certificate_failures_have_certificate_guidance() {
        for error in ["invalid peer certificate: UnknownIssuer", "invalid peer certificate: NotValidForName", "invalid peer certificate: Expired", "certificate verify failed"] {
            assert!(text(error, true).contains("certificate could not be verified"));
        }
    }
    #[test]
    fn network_failures_are_distinct_from_certificates() {
        let refused = Wrapped(Box::new(io::Error::from(io::ErrorKind::ConnectionRefused)));
        assert!(explain(Some(&refused), false, true).contains("refused"));
        assert!(explain(None, true, true).contains("did not respond in time"));
        let timeout = io::Error::from(io::ErrorKind::TimedOut);
        assert!(explain(Some(&timeout), false, true).contains("did not respond in time"));
        for error in ["dns error: failed to lookup address information", "No such host is known", "nodename nor servname provided"] {
            assert!(text(error, true).contains("could not be resolved"));
        }
        assert!(text("TLS handshake eof", true).contains("TLS configuration"));
        assert!(!text("connection reset by peer", true).contains("certificate"));
    }
    #[test]
    fn unknown_and_http_failures_do_not_claim_tls_faults_or_expose_causes() {
        for error in ["private-data", "invalid peer certificate: UnknownIssuer", "wrong version number"] {
            let message = text(error, false);
            assert!(!message.contains("certificate"));
            assert!(!message.contains("private-data"));
            assert!(message.contains("address and port"));
        }
        assert!(explain(None, false, true).contains("Could not connect"));
    }
}
