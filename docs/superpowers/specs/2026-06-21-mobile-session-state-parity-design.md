# 移动端状态与 Session 对齐设计

## 目标

修复移动端 token 验证后的数据刷新、新建聊天初始化、历史 session 漏项，并使移动聊天和冒险的 session 保存契约与桌面端一致。

## 1. Token 验证后的状态刷新

token 验证成功后不能只开放导航入口，还必须重新读取鉴权前加载失败的数据：

- 加载 `partner-store`，用真实世界书和角色卡替换内置 demo 数据。
- 重新加载 `partner-chat-store` 和 `story-store` 的持久化选择状态。
- 重新读取聊天和普通冒险的 session 列表。
- 刷新完成后才将首页状态切换为“已验证”。

刷新失败时保持未验证状态并显示错误，不让用户进入仍是 demo 数据的功能页。

## 2. 新建聊天初始化

移动聊天点击“新建”后应回到选择角色卡和世界书的初始页面：

- 清空消息、输入、流状态、归档状态和上下文压缩。
- 生成新的 `partner-session-*` ID。
- 清空 `selectedCharacterCardId`。
- 清空 `selectedWorldBookId`。

移动冒险沿用现有新建行为，保留其完整初始配置页面。

## 3. 历史 Session 列表

移动 HTTP API 与桌面端使用相同的筛选规则：

- 聊天：展示全部 `partner-session-*`。
- 普通冒险：展示全部 `story-session-*`，但只包含：
  - `sessionKind === "story"`；
  - 旧版没有 `sessionKind` 的记录。
- 穿书：`sessionKind === "bookTravel"`，不出现在移动冒险列表中。
- 是否归档不影响聊天或普通冒险历史记录的可见性。

移动前端请求冒险列表时显式传入 `sessionKind: "story"`。

## 4. Session 保存逻辑

### 共享 Rust 持久化

将 session 列表、读取和保存的文件逻辑抽成不依赖具体 Tauri Runtime 的内部函数。桌面 Tauri 命令与移动 Axum 路由调用同一套函数，避免两套实现继续漂移。

共享逻辑负责：

- session ID 和允许前缀校验；
- `savedAt` 更新时间；
- JSON 序列化和文件写入；
- summary 构造；
- prefix 和 `sessionKind` 筛选；
- 按 `savedAt` 倒序排列。

移动端仍保留只允许聊天和普通故事 session 的权限边界。

### 移动聊天

- 与桌面端一致，只有存在至少一条用户消息时才保存。
- 保存 `messages`、`contextCompaction`、`isArchived`、`characterCardId` 和 `selectedWorldBookId`。
- 聊天不写 `sessionKind`，通过 `partner-session-*` 区分。
- 保存完成后刷新完整聊天 session 列表。

### 移动冒险

- 与桌面端一致，只有存在至少一条用户消息时才保存。
- 显式写入 `sessionKind: "story"`。
- 保存 `messages`、`contextCompaction`、`isArchived`、`characterCardIds`、`selectedWorldBookId` 和 `dynamicRoleLoadingEnabled`。
- 保存完成后刷新普通冒险 session 列表，不混入穿书记录。

## 5. 测试

### 前端

- token 验证成功后重新加载真实 partner、chat 和 story 状态。
- 刷新失败时不进入已验证状态。
- 移动聊天“新建”清空角色卡和世界书并显示初始选择页。
- 仅有 Agent 占位消息时，聊天和冒险均不保存。
- 移动冒险保存时包含 `sessionKind: "story"`。
- 聊天和冒险列表请求使用正确筛选参数。

### Rust

- 聊天列表包含未归档和已归档记录。
- 普通冒险列表包含 `story` 和旧版无 kind 记录。
- 普通冒险列表排除 `bookTravel`。
- 桌面命令和移动路由使用共享列表及保存逻辑。
- 保存结果的文件内容和 summary 字段保持一致。

## 非目标

- 不修改穿书模式自身的保存和历史页面。
- 不改变 session 文件格式或迁移现有文件。
- 不新增新的移动端任意文件访问能力。
