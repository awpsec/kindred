//! A command's actual webview and its containing window. Unlike WebviewWindow,
//! this remains valid while a trusted settings child shares the main OS window.
use tauri::{Manager, Webview, Window};

#[derive(Clone)]
pub struct Surface {
    view: Webview,
    window: Window,
}
impl Surface {
    fn from_view(view: Webview) -> Self {
        Self {
            window: view.window(),
            view,
        }
    }
    pub fn main(app: &tauri::AppHandle) -> Option<Self> {
        app.get_webview("main").map(Self::from_view)
    }
    pub fn label(&self) -> &str {
        self.view.label()
    }
    pub fn url(&self) -> tauri::Result<tauri::Url> {
        self.view.url()
    }
}
impl std::ops::Deref for Surface {
    type Target = Window;
    fn deref(&self) -> &Self::Target {
        &self.window
    }
}
impl<'de> tauri::ipc::CommandArg<'de, tauri::Wry> for Surface {
    fn from_command(
        command: tauri::ipc::CommandItem<'de, tauri::Wry>,
    ) -> Result<Self, tauri::ipc::InvokeError> {
        Ok(Self::from_view(Webview::from_command(command)?))
    }
}
