use arboard::Clipboard;
use rfd::{MessageButtons, MessageDialog, MessageLevel};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::Read,
    net::{TcpListener, UdpSocket},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use uuid::Uuid;

fn boxed_error(message: impl Into<String>) -> Box<dyn std::error::Error> {
    Box::new(std::io::Error::other(message.into()))
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct AppConfig {
    #[serde(default = "default_host")]
    host: String,
    #[serde(default = "default_port")]
    port: u16,
    #[serde(default = "default_true")]
    lan_enabled: bool,
    #[serde(default = "default_cache")]
    cache_max_bytes: u64,
}

fn default_host() -> String {
    "0.0.0.0".to_string()
}
fn default_port() -> u16 {
    3000
}
fn default_true() -> bool {
    true
}
fn default_cache() -> u64 {
    10 * 1024 * 1024 * 1024
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            host: default_host(),
            port: default_port(),
            lan_enabled: true,
            cache_max_bytes: default_cache(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
struct WindowPlacement {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

struct DesktopState {
    backend: Mutex<Option<Child>>,
    quitting: AtomicBool,
    data_root: PathBuf,
    desktop_token: String,
    port: u16,
}

fn discover_portable_root() -> Result<PathBuf, String> {
    if let Ok(root) = std::env::var("CANVAS_DEV_ROOT") {
        return Ok(PathBuf::from(root)
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(".")));
    }
    if let Ok(cwd) = std::env::current_dir() {
        if cwd.join("backend_entry.py").is_file() {
            return Ok(cwd);
        }
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "无法定位 Canvas.exe 所在目录".to_string())
}

fn read_config(data_root: &Path) -> Result<AppConfig, String> {
    let config_dir = data_root.join("config");
    fs::create_dir_all(&config_dir).map_err(|e| format!("无法创建 data/config：{e}"))?;
    let path = config_dir.join("app.json");
    if !path.exists() {
        let value =
            serde_json::to_string_pretty(&AppConfig::default()).map_err(|e| e.to_string())? + "\n";
        fs::write(&path, value).map_err(|e| format!("无法创建 app.json：{e}"))?;
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("无法读取 app.json：{e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("app.json 格式错误：{e}"))
}

fn port_owner(port: u16) -> String {
    let Some(text) = command_stdout("netstat", &["-ano", "-p", "tcp"], Duration::from_secs(2))
    else {
        return "未知进程".to_string();
    };
    let needle = format!(":{port}");
    for line in text
        .lines()
        .filter(|line| line.contains(&needle) && line.contains("LISTENING"))
    {
        if let Some(pid) = line.split_whitespace().last() {
            let filter = format!("PID eq {pid}");
            let name = command_stdout(
                "tasklist",
                &["/FI", &filter, "/FO", "CSV", "/NH"],
                Duration::from_secs(2),
            )
            .unwrap_or_default()
            .trim()
            .to_string();
            return format!("PID {pid} {name}");
        }
    }
    "未知进程".to_string()
}

fn command_stdout(program: &str, args: &[&str], timeout: Duration) -> Option<String> {
    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let deadline = Instant::now() + timeout;
    loop {
        if child.try_wait().ok().flatten().is_some() {
            let mut bytes = Vec::new();
            child.stdout.take()?.read_to_end(&mut bytes).ok()?;
            return Some(String::from_utf8_lossy(&bytes).into_owned());
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }
        thread::sleep(Duration::from_millis(25));
    }
}

fn rotate_log(path: &Path, max_bytes: u64, backups: u8) {
    if path
        .metadata()
        .map(|metadata| metadata.len() <= max_bytes)
        .unwrap_or(true)
    {
        return;
    }
    let oldest = path.with_extension(format!("log.{backups}"));
    let _ = fs::remove_file(oldest);
    for number in (1..backups).rev() {
        let source = path.with_extension(format!("log.{number}"));
        let target = path.with_extension(format!("log.{}", number + 1));
        if source.exists() {
            let _ = fs::rename(source, target);
        }
    }
    let _ = fs::rename(path, path.with_extension("log.1"));
}

fn ensure_port_available(port: u16, config_path: &Path) -> Result<(), String> {
    match TcpListener::bind(("0.0.0.0", port)) {
        Ok(listener) => {
            drop(listener);
            Ok(())
        }
        Err(_) => {
            let message = format!(
                "端口 {port} 已被占用（{}）。\n\n请在以下文件修改端口后重新启动：\n{}",
                port_owner(port),
                config_path.display()
            );
            MessageDialog::new()
                .set_level(MessageLevel::Error)
                .set_title("Canvas 无法启动")
                .set_description(&message)
                .set_buttons(MessageButtons::Ok)
                .show();
            let _ = Command::new("notepad.exe").arg(config_path).spawn();
            Err(message)
        }
    }
}

fn spawn_backend(
    root: &Path,
    data_root: &Path,
    config: &AppConfig,
    token: &str,
) -> Result<Child, String> {
    let app_root = root.join("app");
    let packaged = app_root
        .join("backend")
        .join("canvas-backend")
        .join("canvas-backend.exe");
    let parent_pid = std::process::id().to_string();
    let common = [
        "--data-dir".to_string(),
        data_root.display().to_string(),
        "--app-root".to_string(),
        app_root.display().to_string(),
        "--portable-root".to_string(),
        root.display().to_string(),
        "--host".to_string(),
        if config.lan_enabled {
            config.host.clone()
        } else {
            "127.0.0.1".to_string()
        },
        "--port".to_string(),
        config.port.to_string(),
        "--desktop-token".to_string(),
        token.to_string(),
        "--parent-pid".to_string(),
        parent_pid,
        "--runtime-mode".to_string(),
        "desktop".to_string(),
    ];
    let logs = data_root.join("logs");
    fs::create_dir_all(&logs).map_err(|e| e.to_string())?;
    let stdout_path = logs.join("backend.stdout.log");
    let stderr_path = logs.join("backend.stderr.log");
    rotate_log(&stdout_path, 10 * 1024 * 1024, 5);
    rotate_log(&stderr_path, 10 * 1024 * 1024, 5);
    let stdout = OpenOptions::new()
        .create(true)
        .append(true)
        .open(stdout_path)
        .map_err(|e| e.to_string())?;
    let stderr = OpenOptions::new()
        .create(true)
        .append(true)
        .open(stderr_path)
        .map_err(|e| e.to_string())?;
    let mut command;
    if packaged.is_file() {
        command = Command::new(packaged);
        command.args(&common);
    } else {
        let python = root.join("python").join("python.exe");
        let entry = root.join("backend_entry.py");
        if !python.is_file() || !entry.is_file() {
            return Err("未找到 app/backend Sidecar，也未找到源码开发运行时".to_string());
        }
        command = Command::new(python);
        command
            .arg(entry)
            .args(&common)
            .env("PYTHONPATH", root)
            .current_dir(root);
    }
    command
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .stdin(Stdio::null())
        .spawn()
        .map_err(|e| format!("启动后端失败：{e}"))
}

fn wait_for_health(port: u16, child: &mut Child) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(30);
    let url = format!("http://127.0.0.1:{port}/api/health");
    while Instant::now() < deadline {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            return Err(format!("后端提前退出：{status}"));
        }
        if ureq::get(&url)
            .config()
            .timeout_global(Some(Duration::from_millis(500)))
            .build()
            .call()
            .map(|r| r.status().as_u16() == 200)
            .unwrap_or(false)
        {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err("后端未在 30 秒内完成启动，请检查 data/logs/backend.stderr.log".to_string())
}

fn local_ip() -> String {
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|socket| {
            socket.connect("8.8.8.8:80")?;
            socket.local_addr().map(|addr| addr.ip().to_string())
        })
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn save_window_placement(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Ok(position) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let placement = WindowPlacement {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        maximized: window.is_maximized().unwrap_or(false),
    };
    let state = app.state::<DesktopState>();
    let path = state.data_root.join("config").join("window.json");
    if let Ok(raw) = serde_json::to_string_pretty(&placement) {
        let _ = fs::write(path, raw + "\n");
    }
}

fn stop_backend(app: &AppHandle) {
    let state = app.state::<DesktopState>();
    if state.quitting.swap(true, Ordering::SeqCst) {
        return;
    }
    save_window_placement(app);
    let url = format!("http://127.0.0.1:{}/api/runtime/shutdown", state.port);
    let _ = ureq::post(&url)
        .header("X-Desktop-Token", &state.desktop_token)
        .config()
        .timeout_global(Some(Duration::from_secs(2)))
        .build()
        .send_empty();
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        let exited = state
            .backend
            .lock()
            .ok()
            .and_then(|mut guard| {
                guard
                    .as_mut()
                    .and_then(|child| child.try_wait().ok().flatten())
            })
            .is_some();
        if exited {
            return;
        }
        thread::sleep(Duration::from_millis(100));
    }
    if let Ok(mut guard) = state.backend.lock() {
        if let Some(child) = guard.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    };
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "打开软件", true, None::<&str>)?;
    let browser_item = MenuItem::with_id(app, "browser", "浏览器打开", true, None::<&str>)?;
    let copy_item = MenuItem::with_id(app, "copy", "复制局域网地址", true, None::<&str>)?;
    let devices_item = MenuItem::with_id(app, "devices", "配对设备", true, None::<&str>)?;
    let data_item = MenuItem::with_id(app, "data", "打开 data 目录", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open_item,
            &browser_item,
            &copy_item,
            &devices_item,
            &data_item,
            &quit_item,
        ],
    )?;
    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Canvas");
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.on_menu_event(|app, event| match event.id.as_ref() {
        "open" => show_main(app),
        "browser" => {
            let state = app.state::<DesktopState>();
            let _ = open::that(format!("http://127.0.0.1:{}", state.port));
        }
        "copy" => {
            let state = app.state::<DesktopState>();
            let address = format!("http://{}:{}", local_ip(), state.port);
            let _ = Clipboard::new().and_then(|mut value| value.set_text(address));
        }
        "devices" => {
            show_main(app);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval("location.href='/devices'");
            }
        }
        "data" => {
            let state = app.state::<DesktopState>();
            let _ = open::that(&state.data_root);
        }
        "quit" => {
            stop_backend(app);
            app.exit(0);
        }
        _ => {}
    })
    .on_tray_icon_event(|tray, event| {
        if matches!(
            event,
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }
        ) {
            show_main(tray.app_handle());
        }
    })
    .build(app)?;
    Ok(())
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .setup(|app| {
            let root = discover_portable_root().map_err(boxed_error)?;
            let data_root = root.join("data");
            let config = read_config(&data_root).map_err(boxed_error)?;
            ensure_port_available(config.port, &data_root.join("config").join("app.json")).map_err(boxed_error)?;
            let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
            let mut child = spawn_backend(&root, &data_root, &config, &token).map_err(boxed_error)?;
            if let Err(error) = wait_for_health(config.port, &mut child) {
                let _ = child.kill();
                MessageDialog::new().set_level(MessageLevel::Error).set_title("Canvas 后端启动失败").set_description(&error).show();
                return Err(boxed_error(error));
            }
            app.manage(DesktopState { backend: Mutex::new(Some(child)), quitting: AtomicBool::new(false), data_root: data_root.clone(), desktop_token: token.clone(), port: config.port });
            let url: tauri::Url = format!("http://127.0.0.1:{}/api/auth/bootstrap?token={token}", config.port).parse().map_err(|e| boxed_error(format!("URL 错误：{e}")))?;
            let placement_path = data_root.join("config").join("window.json");
            let placement = fs::read_to_string(placement_path).ok().and_then(|raw| serde_json::from_str::<WindowPlacement>(&raw).ok()).unwrap_or_default();
            let mut window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url)).title("Canvas").min_inner_size(960.0, 640.0).inner_size(1440.0, 900.0).data_directory(data_root.join("cache").join("webview2"));
            if placement.width >= 960 && placement.height >= 640 { window = window.inner_size(placement.width as f64, placement.height as f64).position(placement.x as f64, placement.y as f64); }
            match window.build() {
                Ok(view) => { if placement.maximized { let _ = view.maximize(); } }
                Err(error) => {
                    stop_backend(app.handle());
                    MessageDialog::new().set_level(MessageLevel::Error).set_title("缺少 Microsoft Edge WebView2").set_description(format!("Canvas 无法创建窗口：{error}\n\n请安装 Microsoft Edge WebView2 Evergreen Runtime 后重试。\nhttps://developer.microsoft.com/microsoft-edge/webview2/")).show();
                    return Err(boxed_error(error.to_string()));
                }
            }
            setup_tray(app)?;
            let monitor = app.handle().clone();
            thread::spawn(move || loop {
                thread::sleep(Duration::from_millis(500));
                let state = monitor.state::<DesktopState>();
                if state.quitting.load(Ordering::SeqCst) { break; }
                let exited = state.backend.lock().ok().and_then(|mut guard| guard.as_mut().and_then(|child| child.try_wait().ok().flatten()));
                if let Some(status) = exited {
                    MessageDialog::new().set_level(MessageLevel::Error).set_title("Canvas 后端已停止").set_description(format!("Sidecar 异常退出：{status}\n请查看 data/logs/backend.stderr.log 后重新启动。")).show();
                    monitor.exit(1); break;
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.app_handle().state::<DesktopState>();
                if !state.quitting.load(Ordering::SeqCst) { api.prevent_close(); save_window_placement(window.app_handle()); let _ = window.hide(); }
            }
        });
    builder
        .run(tauri::generate_context!())
        .expect("Canvas desktop runtime failed");
}
