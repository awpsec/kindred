//! Versioned, explicit host port plan. Discovery never changes saved exposure.
use crate::network_interfaces::{Interface, origin, private_browser_address, usable_address};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeSet, net::IpAddr};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Selection {
    pub id: String,
    pub addresses: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct Plan {
    pub schema: u32,
    pub bind: String,
    pub access: String,
    pub origins: Vec<String>,
    pub extra_origins: Vec<String>,
    pub interfaces: Vec<Selection>,
    pub all_networks: bool,
}
impl Default for Plan {
    fn default() -> Self {
        Self {
            schema: 2,
            bind: "127.0.0.1".into(),
            access: "local".into(),
            origins: vec![],
            extra_origins: vec![],
            interfaces: vec![],
            all_networks: false,
        }
    }
}
impl Plan {
    pub fn decode(value: serde_json::Value) -> Result<Self, String> {
        let legacy = value.get("schema").is_none();
        let mut plan: Self = serde_json::from_value(value)
            .map_err(|_| "Could not read the saved network settings.".to_string())?;
        if !legacy && plan.schema != 2 {
            return Err("Unsupported saved network settings version.".into());
        }
        if !matches!(plan.access.as_str(), "local" | "tailnet" | "lan") {
            return Err("Unsupported saved network access mode.".into());
        }
        if !matches!(plan.bind.as_str(), "127.0.0.1" | "0.0.0.0") {
            return Err("Unsupported saved listening address.".into());
        }
        if legacy {
            plan.all_networks = plan.bind == "0.0.0.0";
            if plan.all_networks && plan.access == "local" {
                plan.access = "lan".into();
            }
            plan.extra_origins = plan.origins.clone();
        }
        plan.bind = if plan.all_networks {
            "0.0.0.0"
        } else {
            "127.0.0.1"
        }
        .into();
        plan.bindings()?;
        Ok(plan)
    }
    pub fn bindings(&self) -> Result<Vec<String>, String> {
        if self.all_networks {
            return Ok(vec!["0.0.0.0".into()]);
        }
        let mut addresses = BTreeSet::from(["127.0.0.1".to_string()]);
        if self.interfaces.len() > 32 {
            return Err("Choose up to 32 networks.".into());
        }
        for row in &self.interfaces {
            if row.id.is_empty()
                || row.id.len() > 256
                || row.id.chars().any(char::is_control)
                || row.addresses.len() > 32
            {
                return Err("Invalid saved network selection.".into());
            }
            for address in &row.addresses {
                let ip: IpAddr = address
                    .parse()
                    .map_err(|_| "Invalid saved network address.")?;
                if !usable_address(ip) {
                    return Err("This address cannot be used for network access.".into());
                }
                addresses.insert(ip.to_string());
            }
        }
        if addresses.len() > 64 {
            return Err("Choose fewer network addresses.".into());
        }
        Ok(addresses.into_iter().collect())
    }
    pub fn select(
        &mut self,
        ids: &[String],
        all: bool,
        inventory: &[Interface],
    ) -> Result<(), String> {
        if ids.len() > 32 || (all && !ids.is_empty()) {
            return Err("Choose specific networks or All networks.".into());
        }
        let mut selected = Vec::new();
        let mut seen = BTreeSet::new();
        for id in ids {
            if !seen.insert(id) {
                continue;
            }
            let row=inventory.iter().find(|v|&v.id==id && v.available).ok_or_else(||format!("{id} is not available right now. Keep the saved settings or unselect it before saving."))?;
            let addresses: Vec<_> = row
                .addresses
                .iter()
                .filter_map(|s| s.parse::<IpAddr>().ok())
                .filter(|v| usable_address(*v))
                .map(|v| v.to_string())
                .collect();
            if addresses.is_empty() {
                return Err(format!("{id} has no usable address right now."));
            }
            selected.push(Selection {
                id: id.clone(),
                addresses,
            });
        }
        // Validate a complete proposed plan before replacing any current field.
        let mut proposed = self.clone();
        if all || !selected.is_empty() {
            proposed.access = "lan".into();
        }
        proposed.interfaces = selected;
        proposed.all_networks = all;
        proposed.bind = if all { "0.0.0.0" } else { "127.0.0.1" }.into();
        proposed.bindings()?;
        *self = proposed;
        Ok(())
    }
    pub fn generated_origins(&self, inventory: &[Interface]) -> Vec<String> {
        let addresses: Vec<String> = if self.all_networks {
            inventory
                .iter()
                .filter(|v| v.available)
                .flat_map(|v| v.addresses.clone())
                .collect()
        } else {
            self.interfaces
                .iter()
                .flat_map(|v| v.addresses.clone())
                .collect()
        };
        addresses
            .into_iter()
            .filter_map(|s| s.parse::<IpAddr>().ok())
            .filter(|v| usable_address(*v) && private_browser_address(*v))
            .map(origin)
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect()
    }
    pub fn preflight(&self, inventory: &[Interface]) -> Result<(), String> {
        for selected in &self.interfaces {
            let row = inventory
                .iter()
                .find(|v| v.id == selected.id && v.available)
                .ok_or_else(|| {
                    format!(
                        "{} is not available right now. Network settings were not applied.",
                        selected.id
                    )
                })?;
            if selected
                .addresses
                .iter()
                .any(|v| !row.addresses.contains(v))
            {
                return Err(format!(
                    "Address changed on {}. Save to use the new address before restarting.",
                    selected.id
                ));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn wifi(address: &str) -> Interface {
        Interface {
            id: "wifi".into(),
            name: "Wi-Fi".into(),
            kind: "lan".into(),
            addresses: vec![address.into()],
            available: true,
        }
    }
    #[test]
    fn old_configuration_preserves_loopback_and_all_networks_exactly() {
        let local = Plan::decode(serde_json::json!({"bind":"127.0.0.1","origins":[]})).unwrap();
        assert_eq!(local.bindings().unwrap(), vec!["127.0.0.1"]);
        assert!(local.interfaces.is_empty());
        let all =
            Plan::decode(serde_json::json!({"bind":"0.0.0.0","origins":["http://10.1.2.3:9444"]}))
                .unwrap();
        assert!(all.all_networks);
        assert_eq!(all.extra_origins, all.origins);
        assert_eq!(all.bindings().unwrap(), vec!["0.0.0.0"]);
    }
    #[test]
    fn selecting_specific_networks_removes_wildcard_and_always_keeps_loopback() {
        let mut plan = Plan::decode(serde_json::json!({"bind":"0.0.0.0"})).unwrap();
        let rows = vec![
            wifi("192.168.1.2"),
            Interface {
                id: "tailnet".into(),
                name: "Tailscale".into(),
                kind: "tailnet".into(),
                addresses: vec!["fd7a:115c::5".into(), "fe80::5".into()],
                available: true,
            },
        ];
        plan.select(&["wifi".into(), "tailnet".into()], false, &rows)
            .unwrap();
        assert_eq!(
            plan.bindings().unwrap(),
            vec!["127.0.0.1", "192.168.1.2", "fd7a:115c::5"]
        );
        assert!(!plan.all_networks);
        assert_eq!(
            plan.generated_origins(&rows),
            vec!["http://192.168.1.2:9444", "http://[fd7a:115c::5]:9444"]
        );
        let reloaded = Plan::decode(serde_json::to_value(&plan).unwrap()).unwrap();
        assert_eq!(reloaded, plan);
    }
    #[test]
    fn changed_and_missing_networks_do_not_silently_replace_saved_addresses() {
        let mut plan = Plan::default();
        plan.select(&["wifi".into()], false, &[wifi("192.168.1.2")])
            .unwrap();
        let before = plan.clone();
        assert!(plan.preflight(&[]).unwrap_err().contains("not available"));
        assert!(
            plan.preflight(&[wifi("192.168.1.3")])
                .unwrap_err()
                .contains("Address changed")
        );
        assert_eq!(plan, before);
        assert!(plan.select(&["missing".into()], false, &[]).is_err());
        assert_eq!(plan, before);
        plan.select(&["wifi".into()], false, &[wifi("192.168.1.3")])
            .unwrap();
        assert_eq!(plan.bindings().unwrap(), vec!["127.0.0.1", "192.168.1.3"]);
    }
    #[test]
    fn public_listeners_never_become_public_http_origins() {
        let rows = [wifi("8.8.8.8")];
        let mut plan = Plan::default();
        plan.select(&["wifi".into()], false, &rows).unwrap();
        assert!(plan.generated_origins(&rows).is_empty());
    }
}
