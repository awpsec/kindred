//! Private, resident process protocol. The child has no network or file API;
//! recordings are framed on stdin and bounded JSON replies arrive on stdout.
use serde_json::Value;
use std::{
    io::{BufRead, BufReader, Write},
    path::Path,
    process::{Child, ChildStdin, Command, Stdio},
    sync::mpsc::{self, Receiver},
    time::Duration,
};
type Result<T> = std::result::Result<T, String>;
pub const SUPPORTED: bool = cfg!(any(
    all(any(windows, target_os = "linux"), target_arch = "x86_64"),
    target_os = "macos"
));

fn binary_name(gpu: bool) -> &'static str {
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        // Keep a baseline worker for older x86_64 CPUs. Never execute AVX2
        // instructions until both the CPU and OS report every required feature.
        let _ = gpu;
        if std::is_x86_feature_detected!("avx2")
            && std::is_x86_feature_detected!("fma")
            && std::is_x86_feature_detected!("f16c")
            && std::is_x86_feature_detected!("sse4.2")
            && std::is_x86_feature_detected!("bmi2")
        {
            return "whisper-cpu-avx2";
        }
        return "whisper-cpu";
    }
    #[cfg(not(all(target_os = "linux", target_arch = "x86_64")))]
    if cfg!(target_os = "macos") {
        if gpu { "whisper-metal" } else { "whisper-cpu" }
    } else if gpu {
        "whisper-vulkan.exe"
    } else {
        "whisper-cpu.exe"
    }
}
pub struct Process {
    child: Child,
    #[cfg(windows)]
    _job: crate::local_files::Job,
}
impl Process {
    pub fn alive(&mut self) -> bool {
        self.child.try_wait().is_ok_and(|v| v.is_none())
    }
    pub fn id(&self) -> u32 {
        self.child.id()
    }
}
impl Drop for Process {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
pub struct Channel {
    input: ChildStdin,
    replies: Receiver<Result<Value>>,
    inference_timeout: Duration,
}
impl Channel {
    pub fn set_accelerated(&mut self, accelerated: bool) {
        self.inference_timeout = Duration::from_secs(if accelerated { 180 } else { 900 });
    }
    pub fn receive(&self) -> Result<Value> {
        self.receive_timeout(Duration::from_secs(180))
    }
    fn receive_timeout(&self, timeout: Duration) -> Result<Value> {
        let value = self
            .replies
            .recv_timeout(timeout)
            .map_err(|_| "The local speech worker stopped responding.".to_owned())??;
        if value["type"] == "error" {
            return Err(value["error"]
                .as_str()
                .unwrap_or("Local transcription failed.")
                .to_owned());
        }
        Ok(value)
    }
    pub fn transcribe(&mut self, audio: &[u8]) -> Result<String> {
        self.input
            .write_all(&(audio.len() as u32).to_le_bytes())
            .and_then(|_| self.input.write_all(audio))
            .and_then(|_| self.input.flush())
            .map_err(|_| "The local speech worker stopped.".to_owned())?;
        // Large CPU models can outlast the startup/GPU deadline, especially
        // during live recording on a busy machine. Killing the worker still
        // closes this channel immediately when the user cancels.
        let reply = self.receive_timeout(self.inference_timeout)?;
        if reply["type"] != "transcript" {
            return Err("The speech worker returned an unexpected response.".into());
        }
        reply["text"]
            .as_str()
            .filter(|s| s.len() <= 64000)
            .map(|s| s.trim().to_owned())
            .ok_or_else(|| "The transcript exceeded the message limit.".into())
    }
}
pub fn launch(root: &Path, model: &Path, gpu: bool) -> Result<(Process, Channel)> {
    let binary = binary_name(gpu);
    let mut command = Command::new(root.join(binary));
    command
        .arg(model)
        .current_dir(root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|_| "The local speech worker could not start.".to_owned())?;
    #[cfg(windows)]
    let job = match crate::local_files::Job::attach(&child) {
        Ok(job) => job,
        Err(e) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(e);
        }
    };
    let input = child
        .stdin
        .take()
        .ok_or("Speech worker input is unavailable.")?;
    let output = child
        .stdout
        .take()
        .ok_or("Speech worker output is unavailable.")?;
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(output);
        loop {
            let mut line = Vec::new();
            // read_until alone could allocate an unbounded line from a broken worker.
            loop {
                let buffer = match reader.fill_buf() {
                    Ok(b) => b,
                    Err(_) => {
                        let _ = tx.send(Err("Speech worker output failed.".into()));
                        return;
                    }
                };
                if buffer.is_empty() {
                    return;
                }
                let count = buffer
                    .iter()
                    .position(|b| *b == b'\n')
                    .map_or(buffer.len(), |i| i + 1);
                if line.len() + count > 128000 {
                    let _ = tx.send(Err("Speech worker response is too large.".into()));
                    return;
                }
                let done = buffer[count - 1] == b'\n';
                line.extend_from_slice(&buffer[..count]);
                reader.consume(count);
                if done {
                    break;
                }
            }
            let parsed = serde_json::from_slice(&line)
                .map_err(|_| "Invalid speech worker response.".to_owned());
            if tx.send(parsed).is_err() {
                return;
            }
        }
    });
    Ok((
        Process {
            child,
            #[cfg(windows)]
            _job: job,
        },
        Channel {
            input,
            replies: rx,
            inference_timeout: Duration::from_secs(if gpu { 180 } else { 900 }),
        },
    ))
}
pub fn gpu_runtime_available() -> bool {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::{
            Foundation::FreeLibrary,
            System::LibraryLoader::{LOAD_LIBRARY_SEARCH_SYSTEM32, LoadLibraryExW},
        };
        let name: Vec<u16> = "vulkan-1.dll\0".encode_utf16().collect();
        let library = LoadLibraryExW(
            name.as_ptr(),
            std::ptr::null_mut(),
            LOAD_LIBRARY_SEARCH_SYSTEM32,
        );
        if library.is_null() {
            return false;
        }
        FreeLibrary(library);
        true
    }
    #[cfg(target_os = "macos")]
    {
        true
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        false
    }
}
