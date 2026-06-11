use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use base64::{engine::general_purpose, Engine as _};
use reqwest::blocking;
use reqwest::blocking::multipart;
use tauri::Emitter;

use crate::models::*;
use crate::utils::*;

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<FileNode>, String> {
    let mut nodes = Vec::new();
    let dir_path = Path::new(&path);

    if !dir_path.exists() || !dir_path.is_dir() {
        return Err(format!("Path {} is not a valid directory", path));
    }

    match fs::read_dir(dir_path) {
        Ok(entries) => {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path_buf = entry.path();
                    let name = entry
                        .file_name()
                        .into_string()
                        .unwrap_or_else(|_| String::from("unknown"));
                    if name.starts_with('.') {
                        continue;
                    }
                    let is_dir = path_buf.is_dir();
                    if !is_dir && !is_supported_content_file(&path_buf) {
                        continue;
                    }

                    nodes.push(FileNode {
                        name,
                        path: path_buf.to_string_lossy().into_owned(),
                        is_dir,
                        children: if is_dir { Some(vec![]) } else { None },
                    });
                }
            }
            nodes.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
            Ok(nodes)
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_image_data_url(path: String) -> Result<String, String> {
    let path = Path::new(&path);
    if !is_supported_content_file(path)
        || path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("md"))
            .unwrap_or(false)
    {
        return Err("仅支持图片文件预览".to_string());
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let mime = match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("svg") => "image/svg+xml",
        _ => return Err("不支持的图片格式".to_string()),
    };
    Ok(format!(
        "data:{};base64,{}",
        mime,
        general_purpose::STANDARD.encode(bytes)
    ))
}

#[tauri::command]
pub fn write_file(app: tauri::AppHandle, path: String, content: String) -> Result<u64, String> {
    fs::write(&path, content).map_err(|e| e.to_string())?;
    let _ = app.emit("workspace-changed", ());
    file_modified_at(path)
}

#[tauri::command]
pub fn write_image_asset(app: tauri::AppHandle, path: String, source: String) -> Result<u64, String> {
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let bytes = if let Some((_, data)) = source.split_once(",") {
        if source.starts_with("data:image/") {
            general_purpose::STANDARD
                .decode(data)
                .map_err(|e| format!("图片数据解码失败: {}", e))?
        } else {
            return Err("仅支持图片 data URL 或图片链接".to_string());
        }
    } else if source.starts_with("http://") || source.starts_with("https://") {
        let response = blocking::get(&source).map_err(|e| format!("下载图片失败: {}", e))?;
        if !response.status().is_success() {
            return Err(format!("下载图片失败: HTTP {}", response.status()));
        }
        response.bytes().map_err(|e| format!("读取图片失败: {}", e))?.to_vec()
    } else {
        return Err("仅支持图片 data URL 或图片链接".to_string());
    };

    fs::write(target, bytes).map_err(|e| e.to_string())?;
    let _ = app.emit("workspace-changed", ());
    file_modified_at(path)
}

#[tauri::command]
pub fn write_media_asset(app: tauri::AppHandle, path: String, source: String) -> Result<u64, String> {
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let bytes = if let Some((meta, data)) = source.split_once(",") {
        if meta.starts_with("data:video/") || meta.starts_with("data:image/") {
            general_purpose::STANDARD
                .decode(data)
                .map_err(|e| format!("媒体数据解码失败: {}", e))?
        } else {
            return Err("仅支持图片/视频 data URL 或媒体链接".to_string());
        }
    } else if source.starts_with("http://") || source.starts_with("https://") {
        let response = blocking::get(&source).map_err(|e| format!("下载媒体失败: {}", e))?;
        if !response.status().is_success() {
            return Err(format!("下载媒体失败: HTTP {}", response.status()));
        }
        response.bytes().map_err(|e| format!("读取媒体失败: {}", e))?.to_vec()
    } else {
        return Err("仅支持图片/视频 data URL 或媒体链接".to_string());
    };

    fs::write(target, bytes).map_err(|e| e.to_string())?;
    let _ = app.emit("workspace-changed", ());
    file_modified_at(path)
}

#[tauri::command]
pub fn upload_temp_image(source: String) -> Result<String, String> {
    let (bytes, filename, mime) = if let Some((meta, data)) = source.split_once(",") {
        if !meta.starts_with("data:image/") {
            return Err("仅支持图片上传到临时图床".to_string());
        }
        let mime = meta
            .trim_start_matches("data:")
            .trim_end_matches(";base64")
            .to_string();
        let extension = mime.split('/').nth(1).unwrap_or("png");
        let bytes = general_purpose::STANDARD
            .decode(data)
            .map_err(|e| format!("图片数据解码失败: {}", e))?;
        (bytes, format!("upload.{}", extension), mime)
    } else if source.starts_with("http://") || source.starts_with("https://") {
        let response = blocking::get(&source).map_err(|e| format!("下载图片失败: {}", e))?;
        if !response.status().is_success() {
            return Err(format!("下载图片失败: HTTP {}", response.status()));
        }
        let mime = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("image/png")
            .to_string();
        if !mime.starts_with("image/") {
            return Err("远程资源不是图片，无法上传到临时图床".to_string());
        }
        let extension = mime.split('/').nth(1).unwrap_or("png");
        let bytes = response.bytes().map_err(|e| format!("读取图片失败: {}", e))?.to_vec();
        (bytes, format!("upload.{}", extension), mime)
    } else {
        return Err("仅支持 data URL 或 http(s) 图片链接上传".to_string());
    };

    let client = blocking::Client::new();
    let part = multipart::Part::bytes(bytes)
        .file_name(filename)
        .mime_str(&mime)
        .map_err(|e| format!("构造上传文件失败: {}", e))?;
    let form = multipart::Form::new()
        .text("reqtype", "fileupload")
        .text("time", "72h")
        .part("fileToUpload", part);

    let response = client
        .post("https://litterbox.catbox.moe/resources/internals/api.php")
        .multipart(form)
        .send()
        .map_err(|e| format!("上传到临时图床失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("上传到临时图床失败: HTTP {}", response.status()));
    }

    let url = response.text().map_err(|e| format!("读取图床返回失败: {}", e))?;
    let trimmed = url.trim().to_string();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        Ok(trimmed)
    } else {
        Err(format!("图床返回异常: {}", trimmed))
    }
}

#[tauri::command]
pub fn create_file(app: tauri::AppHandle, path: String) -> Result<u64, String> {
    let path = Path::new(&path);
    if path.exists() {
        return Err("文件已存在".to_string());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, "").map_err(|e| e.to_string())?;
    let _ = app.emit("workspace-changed", ());
    file_modified_at(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn create_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let path = Path::new(&path);
    if path.exists() {
        return Err("文件夹已存在".to_string());
    }
    fs::create_dir_all(path).map_err(|e| e.to_string())?;
    let _ = app.emit("workspace-changed", ());
    Ok(())
}

#[tauri::command]
pub fn rename_path(
    app: tauri::AppHandle,
    path: String,
    new_name: String,
) -> Result<String, String> {
    let source = Path::new(&path);
    if !source.exists() {
        return Err("文件或文件夹不存在".to_string());
    }
    if new_name.trim().is_empty() || new_name.contains('/') || new_name.contains('\\') {
        return Err("名称不合法".to_string());
    }
    let parent = source.parent().ok_or("无法获取上级目录")?;
    let target = parent.join(new_name.trim());
    if target.exists() {
        return Err("同名文件或文件夹已存在".to_string());
    }
    fs::rename(source, &target).map_err(|e| e.to_string())?;
    let _ = app.emit("workspace-changed", ());
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn delete_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Ok(());
    }
    if target.is_dir() {
        fs::remove_dir_all(target).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(target).map_err(|e| e.to_string())?;
    }
    let _ = app.emit("workspace-changed", ());
    Ok(())
}

#[tauri::command]
pub fn file_modified_at(path: String) -> Result<u64, String> {
    let modified = fs::metadata(path)
        .map_err(|e| e.to_string())?
        .modified()
        .map_err(|e| e.to_string())?;

    let millis = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    u64::try_from(millis).map_err(|_| String::from("File modified timestamp is too large"))
}
