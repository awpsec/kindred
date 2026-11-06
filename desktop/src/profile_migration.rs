//! Native relay for complete profile moves. File bytes and account sessions stay
//! out of the web UI. Server journals, not this process, own cutover authority.
use super::*;
use std::sync::atomic::Ordering;

async fn call(client: &reqwest::Client, server: &str, token: &str, id: &str, action: &str, mut body: Value) -> Result<Value> {
    body["id"] = json!(id);
    body["action"] = json!(action);
    transfer_json(client, server, "/identity/migration", token, Some(body)).await
}
fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder().connect_timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none()).build().map_err(error)
}
fn pending(host: &Host) -> Result<Value> {
    Ok(host.entries.lock().map_err(error)?["transfer_request"].clone())
}
fn update_pending(host: &Host, fields: Value) -> Result<()> {
    let mut directory = host.entries.lock().map_err(error)?;
    for (key, value) in fields.as_object().ok_or("Invalid migration progress")? {
        directory["transfer_request"][key] = value.clone();
    }
    save(&directory)
}
fn check_cancel(host: &Host) -> Result<()> {
    if host.migration_cancel.load(Ordering::SeqCst) { Err("Migration cancellation requested".into()) } else { Ok(()) }
}
fn same_receipt(receipt: &Value, id: &str, digest: &Value) -> Result<()> {
    if receipt["id"] != id || &receipt["digest"] != digest {
        return Err("The destination returned a receipt for a different workspace. The source stays paused.".into());
    }
    Ok(())
}

pub(super) async fn run(window: &crate::surface::Surface, host: &Host, address: String, username: String,
    password: String, register: bool, remember: bool, invite: Option<String>) -> Result<Value> {
    host.migration_cancel.store(false, Ordering::SeqCst);
    let source = source_entry(window, host)?;
    let server = source["server"].as_str().ok_or("Missing source server")?;
    let source_token = source["token"].as_str().ok_or("Sign in to the source first")?;
    let destination = validate_url(&address)?.origin().ascii_serialization();
    if server == destination || (crate::local_server::is_origin(server) && crate::local_server::is_origin(&destination)) {
        return Err("Choose a different destination server.".into());
    }
    let client = client()?;
    let identity = transfer_json(&client, server, "/identity/profiles", source_token, None).await?;
    if identity["active"] != source["profile_id"] || identity["legacy"] == true {
        return Err("Sign in to the account that owns this exact profile before moving it.".into());
    }
    let source_meta = transfer_json(&client, server, "/identity/meta", "", None).await?;
    let meta = transfer_json(&client, &destination, "/identity/meta", "", None).await?;
    if source_meta["workspace_migration"] != 1 || meta["workspace_migration"] != 1 || source_meta["version"] != meta["version"] {
        return Err("Update both servers to the same version with complete workspace migration support before moving.".into());
    }
    let previous = transfer_json(&client, server, "/identity/transfer", source_token, None).await?;
    if !previous.is_null() && previous["complete_migration"] != true {
        return Err("Finish or cancel the older workspace transfer before starting a complete migration.".into());
    }
    let old = pending(host)?;
    if old["protocol"] == 1 && old["source"] == source["key"]
        && (old["destination"] != destination || old["username"] != username) {
        return Err("Resume with the original destination and account, or cancel this move first.".into());
    }
    let id = transfer_request_id(&previous, &old, &source["key"], &destination, &username)?;
    if old["id"] != id {
        let mut directory = host.entries.lock().map_err(error)?;
        directory["transfer_request"] = json!({"protocol":1,"id":id,"source":source["key"],"destination":destination,"username":username});
        save(&directory)?;
    }
    let name = identity["profiles"].as_array().and_then(|items| items.iter().find(|p| p["active"] == true))
        .and_then(|p| p["name"].as_str()).unwrap_or("Kindred");
    transfer_stage(host, "Connecting to the destination", 1);
    let register = register || meta["first_user"] == true;
    let mut credentials = json!({"login":username,"password":password,"request_id":id,"invite":invite.unwrap_or_default()});
    credentials[if register {"name"} else {"new_profile_name"}] = json!(name);
    let signed = transfer_json(&client, &destination, if register {"/identity/register"} else {"/identity/login"}, "", Some(credentials.clone())).await;
    let account = match signed {
        Ok(value) => value,
        Err(original) if register => {
            credentials["new_profile_name"] = json!(name);
            transfer_json(&client, &destination, "/identity/login", "", Some(credentials)).await.map_err(|_| original)?
        }
        Err(message) => return Err(message),
    };
    let token = account["token"].as_str().ok_or("Destination sign-in returned no session")?;
    let profile = account["profile_id"].as_str().ok_or("Destination returned no profile")?;
    if pending(host)?["destination_profile"].as_str().is_some_and(|saved| saved != profile) {
        return Err("Destination sign-in selected a different profile. Resume with the original destination account.".into());
    }
    *host.migration_session.lock().map_err(error)? = json!({"id":id,"server":destination,"token":token,"profile":profile});
    update_pending(host, json!({"destination_profile":profile}))?;
    // Save the destination as a distinct entry immediately. A restart can find
    // the reserved copy; it cannot accidentally start work while it is fenced.
    {
        let mut directory = host.entries.lock().map_err(error)?;
        let entries = directory["entries"].as_array_mut().ok_or("Profile directory unavailable")?;
        let new_key = key(&destination, profile);
        entries.retain(|entry| entry["key"] != new_key);
        entries.push(json!({"key":new_key,"server":destination,"profile_id":profile,"name":name,"username":username,
            "token":if remember {token} else {""},"legacy":false,"migration_state":"staging"}));
        save(&directory)?;
    }
    if pending(host)?["cancel_requested"] == true {
        let status=call(&client,&destination,token,&id,"status",json!({})).await?;
        if matches!(status["state"].as_str(),Some("activating"|"active")) {
            update_pending(host,json!({"cancel_requested":false}))?;
        } else { host.migration_cancel.store(true, Ordering::SeqCst); }
    }
    let result = copy_and_activate(window, host, &client, &source, &destination, token, profile, &id).await;
    if result.is_ok() {
        // A confirmed activation wins a simultaneous Cancel. Preserve the new
        // workspace and complete the local profile switch.
        host.migration_cancel.store(false, Ordering::SeqCst);
        update_pending(host,json!({"cancel_requested":false}))?;
    }
    if host.migration_cancel.load(Ordering::SeqCst) {
        cancel_idle(window, host, None).await?;
        return Ok(json!({"cancelled":true}));
    }
    result?;
    transfer_stage(host, "Saving both profiles", 7);
    let identity = transfer_json(&client, &destination, "/identity/profiles", token, None).await?;
    if identity["active"] != profile { return Err("The destination session changed. Reconnect before switching profiles.".into()); }
    {
        let mut directory = host.entries.lock().map_err(error)?;
        let new_key = key(&destination, profile);
        for entry in directory["entries"].as_array_mut().unwrap() {
            if entry["key"] == new_key { entry["account"] = identity["account_id"].clone(); entry["migration_state"] = json!("active"); }
            if entry["key"] == source["key"] {
                entry["migration_state"] = json!("recovery");
                entry["moved_to"] = json!({"server":destination,"profile_id":profile});
            }
        }
        directory["last"] = json!(new_key);
        directory["transfer_request"]["completed"] = json!(true);
        save(&directory)?;
    }
    transfer_stage(host, "Opening your workspace on the destination", 8);
    restart(window.app_handle(), &destination, token, profile)?;
    Ok(json!({"moved":true}))
}

async fn copy_and_activate(window: &crate::surface::Surface, host: &Host, client: &reqwest::Client, source: &Value,
    destination: &str, token: &str, profile: &str, id: &str) -> Result<()> {
    let server = source["server"].as_str().unwrap();
    let source_token = source["token"].as_str().unwrap();
    check_cancel(host)?;
    let from = call(client, server, source_token, id, "preflight", json!({})).await?;
    let to = call(client, destination, token, id, "preflight", json!({})).await?;
    if from["schema"] != to["schema"] { return Err("These servers use different workspace schemas. Update both before migrating.".into()); }
    if from["active_work"].as_u64().unwrap_or(1) > 0 { return Err("Finish active bot work and end voice calls before migrating. Nothing has been moved.".into()); }
    crate::local_access::cancel_for_profile_change(window.app_handle())?;
    transfer_stage(host, "Pausing work and saving a complete backup", 2);
    let peer = json!({"server":destination,"profile":profile});
    let prepared = call(client, server, source_token, id, "prepare", json!({"peer":peer})).await?;
    let manifest = &prepared["manifest"];
    let digest = &prepared["status"]["manifest_digest"];
    if manifest["id"] != id || !digest.is_string() { return Err("The source returned an invalid snapshot receipt.".into()); }
    update_pending(host, json!({"manifest_digest":digest,"prepared":true}))?;
    check_cancel(host)?;
    transfer_stage(host, "Reserving the destination profile", 3);
    let reserved = call(client, destination, token, id, "reserve",
        json!({"manifest":manifest,"peer":{"server":server,"profile":source["profile_id"]}})).await?;
    same_receipt(&reserved["receipt"], id, digest)?;
    // Persist binding before transmitting file data. Cancellation then requires
    // proof that this exact destination has irrevocably aborted.
    call(client, server, source_token, id, "bind", json!({"peer":peer,"receipt":reserved["receipt"]})).await?;
    let state = reserved["status"]["state"].as_str().unwrap_or("");
    let verified = if matches!(state, "activating" | "active") {
        // Source can reissue its committed proof after a lost final response.
        let mut receipt = reserved["receipt"].clone(); receipt["state"] = json!("verified"); receipt
    } else {
        if state == "receiving" {
            transfer_stage(host, "Copying conversations, files and the bot computer", 4);
            let inventory = manifest["files"].as_array().ok_or("Missing migration inventory")?;
            let total: u64 = inventory.iter().map(|item| item["size"].as_u64().unwrap_or(0)).sum();
            let mut copied: u64 = reserved["status"]["files"].as_object().map(|files| files.values().map(|n| n.as_u64().unwrap_or(0)).sum()).unwrap_or(0);
            for (index, item) in inventory.iter().enumerate() {
                let mut offset = reserved["status"]["files"][index.to_string()].as_u64().unwrap_or(0);
                let size = item["size"].as_u64().ok_or("Invalid file size")?;
                while offset < size {
                    check_cancel(host)?;
                    let chunk = call(client, server, source_token, id, "read", json!({"index":index,"offset":offset})).await?;
                    check_cancel(host)?;
                    let next = call(client, destination, token, id, "write", json!({"index":index,"offset":offset,"data":chunk["data"],"sha256":chunk["sha256"]})).await?;
                    let end = next["offset"].as_u64().filter(|end| *end > offset && *end <= size).ok_or("Invalid destination copy position")?;
                    copied += end - offset; offset = end;
                    let mut status = host.transfer.lock().map_err(error)?;
                    status["copied_bytes"] = json!(copied); status["total_bytes"] = json!(total);
                }
            }
        }
        check_cancel(host)?;
        transfer_stage(host, "Checking the database, connections and computer", 5);
        let checked = call(client, destination, token, id, "verify", json!({})).await?;
        same_receipt(&checked["receipt"], id, digest)?;
        checked["receipt"].clone()
    };
    check_cancel(host)?;
    transfer_stage(host, "Switching execution to the destination", 6);
    // Once this starts, Cancel must reconcile rather than reactivate the source.
    update_pending(host, json!({"cutover_started":true}))?;
    let proof = call(client, server, source_token, id, "commit", json!({"receipt":verified})).await?;
    let active = call(client, destination, token, id, "activate", json!({"proof":proof})).await?;
    if active["state"] != "active" { return Err("Cutover needs reconciliation. Resume the move; the source stays safely paused.".into()); }
    // A cancel racing activation cannot undo newer destination work.
    host.migration_cancel.store(false, Ordering::SeqCst);
    update_pending(host, json!({"cancel_requested":false,"activated":true}))?;
    Ok(())
}

pub(super) async fn cancel(window: &crate::surface::Surface, host: &Host, password: Option<String>) -> Result<Value> {
    let job = pending(host)?;
    if job["protocol"] != 1 {
        let _operation=TransferOperation::begin(host,"Cancelling the older workspace move")?;
        let source=source_entry(window,host)?;let client=client()?;
        let server=source["server"].as_str().unwrap();let token=source["token"].as_str().unwrap();
        let status=transfer_json(&client,server,"/identity/transfer",token,None).await?;
        if status["state"]=="moved" || status["complete_migration"]==true {
            return Err("Reconnect to the destination or resume this migration before changing its state.".into());
        }
        if status["state"]=="prepared" {
            transfer_json(&client,server,"/identity/transfer/cancel",token,Some(json!({"id":status["id"]}))).await?;
        }
        let mut directory=host.entries.lock().map_err(error)?;
        directory.as_object_mut().unwrap().remove("transfer_request");save(&directory)?;
        *host.transfer.lock().map_err(error)?=json!({"state":"cancelled"});
        return Ok(json!({"cancelled":true}));
    }
    host.migration_cancel.store(true, Ordering::SeqCst);
    update_pending(host, json!({"cancel_requested":true}))?;
    if host.transfer.lock().map_err(error)?["state"] == "working" {
        // The active operation owns abort ordering. Interrupt long snapshot/VM
        // checks, then let it obtain the destination abort receipt first.
        let source = source_entry(window, host)?;
        let client = client()?;
        let id = job["id"].as_str().ok_or("Missing migration identity")?;
        let _ = call(&client, source["server"].as_str().unwrap(), source["token"].as_str().unwrap(), id, "cancel_signal", json!({})).await;
        let session = host.migration_session.lock().map_err(error)?.clone();
        if session["id"] == id {
            let _ = call(&client, session["server"].as_str().unwrap(), session["token"].as_str().unwrap(), id, "cancel_signal", json!({})).await;
        }
        return Ok(json!({"requested":true}));
    }
    let _operation=TransferOperation::begin(host,"Checking the destination before cancellation")?;
    cancel_idle(window, host, password).await?;
    Ok(json!({"cancelled":true}))
}
async fn cancel_idle(window: &crate::surface::Surface, host: &Host, password: Option<String>) -> Result<()> {
    let job = pending(host)?;
    let source = source_entry(window, host)?;
    let id = job["id"].as_str().ok_or("Missing migration identity")?;
    let client = client()?;
    let server = source["server"].as_str().unwrap();
    let source_token = source["token"].as_str().unwrap();
    let destination = job["destination"].as_str().ok_or("Missing destination")?;
    let profile = job["destination_profile"].as_str();
    let identity=transfer_json(&client,server,"/identity/profiles",source_token,None).await?;
    if identity["active"] != source["profile_id"] {
        return Err("Sign in to the original source profile before cancelling this move.".into());
    }
    let source_status = call(&client, server, source_token, id, "status", json!({})).await?;
    let mut proof = Value::Null;
    if let Some(profile) = profile {
        let session = host.migration_session.lock().map_err(error)?.clone();
        let mut token = if session["id"] == id { session["token"].as_str().unwrap_or("").to_owned() } else {
            host.entries.lock().map_err(error)?["entries"].as_array().unwrap().iter()
                .find(|e| e["server"] == destination && e["profile_id"] == profile)
                .and_then(|e| e["token"].as_str()).unwrap_or("").to_owned()
        };
        if token.is_empty() {
            let password = password.filter(|s| !s.is_empty()).ok_or("Enter your destination password, then Cancel again so Kindred can verify that copy is inactive.")?;
            let account = transfer_json(&client, destination, "/identity/login", "", Some(json!({"login":job["username"],"password":password,"request_id":id,"new_profile_name":"Migration recovery"}))).await?;
            if account["profile_id"] != profile { return Err("Destination authentication selected another profile. The source remains paused.".into()); }
            token = account["token"].as_str().ok_or("Missing destination session")?.to_owned();
        }
        let selected=transfer_json(&client,destination,"/identity/switch",&token,Some(json!({"profile_id":profile}))).await?;
        token=selected["token"].as_str().ok_or("Destination could not select the migration profile")?.to_owned();
        let identity=transfer_json(&client,destination,"/identity/profiles",&token,None).await?;
        if identity["active"] != profile { return Err("Destination profile could not be verified. The source remains paused.".into()); }
        let status = call(&client, destination, &token, id, "status", json!({})).await?;
        if matches!(status["state"].as_str(),Some("activating"|"active")) {
            update_pending(host,json!({"cancel_requested":false}))?;
            host.migration_cancel.store(false,Ordering::SeqCst);
            return Err("The destination has started activation. Resume the move to connect there; cancelling cannot undo newer work.".into());
        }
        if status["state"] != "absent" {
            proof = call(&client, destination, &token, id, "abort", json!({})).await?;
        }
    }
    if source_status["state"] != "absent" {
        call(&client, server, source_token, id, "cancel", json!({"proof":proof})).await?;
    }
    let mut directory = host.entries.lock().map_err(error)?;
    if let Some(profile) = profile {
        for entry in directory["entries"].as_array_mut().unwrap() {
            if entry["server"] == destination && entry["profile_id"] == profile { entry["migration_state"] = json!("cancelled"); }
        }
    }
    directory.as_object_mut().unwrap().remove("transfer_request");
    save(&directory)?;
    *host.transfer.lock().map_err(error)? = json!({"state":"cancelled","stage":"Move cancelled — original workspace restored","completed":0,"total":8});
    host.migration_cancel.store(false, Ordering::SeqCst);
    Ok(())
}
