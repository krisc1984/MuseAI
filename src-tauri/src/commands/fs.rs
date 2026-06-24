use std::fs;
use std::path::Path;
use std::time::Duration;
use std::time::Instant;
use std::time::UNIX_EPOCH;
use std::error::Error as StdError;

use base64::{engine::general_purpose, Engine as _};
use reqwest::blocking;
use reqwest::blocking::multipart;
use serde_json::{json, Value};
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
    append_backend_log(
        &app,
        "media.write.start",
        json!({
            "path": path,
            "source": summarize_media_source(&source),
        }),
    );
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        if let Err(error) = fs::create_dir_all(parent) {
            let message = error.to_string();
            append_backend_log(&app, "media.write.error", json!({ "path": path, "error": message }));
            return Err(message);
        }
    }

    let bytes = if let Some((meta, data)) = source.split_once(",") {
        if meta.starts_with("data:video/") || meta.starts_with("data:image/") {
            match general_purpose::STANDARD.decode(data) {
                Ok(bytes) => bytes,
                Err(error) => {
                    let message = format!("媒体数据解码失败: {}", error);
                    append_backend_log(&app, "media.write.error", json!({ "path": path, "error": message }));
                    return Err(message);
                }
            }
        } else {
            let message = "仅支持图片/视频 data URL 或媒体链接".to_string();
            append_backend_log(&app, "media.write.error", json!({ "path": path, "error": message }));
            return Err(message);
        }
    } else if source.starts_with("http://") || source.starts_with("https://") {
        let started = Instant::now();
        let response = match blocking::get(&source) {
            Ok(response) => response,
            Err(error) => {
                let message = format!("下载媒体失败: {}", error);
                append_backend_log(
                    &app,
                    "media.download.error",
                    json!({ "path": path, "source": summarize_media_source(&source), "elapsedMs": started.elapsed().as_millis(), "error": message }),
                );
                return Err(message);
            }
        };
        if !response.status().is_success() {
            let message = format!("下载媒体失败: HTTP {}", response.status());
            append_backend_log(
                &app,
                "media.download.error",
                json!({ "path": path, "source": summarize_media_source(&source), "elapsedMs": started.elapsed().as_millis(), "error": message }),
            );
            return Err(message);
        }
        match response.bytes() {
            Ok(bytes) => bytes.to_vec(),
            Err(error) => {
                let message = format!("读取媒体失败: {}", error);
                append_backend_log(&app, "media.download.error", json!({ "path": path, "elapsedMs": started.elapsed().as_millis(), "error": message }));
                return Err(message);
            }
        }
    } else {
        let message = "仅支持图片/视频 data URL 或媒体链接".to_string();
        append_backend_log(&app, "media.write.error", json!({ "path": path, "error": message }));
        return Err(message);
    };

    let byte_count = bytes.len();
    if let Err(error) = fs::write(target, bytes) {
        let message = error.to_string();
        append_backend_log(&app, "media.write.error", json!({ "path": path, "error": message }));
        return Err(message);
    }
    let _ = app.emit("workspace-changed", ());
    let result = file_modified_at(path.clone());
    append_backend_log(
        &app,
        "media.write.success",
        json!({ "path": path, "bytes": byte_count, "modifiedAt": result.as_ref().ok() }),
    );
    result
}

#[tauri::command]
pub fn upload_temp_image(app: tauri::AppHandle, source: String) -> Result<String, String> {
    append_backend_log(
        &app,
        "temp_image.upload.start",
        json!({ "source": summarize_media_source(&source) }),
    );
    let (bytes, filename, mime) = if let Some((meta, data)) = source.split_once(",") {
        if !meta.starts_with("data:image/") {
            let message = "仅支持图片上传到临时图床".to_string();
            append_backend_log(&app, "temp_image.upload.error", json!({ "error": message }));
            return Err(message);
        }
        let mime = meta
            .trim_start_matches("data:")
            .trim_end_matches(";base64")
            .to_string();
        let extension = mime.split('/').nth(1).unwrap_or("png");
        let bytes = match general_purpose::STANDARD.decode(data) {
            Ok(bytes) => bytes,
            Err(error) => {
                let message = format!("图片数据解码失败: {}", error);
                append_backend_log(&app, "temp_image.upload.error", json!({ "error": message }));
                return Err(message);
            }
        };
        (bytes, format!("upload.{}", extension), mime)
    } else if source.starts_with("http://") || source.starts_with("https://") {
        let response = match blocking::get(&source) {
            Ok(response) => response,
            Err(error) => {
                let message = format!("下载图片失败: {}", error);
                append_backend_log(&app, "temp_image.download.error", json!({ "source": summarize_media_source(&source), "error": message }));
                return Err(message);
            }
        };
        if !response.status().is_success() {
            let message = format!("下载图片失败: HTTP {}", response.status());
            append_backend_log(&app, "temp_image.download.error", json!({ "source": summarize_media_source(&source), "error": message }));
            return Err(message);
        }
        let mime = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("image/png")
            .to_string();
        if !mime.starts_with("image/") {
            let message = "远程资源不是图片，无法上传到临时图床".to_string();
            append_backend_log(&app, "temp_image.download.error", json!({ "source": summarize_media_source(&source), "mime": mime, "error": message }));
            return Err(message);
        }
        let extension = mime.split('/').nth(1).unwrap_or("png");
        let bytes = match response.bytes() {
            Ok(bytes) => bytes.to_vec(),
            Err(error) => {
                let message = format!("读取图片失败: {}", error);
                append_backend_log(&app, "temp_image.download.error", json!({ "source": summarize_media_source(&source), "error": message }));
                return Err(message);
            }
        };
        (bytes, format!("upload.{}", extension), mime)
    } else {
        let message = "仅支持 data URL 或 http(s) 图片链接上传".to_string();
        append_backend_log(&app, "temp_image.upload.error", json!({ "error": message }));
        return Err(message);
    };

    let byte_count = bytes.len();
    let result = upload_image_with_fallbacks(&app, bytes, filename.clone(), mime.clone());
    match &result {
        Ok(url) => append_backend_log(
            &app,
            "temp_image.upload.success",
            json!({ "filename": filename, "mime": mime, "bytes": byte_count, "url": url }),
        ),
        Err(error) => append_backend_log(
            &app,
            "temp_image.upload.error",
            json!({ "filename": filename, "mime": mime, "bytes": byte_count, "error": error }),
        ),
    }
    result
}

#[tauri::command]
pub fn agnes_video_create(app: tauri::AppHandle, url: String, api_key: String, body: Value) -> Result<Value, String> {
    append_backend_log(
        &app,
        "agnes.video.create.start",
        json!({
            "url": url,
            "hasApiKey": !api_key.trim().is_empty(),
            "body": summarize_agnes_video_body(&body),
        }),
    );
    let started = Instant::now();
    let client = blocking::Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .timeout(Duration::from_secs(180))
        .user_agent("MuseAI/0.6 agnes-video-client")
        .build()
        .map_err(|e| {
            let message = format!("初始化 Agnes 视频客户端失败: {}", e);
            append_backend_log(&app, "agnes.video.create.error", json!({ "error": message }));
            message
        })?;

    let response = match client
        .post(url)
        .bearer_auth(api_key.trim())
        .json(&body)
        .send()
    {
        Ok(response) => response,
        Err(error) => {
            let details = format_reqwest_error_details(&error);
            let message = format!("Agnes 视频任务创建请求失败: {}", details);
            append_backend_log(
                &app,
                "agnes.video.create.error",
                json!({
                    "elapsedMs": started.elapsed().as_millis(),
                    "error": message,
                    "isTimeout": error.is_timeout(),
                    "isConnect": error.is_connect(),
                    "sourceChain": reqwest_source_chain(&error),
                }),
            );
            return Err(message);
        }
    };

    let status = response.status();
    let text = match response.text() {
        Ok(text) => text,
        Err(error) => {
            let message = format!("读取 Agnes 视频创建响应失败: {}", error);
            append_backend_log(
                &app,
                "agnes.video.create.error",
                json!({ "status": status.as_u16(), "elapsedMs": started.elapsed().as_millis(), "error": message }),
            );
            return Err(message);
        }
    };

    if !status.is_success() {
        let message = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|payload| {
                payload
                    .get("error")
                    .and_then(|error| error.get("message"))
                    .and_then(|value| value.as_str())
                    .or_else(|| payload.get("message").and_then(|value| value.as_str()))
                    .map(|value| value.to_string())
            })
            .unwrap_or_else(|| text.trim().to_string());
        let error = format!("视频生成失败：{}", if message.is_empty() { status.to_string() } else { message });
        append_backend_log(
            &app,
            "agnes.video.create.error",
            json!({ "status": status.as_u16(), "elapsedMs": started.elapsed().as_millis(), "error": error, "response": truncate_log_text(&text, 4000) }),
        );
        return Err(error);
    }

    let parsed = serde_json::from_str::<Value>(&text)
        .map_err(|e| {
            let message = format!("解析 Agnes 视频创建响应失败: {}；原始响应: {}", e, text);
            append_backend_log(
                &app,
                "agnes.video.create.error",
                json!({ "status": status.as_u16(), "elapsedMs": started.elapsed().as_millis(), "error": message, "response": truncate_log_text(&text, 4000) }),
            );
            message
        })?;
    append_backend_log(
        &app,
        "agnes.video.create.success",
        json!({
            "status": status.as_u16(),
            "elapsedMs": started.elapsed().as_millis(),
            "taskId": parsed.get("task_id").or_else(|| parsed.get("id")).and_then(|value| value.as_str()),
            "videoId": parsed.get("video_id").and_then(|value| value.as_str()),
            "taskStatus": parsed.get("status").and_then(|value| value.as_str()),
            "response": summarize_agnes_video_response(&parsed),
        }),
    );
    Ok(parsed)
}

#[tauri::command]
pub fn agnes_image_create(app: tauri::AppHandle, url: String, api_key: String, body: Value) -> Result<Value, String> {
    append_backend_log(
        &app,
        "agnes.image.create.start",
        json!({
            "url": url,
            "hasApiKey": !api_key.trim().is_empty(),
            "body": summarize_agnes_video_body(&body),
        }),
    );
    let started = Instant::now();
    let client = blocking::Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .timeout(Duration::from_secs(180))
        .user_agent("MuseAI/0.6 agnes-image-client")
        .build()
        .map_err(|e| {
            let message = format!("初始化 Agnes 图片客户端失败: {}", e);
            append_backend_log(&app, "agnes.image.create.error", json!({ "error": message }));
            message
        })?;

    let response = match client
        .post(url)
        .bearer_auth(api_key.trim())
        .json(&body)
        .send()
    {
        Ok(response) => response,
        Err(error) => {
            let details = format_reqwest_error_details(&error);
            let message = format!("Agnes 图片创建请求失败: {}", details);
            append_backend_log(
                &app,
                "agnes.image.create.error",
                json!({
                    "elapsedMs": started.elapsed().as_millis(),
                    "error": message,
                    "isTimeout": error.is_timeout(),
                    "isConnect": error.is_connect(),
                    "sourceChain": reqwest_source_chain(&error),
                }),
            );
            return Err(message);
        }
    };

    let status = response.status();
    let text = match response.text() {
        Ok(text) => text,
        Err(error) => {
            let message = format!("读取 Agnes 图片创建响应失败: {}", error);
            append_backend_log(
                &app,
                "agnes.image.create.error",
                json!({ "status": status.as_u16(), "elapsedMs": started.elapsed().as_millis(), "error": message }),
            );
            return Err(message);
        }
    };

    if !status.is_success() {
        let message = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|payload| {
                payload
                    .get("error")
                    .and_then(|error| error.get("message"))
                    .and_then(|value| value.as_str())
                    .or_else(|| payload.get("message").and_then(|value| value.as_str()))
                    .map(|value| value.to_string())
            })
            .unwrap_or_else(|| text.trim().to_string());
        let error = format!("角色视觉图生成失败：{}", if message.is_empty() { status.to_string() } else { message });
        append_backend_log(
            &app,
            "agnes.image.create.error",
            json!({ "status": status.as_u16(), "elapsedMs": started.elapsed().as_millis(), "error": error, "response": truncate_log_text(&text, 4000) }),
        );
        return Err(error);
    }

    let parsed = serde_json::from_str::<Value>(&text)
        .map_err(|e| {
            let message = format!("解析 Agnes 图片创建响应失败: {}；原始响应: {}", e, text);
            append_backend_log(
                &app,
                "agnes.image.create.error",
                json!({ "status": status.as_u16(), "elapsedMs": started.elapsed().as_millis(), "error": message, "response": truncate_log_text(&text, 4000) }),
            );
            message
        })?;
    append_backend_log(
        &app,
        "agnes.image.create.success",
        json!({
            "status": status.as_u16(),
            "elapsedMs": started.elapsed().as_millis(),
            "response": summarize_agnes_video_response(&parsed),
        }),
    );
    Ok(parsed)
}

fn upload_image_with_fallbacks(app: &tauri::AppHandle, bytes: Vec<u8>, filename: String, mime: String) -> Result<String, String> {
    let client = blocking::Client::builder()
        .timeout(Duration::from_secs(45))
        .user_agent("MuseAI/0.6 temp-image-uploader")
        .build()
        .map_err(|e| format!("初始化图床上传客户端失败: {}", e))?;

    let mut errors = Vec::new();
    match upload_to_tmpfiles(app, &client, bytes.clone(), filename.clone(), mime.clone()) {
        Ok(url) => return Ok(url),
        Err(error) => errors.push(error),
    }
    match upload_to_uguu(app, &client, bytes.clone(), filename.clone(), mime.clone()) {
        Ok(url) => return Ok(url),
        Err(error) => errors.push(error),
    }
    match upload_to_catbox(app, &client, bytes.clone(), filename.clone(), mime.clone()) {
        Ok(url) => return Ok(url),
        Err(error) => errors.push(error),
    }
    match upload_to_litterbox(app, &client, bytes, filename, mime) {
        Ok(url) => return Ok(url),
        Err(error) => errors.push(error),
    }

    Err(format!("临时图床上传失败，已尝试 tmpfiles.org、Uguu、Catbox 和 Litterbox：{}", errors.join("；")))
}

fn build_multipart_part(bytes: Vec<u8>, filename: String, mime: String) -> Result<multipart::Part, String> {
    multipart::Part::bytes(bytes)
        .file_name(filename)
        .mime_str(&mime)
        .map_err(|e| format!("构造上传文件失败: {}", e))
}

fn upload_to_litterbox(app: &tauri::AppHandle, client: &blocking::Client, bytes: Vec<u8>, filename: String, mime: String) -> Result<String, String> {
    log_upload_provider_start(app, "Litterbox", bytes.len(), &filename, &mime);
    let started = Instant::now();
    let form = multipart::Form::new()
        .text("reqtype", "fileupload")
        .text("time", "72h")
        .part("fileToUpload", build_multipart_part(bytes, filename, mime)?);

    let response = client
        .post("https://litterbox.catbox.moe/resources/internals/api.php")
        .multipart(form)
        .send()
        .map_err(|e| {
            let message = format!("Litterbox: {}", e);
            log_upload_provider_error(app, "Litterbox", started, &message);
            message
        })?;

    if !response.status().is_success() {
        let message = format!("Litterbox: HTTP {}", response.status());
        log_upload_provider_error(app, "Litterbox", started, &message);
        return Err(message);
    }

    let url = response.text().map_err(|e| {
        let message = format!("Litterbox: 读取返回失败: {}", e);
        log_upload_provider_error(app, "Litterbox", started, &message);
        message
    })?;
    let trimmed = url.trim().to_string();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        log_upload_provider_success(app, "Litterbox", started, &trimmed);
        Ok(trimmed)
    } else {
        let message = format!("Litterbox: 返回异常: {}", trimmed);
        log_upload_provider_error(app, "Litterbox", started, &message);
        Err(message)
    }
}

fn upload_to_catbox(app: &tauri::AppHandle, client: &blocking::Client, bytes: Vec<u8>, filename: String, mime: String) -> Result<String, String> {
    log_upload_provider_start(app, "Catbox", bytes.len(), &filename, &mime);
    let started = Instant::now();
    let form = multipart::Form::new()
        .text("reqtype", "fileupload")
        .part("fileToUpload", build_multipart_part(bytes, filename, mime)?);

    let response = client
        .post("https://catbox.moe/user/api.php")
        .multipart(form)
        .send()
        .map_err(|e| {
            let message = format!("Catbox: {}", e);
            log_upload_provider_error(app, "Catbox", started, &message);
            message
        })?;

    if !response.status().is_success() {
        let message = format!("Catbox: HTTP {}", response.status());
        log_upload_provider_error(app, "Catbox", started, &message);
        return Err(message);
    }

    let url = response.text().map_err(|e| {
        let message = format!("Catbox: 读取返回失败: {}", e);
        log_upload_provider_error(app, "Catbox", started, &message);
        message
    })?;
    let trimmed = url.trim().to_string();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        log_upload_provider_success(app, "Catbox", started, &trimmed);
        Ok(trimmed)
    } else {
        let message = format!("Catbox: 返回异常: {}", trimmed);
        log_upload_provider_error(app, "Catbox", started, &message);
        Err(message)
    }
}

fn upload_to_uguu(app: &tauri::AppHandle, client: &blocking::Client, bytes: Vec<u8>, filename: String, mime: String) -> Result<String, String> {
    log_upload_provider_start(app, "Uguu", bytes.len(), &filename, &mime);
    let started = Instant::now();
    let form = multipart::Form::new()
        .part("files[]", build_multipart_part(bytes, filename, mime)?);

    let response = client
        .post("https://uguu.se/upload.php")
        .multipart(form)
        .send()
        .map_err(|e| {
            let message = format!("Uguu: {}", e);
            log_upload_provider_error(app, "Uguu", started, &message);
            message
        })?;

    if !response.status().is_success() {
        let message = format!("Uguu: HTTP {}", response.status());
        log_upload_provider_error(app, "Uguu", started, &message);
        return Err(message);
    }

    let payload: Value = response.json().map_err(|e| {
        let message = format!("Uguu: 解析返回失败: {}", e);
        log_upload_provider_error(app, "Uguu", started, &message);
        message
    })?;
    let raw_url = payload
        .get("files")
        .and_then(|files| files.as_array())
        .and_then(|files| files.first())
        .and_then(|file| file.get("url"))
        .and_then(|url| url.as_str())
        .ok_or_else(|| {
            let message = format!("Uguu: 返回异常: {}", payload);
            log_upload_provider_error(app, "Uguu", started, &message);
            message
        })?;

    if raw_url.starts_with("http://") || raw_url.starts_with("https://") {
        log_upload_provider_success(app, "Uguu", started, raw_url);
        Ok(raw_url.to_string())
    } else {
        let message = format!("Uguu: 返回的不是可访问链接: {}", raw_url);
        log_upload_provider_error(app, "Uguu", started, &message);
        Err(message)
    }
}

fn upload_to_tmpfiles(app: &tauri::AppHandle, client: &blocking::Client, bytes: Vec<u8>, filename: String, mime: String) -> Result<String, String> {
    log_upload_provider_start(app, "tmpfiles.org", bytes.len(), &filename, &mime);
    let started = Instant::now();
    let form = multipart::Form::new()
        .part("file", build_multipart_part(bytes, filename, mime)?);

    let response = client
        .post("https://tmpfiles.org/api/v1/upload")
        .multipart(form)
        .send()
        .map_err(|e| {
            let message = format!("tmpfiles.org: {}", e);
            log_upload_provider_error(app, "tmpfiles.org", started, &message);
            message
        })?;

    if !response.status().is_success() {
        let message = format!("tmpfiles.org: HTTP {}", response.status());
        log_upload_provider_error(app, "tmpfiles.org", started, &message);
        return Err(message);
    }

    let payload: Value = response.json().map_err(|e| {
        let message = format!("tmpfiles.org: 解析返回失败: {}", e);
        log_upload_provider_error(app, "tmpfiles.org", started, &message);
        message
    })?;
    let raw_url = payload
        .get("data")
        .and_then(|data| data.get("url"))
        .and_then(|url| url.as_str())
        .ok_or_else(|| {
            let message = format!("tmpfiles.org: 返回异常: {}", payload);
            log_upload_provider_error(app, "tmpfiles.org", started, &message);
            message
        })?;

    if raw_url.starts_with("https://tmpfiles.org/") {
        let url = raw_url.replacen("https://tmpfiles.org/", "https://tmpfiles.org/dl/", 1);
        log_upload_provider_success(app, "tmpfiles.org", started, &url);
        Ok(url)
    } else if raw_url.starts_with("http://") || raw_url.starts_with("https://") {
        log_upload_provider_success(app, "tmpfiles.org", started, raw_url);
        Ok(raw_url.to_string())
    } else {
        let message = format!("tmpfiles.org: 返回的不是可访问链接: {}", raw_url);
        log_upload_provider_error(app, "tmpfiles.org", started, &message);
        Err(message)
    }
}

fn summarize_media_source(source: &str) -> Value {
    if source.starts_with("data:") {
        let mime = source
            .split_once(';')
            .map(|(meta, _)| meta.trim_start_matches("data:"))
            .unwrap_or("unknown");
        json!({ "type": "data-url", "mime": mime, "chars": source.chars().count() })
    } else if source.starts_with("http://") || source.starts_with("https://") {
        json!({ "type": "url", "url": truncate_log_text(source, 500) })
    } else {
        json!({ "type": "unknown", "chars": source.chars().count() })
    }
}

fn summarize_agnes_video_body(body: &Value) -> Value {
    let images = body
        .get("extra_body")
        .and_then(|extra| extra.get("image"))
        .or_else(|| body.get("image"));
    let image_count = match images {
        Some(Value::Array(items)) => items.len(),
        Some(Value::String(_)) => 1,
        _ => 0,
    };
    json!({
        "model": body.get("model").and_then(|value| value.as_str()),
        "promptChars": body.get("prompt").and_then(|value| value.as_str()).map(|value| value.chars().count()),
        "negativePromptChars": body.get("negative_prompt").and_then(|value| value.as_str()).map(|value| value.chars().count()),
        "imageCount": image_count,
        "imageHosts": summarize_agnes_image_hosts(images),
        "hasExtraBody": body.get("extra_body").is_some(),
        "numFrames": body.get("num_frames").and_then(|value| value.as_u64()),
        "frameRate": body.get("frame_rate").and_then(|value| value.as_u64()),
        "width": body.get("width").and_then(|value| value.as_u64()),
        "height": body.get("height").and_then(|value| value.as_u64()),
    })
}

fn summarize_agnes_image_hosts(images: Option<&Value>) -> Vec<String> {
    let mut hosts = Vec::new();
    match images {
        Some(Value::Array(items)) => {
            for item in items {
                if let Some(host) = item.as_str().and_then(extract_url_host) {
                    if !hosts.contains(&host) {
                        hosts.push(host);
                    }
                }
            }
        }
        Some(Value::String(url)) => {
            if let Some(host) = extract_url_host(url) {
                hosts.push(host);
            }
        }
        _ => {}
    }
    hosts
}

fn extract_url_host(url: &str) -> Option<String> {
    let without_scheme = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))?;
    without_scheme
        .split('/')
        .next()
        .filter(|host| !host.trim().is_empty())
        .map(|host| host.to_string())
}

fn summarize_agnes_video_response(response: &Value) -> Value {
    json!({
        "id": response.get("id").and_then(|value| value.as_str()),
        "taskId": response.get("task_id").and_then(|value| value.as_str()),
        "videoId": response.get("video_id").and_then(|value| value.as_str()),
        "status": response.get("status").and_then(|value| value.as_str()),
        "progress": response.get("progress").and_then(|value| value.as_u64()),
        "model": response.get("model").and_then(|value| value.as_str()),
        "seconds": response.get("seconds").and_then(|value| value.as_str()),
        "size": response.get("size").and_then(|value| value.as_str()),
    })
}

fn truncate_log_text(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        text.to_string()
    } else {
        format!("{}... (truncated)", text.chars().take(max_chars).collect::<String>())
    }
}

fn reqwest_source_chain(error: &reqwest::Error) -> Vec<String> {
    let mut chain = Vec::new();
    let mut current = error.source();
    while let Some(source) = current {
        chain.push(source.to_string());
        current = source.source();
    }
    chain
}

fn format_reqwest_error_details(error: &reqwest::Error) -> String {
    let chain = reqwest_source_chain(error);
    if chain.is_empty() {
        return error.to_string();
    }
    format!("{}；底层原因：{}", error, chain.join(" -> "))
}

fn log_upload_provider_start(app: &tauri::AppHandle, provider: &str, bytes: usize, filename: &str, mime: &str) {
    append_backend_log(
        app,
        "temp_image.provider.start",
        json!({ "provider": provider, "bytes": bytes, "filename": filename, "mime": mime }),
    );
}

fn log_upload_provider_success(app: &tauri::AppHandle, provider: &str, started: Instant, url: &str) {
    append_backend_log(
        app,
        "temp_image.provider.success",
        json!({ "provider": provider, "elapsedMs": started.elapsed().as_millis(), "url": url }),
    );
}

fn log_upload_provider_error(app: &tauri::AppHandle, provider: &str, started: Instant, error: &str) {
    append_backend_log(
        app,
        "temp_image.provider.error",
        json!({ "provider": provider, "elapsedMs": started.elapsed().as_millis(), "error": error }),
    );
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
