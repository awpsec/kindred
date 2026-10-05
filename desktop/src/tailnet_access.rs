//! Read/validate Tailscale's machine and HTTPS root configuration. Never infer
//! readiness from saved Kindred settings, and never replace an unrelated share.
use serde_json::{Value,json};

pub fn state(status: &Value, serve: &Value) -> Value {
    if status["BackendState"] != "Running" {
        return json!({"state":"not_signed_in","message":"Open Tailscale and sign in on this computer, then check again."});
    }
    let host=status["Self"]["DNSName"].as_str().unwrap_or("").trim_end_matches('.');
    let labels:Vec<_>=host.split('.').collect();
    if labels.len()<4 || !host.ends_with(".ts.net") || labels.iter().any(|s|s.is_empty()||s.starts_with('-')||s.ends_with('-')||!s.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-')) {
        return json!({"state":"problem","message":"Tailscale has no valid phone address. Enable MagicDNS in your Tailscale settings and check again."});
    }
    let address=format!("https://{host}");let key=format!("{host}:443");
    if serve["AllowFunnel"][&key].as_bool()==Some(true) {
        return json!({"state":"problem","address":address,"message":"This address is shared publicly. Turn off public sharing in Tailscale before using private phone access."});
    }
    let handler=&serve["Web"][&key]["Handlers"]["/"];
    let proxy=handler["Proxy"].as_str().unwrap_or("");
    let matching=serve["TCP"]["443"]["HTTPS"]==true && matches!(proxy,"http://127.0.0.1:9444"|"http://127.0.0.1:9444/"|"http://localhost:9444"|"http://localhost:9444/");
    if serve["Foreground"].as_object().is_some_and(|v|!v.is_empty()) {return json!({"state":"problem","address":address,"message":"A temporary Tailscale share is active. Stop it in Tailscale before setting up Kindred phone access."});}
    if matching {return json!({"state":"shared","address":address,"message":"Private phone sharing is set up."});}
    let conflict=!handler.is_null() || serve["TCP"]["443"]["TCPForward"].is_string() || serve["TCP"]["443"]["HTTP"]==true || serve["Foreground"].as_object().is_some_and(|v|!v.is_empty());
    if conflict {return json!({"state":"problem","address":address,"message":"Tailscale already shares another service at this address. Keep that service; choose a separate Tailscale setup for Kindred before trying again."});}
    json!({"state":"not_set_up","address":address,"message":"Turn on phone access to share this Kindred privately with your Tailscale devices."})
}
#[cfg(test)]
mod tests {
    use super::*;
    fn status()->Value{json!({"BackendState":"Running","Self":{"DNSName":"computer.tailnet.ts.net."}})}
    fn share()->Value{json!({"TCP":{"443":{"HTTPS":true}},"Web":{"computer.tailnet.ts.net:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:9444"},"/other":{"Proxy":"http://127.0.0.1:3000"}}}}})}
    #[test] fn matching_root_only_and_public_sharing_rejected(){
        assert_eq!(state(&status(),&share())["state"],"shared");
        let mut value=share();value["AllowFunnel"]=json!({"computer.tailnet.ts.net:443":true});assert_eq!(state(&status(),&value)["state"],"problem");
        let mut value=share();value["Web"]["computer.tailnet.ts.net:443"]["Handlers"]["/"]["Proxy"]=json!("http://127.0.0.1:9445");assert_eq!(state(&status(),&value)["state"],"problem");
        let mut value=share();value["Web"]["computer.tailnet.ts.net:443"]["Handlers"].as_object_mut().unwrap().remove("/");assert_eq!(state(&status(),&value)["state"],"not_set_up");
    }
    #[test] fn login_and_dns_are_required(){
        assert_eq!(state(&json!({"BackendState":"NeedsLogin"}),&json!({}))["state"],"not_signed_in");
        for host in ["evil.test","a.ts.net","a.b.ts.net/path","a.b.ts.net:443","a..ts.net"]{assert_eq!(state(&json!({"BackendState":"Running","Self":{"DNSName":host}}),&json!({}))["state"],"problem");}
        assert_eq!(state(&status(),&json!({}))["address"],"https://computer.tailnet.ts.net");
    }
}
