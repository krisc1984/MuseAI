# 咕咕助手 - 角色卡生成器

一个面向 SillyTavern 的前端扩展，用于生成中文角色卡、世界书和用户设定。

## 功能

- 生成角色卡
- 为当前角色生成并绑定世界书
- 为当前角色生成并绑定用户设定
- 支持 OpenAI 兼容与 Google Gemini 两种接口格式
- 支持保存多套独立 API 配置

## 安装

将本仓库放入 SillyTavern 的第三方扩展目录：

```text
public/scripts/extensions/third-party/gugu-character-card-generator
```

然后在 SillyTavern 中启用该扩展。

## 文件结构

```text
.
├─ generation/    # 提示词、请求与响应解析
├─ integration/   # 角色、世界书、用户设定写入与绑定
├─ storage/       # 本地配置存储
├─ styles/        # 面板样式拆分
├─ ui/            # 面板与关于弹窗
├─ constants.js
├─ index.js
├─ manifest.json
├─ settings.html
└─ style.css
```

## 许可证

AGPL-3.0-or-later
