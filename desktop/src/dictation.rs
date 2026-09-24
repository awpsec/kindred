//! Explicit model downloads and resident, device-local Whisper inference.
use crate::dictation_runtime::{self, Channel, Process};
use base64::Engine;
use serde_json::{Value, json};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::Manager;
type Result<T> = std::result::Result<T, String>;
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
#[derive(Clone, Copy)]
struct Model {
    id: &'static str,
    name: &'static str,
    file: &'static str,
    size: u64,
    hash: &'static str,
}
const MODELS: [Model; 5] = [
    Model {
        id: "base",
        name: "Base",
        file: "ggml-base-q5_1.bin",
        size: 59707625,
        hash: "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898",
    },
    Model {
        id: "small",
        name: "Small",
        file: "ggml-small-q5_1.bin",
        size: 190085487,
        hash: "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
    },
    Model {
        id: "medium",
        name: "Medium",
        file: "ggml-medium-q5_0.bin",
        size: 539212467,
        hash: "19fea4b380c3a618ec4723c3eef2eb785ffba0d0538cf43f8f235e7b3b34220f",
    },
    Model {
        id: "large-v3-turbo",
        name: "Large v3 Turbo",
        file: "ggml-large-v3-turbo-q5_0.bin",
        size: 574041195,
        hash: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
    },
    Model {
        id: "large-v3",
        name: "Large v3",
        file: "ggml-large-v3-q5_0.bin",
        size: 1081140203,
        hash: "d75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1",
    },
];
fn model(name: &str) -> Result<Model> {
    MODELS
        .iter()
        .find(|m| m.id == name)
        .copied()
        .ok_or("Choose a supported Whisper model.".into())
}
fn root() -> Result<PathBuf> {
    Ok(crate::profiles::data_root()?.join("dictation"))
}
fn downloaded(root: &Path, m: Model) -> bool {
    fs::symlink_metadata(root.join(m.file))
        .is_ok_and(|meta| meta.is_file() && !meta.file_type().is_symlink() && meta.len() == m.size)
}
#[derive(Default)]
struct State {
    generation: u64,
    download_generation: u64,
    enabled: bool,
    model: String,
    phase: String,
    error: String,
    downloading: String,
    progress: u64,
    download_error: String,
    invalid: Vec<String>,
    gpu: bool,
    device: String,
    backend: String,
    fallback_reason: String,
    process: Option<Process>,
    channel: Option<Channel>,
    download_task: Option<tauri::async_runtime::JoinHandle<()>>,
}
#[derive(Default)]
pub struct Worker(Arc<Mutex<State>>);
impl Drop for Worker {
    fn drop(&mut self) {
        stop(&self.0, true);
    }
}
fn stop(shared: &Arc<Mutex<State>>, disable: bool) {
    if let Ok(mut s) = shared.lock() {
        s.generation += 1;
        s.process.take();
        s.channel.take();
        s.gpu = false;
        s.phase = if disable { "off" } else { "idle" }.into();
        if disable {
            s.enabled = false;
            if let Some(task) = s.download_task.take() {
                task.abort();
            }
            s.download_generation += 1;
            s.downloading.clear();
            s.progress = 0;
        }
    }
}
pub fn close(app: &tauri::AppHandle) {
    stop(&app.state::<Worker>().0, true);
}
fn current(shared: &Arc<Mutex<State>>, generation: u64) -> Result<()> {
    let s = shared.lock().map_err(error)?;
    if s.enabled && s.generation == generation {
        Ok(())
    } else {
        Err("Dictation cancelled.".into())
    }
}
fn snapshot(shared: &Arc<Mutex<State>>) -> Result<Value> {
    let root = root()?;
    let mut s = shared.lock().map_err(error)?;
    if s.phase == "ready" && s.process.as_mut().is_none_or(|p| !p.alive()) {
        s.phase = "error".into();
        s.error = "The speech worker stopped. Select a downloaded model to reload it.".into();
        s.process.take();
        s.channel.take();
    }
    let models:Vec<Value>=MODELS.iter().map(|m|json!({"id":m.id,"name":m.name,"bytes":m.size,"downloaded":downloaded(&root,*m)&&!s.invalid.contains(&m.id.to_owned()),"downloading":s.downloading==m.id,"loaded":s.model==m.id&&["ready","transcribing"].contains(&s.phase.as_str())})).collect();
    Ok(
        json!({"supported":dictation_runtime::SUPPORTED,"enabled":s.enabled,"model":s.model,"phase":if s.phase.is_empty(){"off"}else{&s.phase},"error":s.error,"models":models,"downloading":s.downloading,"progress":s.progress,"download_error":s.download_error,"gpu":s.gpu,"device":s.device,"backend":s.backend,"fallback_reason":s.fallback_reason,"worker_pid":s.process.as_ref().map(Process::id)}),
    )
}
#[tauri::command]
pub async fn decide_microphone_permission(
    window: tauri::WebviewWindow,
    request_id: String,
    allowed: bool,
    remember: Option<bool>,
) -> Result<()> {
    #[cfg(target_os = "linux")]
    {
        crate::linux_media::decide(window, request_id, allowed, remember.unwrap_or(false)).await
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (window, request_id, allowed, remember);
        Err("Microphone consent is managed by this platform.".into())
    }
}
#[tauri::command]
pub async fn microphone_permission(window: tauri::WebviewWindow, forget: Option<bool>, request: Option<bool>) -> Result<Value> {
    #[cfg(target_os = "linux")]
    { crate::linux_media::permission(window, forget.unwrap_or(false), request.unwrap_or(false)).await }
    #[cfg(not(target_os = "linux"))]
    { let _=(window,forget,request); Err("Microphone consent is managed by this platform.".into()) }
}
#[tauri::command]
pub fn dictation_status(worker: tauri::State<'_, Worker>) -> Result<Value> {
    snapshot(&worker.0)
}
#[tauri::command]
pub fn configure_dictation(
    worker: tauri::State<'_, Worker>,
    enabled: bool,
    model_name: String,
) -> Result<Value> {
    if enabled && !dictation_runtime::SUPPORTED {
        return Err("Local dictation requires the Windows x64, Linux x64 or macOS app.".into());
    }
    if !enabled {
        stop(&worker.0, true);
        return snapshot(&worker.0);
    }
    let root = root()?;
    if model_name.is_empty() {
        stop(&worker.0, false);
        let mut s = worker.0.lock().map_err(error)?;
        s.enabled = true;
        s.model.clear();
        s.error.clear();
        drop(s);
        return snapshot(&worker.0);
    }
    let selected = model(&model_name)?;
    {
        let s = worker.0.lock().map_err(error)?;
        if s.enabled
            && s.model == selected.id
            && ["loading", "ready", "transcribing"].contains(&s.phase.as_str())
        {
            drop(s);
            return snapshot(&worker.0);
        }
    }
    // Enabling or selecting cannot download a model. Only the explicit + action can.
    if !downloaded(&root, selected) {
        stop(&worker.0, false);
        let mut s = worker.0.lock().map_err(error)?;
        s.enabled = true;
        s.model.clear();
        s.error.clear();
        drop(s);
        return snapshot(&worker.0);
    }
    begin_load(worker.0.clone(), root, selected, false, None)?;
    snapshot(&worker.0)
}
fn begin_load(
    shared: Arc<Mutex<State>>,
    root: PathBuf,
    selected: Model,
    cpu_only: bool,
    expected: Option<u64>,
) -> Result<u64> {
    let generation = {
        let mut s = shared.lock().map_err(error)?;
        if expected.is_some_and(|g| !s.enabled || s.generation != g) {
            return Err("Dictation cancelled.".into());
        }
        s.generation += 1;
        s.process.take();
        s.channel.take();
        s.enabled = true;
        s.model = selected.id.into();
        s.phase = "loading".into();
        s.error.clear();
        s.fallback_reason = if cpu_only {
            "GPU inference failed. The model was reloaded on CPU."
        } else if cfg!(target_os = "linux") {
            "This Linux build runs local Whisper on the CPU."
        } else {
            ""
        }
        .into();
        s.gpu = false;
        s.backend.clear();
        s.device.clear();
        s.generation
    };
    std::thread::spawn(move || {
        let result = load(&shared, &root, selected, generation, cpu_only);
        if let Err(e) = result {
            if let Ok(mut s) = shared.lock() {
                if s.generation == generation {
                    s.phase = "error".into();
                    s.error = e;
                    s.process.take();
                    s.channel.take();
                }
            }
        }
    });
    Ok(generation)
}
fn load(
    shared: &Arc<Mutex<State>>,
    root: &Path,
    selected: Model,
    generation: u64,
    cpu_only: bool,
) -> Result<()> {
    current(shared, generation)?;
    if !downloaded(root, selected) || digest(&root.join(selected.file))? != selected.hash {
        let mut s = shared.lock().map_err(error)?;
        if s.generation == generation {
            s.invalid.push(selected.id.into());
        }
        return Err("This model failed verification. Download it again using +.".into());
    }
    let runtime = install_runtime(root)?;
    current(shared, generation)?;
    let try_gpu = !cpu_only && dictation_runtime::gpu_runtime_available();
    let mut last_error = String::new();
    for gpu in if try_gpu {
        vec![true, false]
    } else {
        vec![false]
    } {
        current(shared, generation)?;
        let (process, mut channel) =
            match dictation_runtime::launch(&runtime, &root.join(selected.file), gpu) {
                Ok(value) => value,
                Err(e) => {
                    last_error = e;
                    continue;
                }
            };
        {
            let mut s = shared.lock().map_err(error)?;
            if !s.enabled || s.generation != generation {
                return Err("Dictation cancelled.".into());
            }
            s.process = Some(process);
        }
        let ready = channel.receive();
        current(shared, generation)?;
        match ready {
            Ok(value) if value["type"] == "ready" => {
                let mut s = shared.lock().map_err(error)?;
                if s.generation != generation {
                    return Err("Dictation cancelled.".into());
                }
                s.gpu = value["gpu"] == true;
                channel.set_accelerated(s.gpu);
                if !s.gpu && (!last_error.is_empty() || value["gpu_identified"] == true) {
                    s.fallback_reason =
                        "The GPU runtime could not load this model. Running on CPU.".into();
                }
                s.backend = value["backend"]
                    .as_str()
                    .unwrap_or("CPU")
                    .chars()
                    .take(80)
                    .collect();
                s.device = value["device"]
                    .as_str()
                    .unwrap_or("CPU")
                    .chars()
                    .take(160)
                    .collect();
                s.phase = "ready".into();
                s.channel = Some(channel);
                s.invalid.retain(|n| n != selected.id);
                return Ok(());
            }
            Ok(_) => last_error = "The speech worker returned an unexpected load response.".into(),
            Err(e) => last_error = e,
        }
        let mut s = shared.lock().map_err(error)?;
        if s.generation == generation {
            s.process.take();
        }
    }
    Err(last_error)
}
#[tauri::command]
pub fn cancel_dictation(
    window: tauri::WebviewWindow,
    worker: tauri::State<'_, Worker>,
) -> Result<()> {
    #[cfg(target_os = "linux")]
    crate::linux_media::cancel(&window);
    #[cfg(not(target_os = "linux"))]
    let _ = window;
    let (selected, generation) = {
        let s = worker.0.lock().map_err(error)?;
        if s.phase != "transcribing" {
            return Ok(());
        }
        (model(&s.model)?, s.generation)
    };
    // A process boundary makes cancellation immediate, including a stuck GPU driver.
    begin_load(worker.0.clone(), root()?, selected, false, Some(generation))?;
    Ok(())
}
#[tauri::command]
pub fn download_dictation_model(
    worker: tauri::State<'_, Worker>,
    model_name: String,
) -> Result<Value> {
    let selected = model(&model_name)?;
    let root = root()?;
    let shared = worker.0.clone();
    let generation = {
        let mut s = shared.lock().map_err(error)?;
        if !s.enabled {
            return Err("Enable dictation before downloading a model.".into());
        }
        if !s.downloading.is_empty() {
            return Err("Wait for the current model download or cancel it first.".into());
        }
        s.download_generation += 1;
        s.downloading = selected.id.into();
        s.progress = 0;
        s.download_error.clear();
        s.download_generation
    };
    let task_shared = shared.clone();
    let task = tauri::async_runtime::spawn(async move {
        let shared = task_shared;
        let result = download(&root, selected, &shared, generation).await;
        if let Ok(mut s) = shared.lock() {
            if s.download_generation == generation {
                s.downloading.clear();
                match result {
                    Ok(()) => {
                        s.progress = 100;
                        s.invalid.retain(|n| n != selected.id);
                    }
                    Err(e) => s.download_error = e,
                }
            }
        }
    });
    let mut s = shared.lock().map_err(error)?;
    if s.enabled && s.download_generation == generation {
        s.download_task = Some(task);
    } else {
        task.abort();
    }
    drop(s);
    snapshot(&worker.0)
}
#[tauri::command]
pub fn cancel_dictation_download(worker: tauri::State<'_, Worker>) -> Result<Value> {
    let mut s = worker.0.lock().map_err(error)?;
    if let Some(task) = s.download_task.take() {
        task.abort();
    }
    s.download_generation += 1;
    s.downloading.clear();
    s.progress = 0;
    s.download_error.clear();
    drop(s);
    snapshot(&worker.0)
}
fn downloading(shared: &Arc<Mutex<State>>, generation: u64) -> Result<()> {
    let s = shared.lock().map_err(error)?;
    if s.enabled && s.download_generation == generation {
        Ok(())
    } else {
        Err("Model download cancelled.".into())
    }
}
fn digest(path: &Path) -> Result<String> {
    let mut f = fs::File::open(path).map_err(error)?;
    let mut hash = ring::digest::Context::new(&ring::digest::SHA256);
    let mut buffer = [0u8; 65536];
    loop {
        let n = f.read(&mut buffer).map_err(error)?;
        if n == 0 {
            break;
        }
        hash.update(&buffer[..n]);
    }
    Ok(hex(hash.finish().as_ref()))
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
struct Partial(PathBuf);
impl Drop for Partial {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}
async fn download(
    root: &Path,
    m: Model,
    shared: &Arc<Mutex<State>>,
    generation: u64,
) -> Result<()> {
    downloading(shared, generation)?;
    fs::create_dir_all(root).map_err(error)?;
    let target = root.join(m.file);
    if downloaded(root, m) && digest(&target)? == m.hash {
        return Ok(());
    }
    let temp = Partial(root.join(format!("{}.{}.partial", m.file, uuid::Uuid::new_v4())));
    let client = reqwest::Client::builder()
        .https_only(true)
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(1800))
        .build()
        .map_err(error)?;
    let mut response = client
        .get(format!(
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}",
            m.file
        ))
        .send()
        .await
        .map_err(|_| "The model download could not connect. Check your connection and retry.")?
        .error_for_status()
        .map_err(|_| "The model download is unavailable. Try again later.")?;
    let mut file = fs::File::create(&temp.0).map_err(error)?;
    let mut count = 0;
    loop {
        downloading(shared, generation)?;
        let Some(bytes) = response.chunk().await.map_err(error)? else {
            break;
        };
        count += bytes.len() as u64;
        if count > m.size {
            return Err("The model download exceeded its verified size.".into());
        }
        file.write_all(&bytes).map_err(error)?;
        let mut s = shared.lock().map_err(error)?;
        if s.download_generation == generation {
            s.progress = count * 100 / m.size;
        }
    }
    file.sync_all().map_err(error)?;
    drop(file);
    if count != m.size || digest(&temp.0)? != m.hash {
        return Err("The model download failed integrity verification. Retry using +.".into());
    }
    let s = shared.lock().map_err(error)?;
    if !s.enabled || s.download_generation != generation {
        return Err("Model download cancelled.".into());
    }
    if target.exists() {
        fs::remove_file(&target).map_err(error)?;
    }
    fs::rename(&temp.0, &target).map_err(error)?;
    Ok(())
}
fn install_runtime(root: &Path) -> Result<PathBuf> {
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    const ARCHIVE: &[u8] = include_bytes!("../dictation/runtime.zip");
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    const ARCHIVE: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/dictation/runtime.zip"));
    let hash = hex(ring::digest::digest(&ring::digest::SHA256, ARCHIVE).as_ref());
    let dest = root.join(format!("engine-{}", &hash[..12]));
    fs::create_dir_all(&dest).map_err(error)?;
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(ARCHIVE)).map_err(error)?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(error)?;
        let name = entry.name().to_owned();
        if ![
            "whisper-cpu.exe",
            "whisper-vulkan.exe",
            "whisper-cpu",
            "whisper-cpu-avx2",
            "whisper-metal",
            "WHISPER-LICENSE.txt",
            "GCC-RUNTIME-LICENSE.txt",
            "MINGW-RUNTIME-LICENSE.txt",
            "VULKAN-HEADERS-LICENSE.txt",
            "SPIRV-HEADERS-LICENSE.txt",
            "BUILD.json",
        ]
        .contains(&name.as_str())
            || entry.size() > 200_000_000
        {
            return Err("Invalid bundled dictation runtime.".into());
        }
        let mut data = Vec::new();
        entry.read_to_end(&mut data).map_err(error)?;
        let target = dest.join(name);
        let expected = hex(ring::digest::digest(&ring::digest::SHA256, &data).as_ref());
        if target.exists() && digest(&target)? == expected {
            continue;
        }
        let temp = Partial(target.with_extension(format!("{}.partial", uuid::Uuid::new_v4())));
        fs::write(&temp.0, data).map_err(error)?;
        if target.exists() {
            fs::remove_file(&target).map_err(error)?;
        }
        fs::rename(&temp.0, &target).map_err(error)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if target.file_name().is_some_and(|n| {
                n == "whisper-cpu" || n == "whisper-cpu-avx2" || n == "whisper-metal"
            }) {
                fs::set_permissions(&target, fs::Permissions::from_mode(0o700)).map_err(error)?;
            }
        }
    }
    Ok(dest)
}
fn validate_wav(bytes: &[u8]) -> Result<()> {
    if bytes.len() < 44
        || bytes.len() > 1_920_044
        || &bytes[..4] != b"RIFF"
        || &bytes[8..16] != b"WAVEfmt "
        || &bytes[36..40] != b"data"
    {
        return Err("Dictation requires up to 60 seconds of mono PCM WAV audio.".into());
    }
    let u32at = |i| u32::from_le_bytes(bytes[i..i + 4].try_into().unwrap());
    let u16at = |i| u16::from_le_bytes(bytes[i..i + 2].try_into().unwrap());
    if u32at(4) as usize != bytes.len() - 8
        || u32at(16) != 16
        || u16at(20) != 1
        || u16at(22) != 1
        || u32at(24) != 16000
        || u32at(28) != 32000
        || u16at(32) != 2
        || u16at(34) != 16
        || u32at(40) as usize != bytes.len() - 44
        || (bytes.len() - 44) % 2 != 0
    {
        return Err("Invalid dictation audio format.".into());
    }
    Ok(())
}

fn decode(shared: &Arc<Mutex<State>>, audio: &[u8], generation: u64) -> Result<String> {
    let mut channel = {
        let mut s = shared.lock().map_err(error)?;
        if !s.enabled || s.generation != generation || s.phase != "ready" {
            return Err("Wait for your dictation model to finish loading.".into());
        }
        s.phase = "transcribing".into();
        s.channel.take().ok_or("The speech worker is not ready.")?
    };
    let result = channel.transcribe(audio);
    let mut s = shared.lock().map_err(error)?;
    if !s.enabled || s.generation != generation {
        return Err("Dictation cancelled.".into());
    }
    if result.is_ok() {
        s.channel = Some(channel);
        s.phase = "ready".into();
    } else {
        s.process.take();
        s.phase = "error".into();
        s.error = result.as_ref().err().cloned().unwrap_or_default();
    }
    result
}
#[tauri::command]
pub async fn transcribe_dictation(
    worker: tauri::State<'_, Worker>,
    audio: String,
) -> Result<Value> {
    if audio.len() > 2_560_064 {
        return Err("Dictation is limited to 60 seconds.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(audio)
        .map_err(|_| "Invalid audio encoding.")?;
    validate_wav(&bytes)?;
    let shared = worker.0.clone();
    let root = root()?;
    tauri::async_runtime::spawn_blocking(move || {
        let (generation, selected, gpu) = {
            let s = shared.lock().map_err(error)?;
            if s.phase != "ready" {
                return Err("Wait for your dictation model to finish loading.".into());
            }
            (s.generation, model(&s.model)?, s.gpu)
        };
        let mut result = decode(&shared, &bytes, generation);
        // A failed GPU decode retries the same in-memory audio once on CPU. It cannot
        // run after cancellation or a model/profile change and never uploads anything.
        if result.is_err()
            && gpu
            && shared
                .lock()
                .is_ok_and(|s| s.enabled && s.generation == generation && s.phase == "error")
        {
            let next = begin_load(shared.clone(), root, selected, true, Some(generation))?;
            let start = Instant::now();
            loop {
                current(&shared, next)?;
                let s = shared.lock().map_err(error)?;
                if s.phase == "ready" {
                    break;
                }
                if s.phase == "error" {
                    return Err(s.error.clone());
                }
                drop(s);
                if start.elapsed() > Duration::from_secs(180) {
                    return Err("The CPU fallback took too long to load.".into());
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            result = decode(&shared, &bytes, next);
        }
        result.map(|text| json!({"text":text}))
    })
    .await
    .map_err(error)?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn models_are_pinned() {
        assert!(model("../../bad").is_err());
        assert_eq!(model("base").unwrap().size, 59707625);
        assert_eq!(model("large-v3").unwrap().size, 1081140203);
        assert_eq!(model("large-v3-turbo").unwrap().size, 574041195);
        for m in MODELS {
            assert_eq!(m.hash.len(), 64);
        }
    }
    #[test]
    fn rejects_arbitrary_audio() {
        assert!(validate_wav(b"RIFF").is_err());
        assert!(validate_wav(&vec![0; 1_920_045]).is_err());
    }
    #[test]
    fn disable_invalidates_download_and_inference() {
        let shared = Arc::new(Mutex::new(State {
            enabled: true,
            generation: 2,
            download_generation: 4,
            ..Default::default()
        }));
        stop(&shared, true);
        assert!(current(&shared, 2).is_err());
        assert!(downloading(&shared, 4).is_err());
        assert_eq!(shared.lock().unwrap().phase, "off");
    }
}

/// Hand recording and insertion to macOS Dictation in the focused text editor.
/// No synthetic shortcut, clipboard, or Kindred audio capture is involved.
#[tauri::command]
pub async fn start_native_dictation(app: tauri::AppHandle) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        let (send, receive) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            use objc2::{MainThreadMarker, sel};
            use objc2_app_kit::NSApplication;
            let result = MainThreadMarker::new()
                .ok_or_else(|| "Dictation requires the main thread.".to_string())
                .and_then(|mtm| {
                    let application = NSApplication::sharedApplication(mtm);
                    // AppKit's standard Start Dictation action routes to the
                    // current text input context, including WKWebView editors.
                    if unsafe { application.tryToPerform_with(sel!(startDictation:), None) } {
                        Ok(())
                    } else {
                        Err("Enable Dictation in macOS System Settings → Keyboard, then try again.".into())
                    }
                });
            let _ = send.send(result);
        }).map_err(error)?;
        tauri::async_runtime::spawn_blocking(move || receive.recv().map_err(error))
            .await.map_err(error)??
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("Native dictation is available only in the macOS app.".into())
    }
}
