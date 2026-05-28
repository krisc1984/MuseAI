use std::fs;
use std::path::Path;

use tauri::{AppHandle, Manager};

use crate::utils::*;

#[tauri::command]
pub fn import_workspace_item(
    app: AppHandle,
    source_path: String,
    dir_type: String,
) -> Result<String, String> {
    let source = Path::new(&source_path);
    if !source.exists() {
        return Err("Source path does not exist".to_string());
    }

    let doc_dir = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?;
    let base_dir = doc_dir.join("MuseAI").join(&dir_type);

    fs::create_dir_all(&base_dir).map_err(|e| e.to_string())?;

    let file_name = source.file_name().ok_or("Invalid file name")?;
    let mut dest = base_dir.join(file_name);

    if dest.exists() {
        let stem = Path::new(file_name).file_stem().and_then(|s| s.to_str()).unwrap_or("");
        let ext = Path::new(file_name).extension().and_then(|e| e.to_str()).map(|e| format!(".{}", e)).unwrap_or_default();
        let mut count = 1;
        loop {
            let new_name = format!("{} ({}){}", stem, count, ext);
            dest = base_dir.join(&new_name);
            if !dest.exists() {
                break;
            }
            count += 1;
        }
    }

    if source.is_file() {
        if !is_supported_content_file(source) {
            return Err("仅支持 Markdown 和图片文件".to_string());
        }
        fs::copy(source, &dest).map_err(|e| e.to_string())?;
    } else if source.is_dir() {
        copy_md_dir_recursive(source, &dest).map_err(|e| format!("Copy failed: {}", e))?;
    }

    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn delete_workspace_item(app: AppHandle, item_path: String) -> Result<(), String> {
    let target = Path::new(&item_path);
    let doc_dir = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?;
    let museai_dir = doc_dir.join("MuseAI");
    let refs_dir = museai_dir.join("references");
    let articles_dir = museai_dir.join("articles");
    let outline_dir = museai_dir.join("outline");

    if !target.starts_with(&refs_dir) && !target.starts_with(&articles_dir) && !target.starts_with(&outline_dir) {
        return Err("Cannot delete files outside of target directories".to_string());
    }

    if !target.exists() {
        return Ok(());
    }

    if target.is_dir() {
        fs::remove_dir_all(target).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(target).map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
pub fn get_workspace_dir(app: AppHandle, dir_type: String) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let doc_dir = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?;
    let museai_dir = doc_dir.join("MuseAI");

    // Migrate from old app_data_dir locations to ~/Documents/MuseAI
    for dir_name in ["articles", "references", "outline"] {
        let old = app_data_dir.join(dir_name);
        let new = museai_dir.join(dir_name);
        if old.exists() && !new.exists() {
            let _ = fs::create_dir_all(&museai_dir);
            let _ = fs::rename(&old, &new);
        }
    }

    // Also migrate from the very old de_ai directory
    let old_de_ai = app_data_dir.join("de_ai");
    if old_de_ai.exists() {
        let old_ref = old_de_ai.join("references");
        let old_works = old_de_ai.join("works");
        let new_ref = museai_dir.join("references");
        let new_articles = museai_dir.join("articles");
        if old_ref.exists() && !new_ref.exists() {
            let _ = fs::create_dir_all(&museai_dir);
            let _ = fs::rename(&old_ref, &new_ref);
        }
        if old_works.exists() && !new_articles.exists() {
            let _ = fs::create_dir_all(&museai_dir);
            let _ = fs::rename(&old_works, &new_articles);
        }
        let _ = fs::remove_dir_all(&old_de_ai);
    }

    let dir = museai_dir.join(&dir_type);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}
