# 知识库文档拷入沙箱 · 上传 skill 的中文显示名

Status: proposed（设计稿，未实现）。2026-11-11 用户经三轮提问确认了下文 Decision Ledger 的全部分支，没有开放项。两个改动互不依赖，各成一个 OpenSpec change：A = `ocu-knowledge-file-copy`，B = `ocu-skill-display-name`。

## 背景

业务试运行反馈了三个问题，本计划处理后两个：

1. 对话中途再打开「图像生成」「视频制作」开关后，模型拿不到对应工具。不在本计划内：同一对话先关后开、并刷新后再开，两条浏览器用例在 harness 里都通过（`e2e/ocu-video-switch.e2e.ts`、`e2e/ocu-image-placeholder.e2e.ts`，分支 `claude/mid-chat-feature-toggles`），WebUI 到 OCU 的开关链路没有复现出缺陷。这个问题需要部署环境的证据另行诊断。
2. 知识库文档里的插图拿不出来。RAG 只抽取文本；沙箱又没有网络，模型没办法拿到原始 docx/pdf。
3. 管理员上传的 skill 只能用英文名（`SKILL.md` frontmatter 的 `name` 必须匹配 `^[a-z0-9][a-z0-9-]{0,63}$`，`backend/open_webui/utils/ocu_skill_zip.py:155-159`）。用户在 `/` 菜单、输入框标签和消息里的工具调用行看到的都是英文名。

## What Already Exists

- 附件同步：OCU 工具包 `openwebui/tools/computer_use_tools.py`（OCU 仓库，运行在 WebUI 进程里）在每次工具调用前同步附件和本对话生成的图片。
  - `_readable_files`（`:1159`）按 id 读取 WebUI 文件行，判定请求用户可读：本人上传，或 `has_access_to_file(file_id, 'read', user)`，不含管理员豁免。
  - `_sync_uploaded_files`（`:1230`）以 `POST {ORCHESTRATOR_URL}/api/uploads/{chat_id}/{name}` 上传，带 `X-OCU-Attachment-Id`（`:1271`）。
  - 请求里的知识库条目（`type: collection`，id 是知识库 id）会被 `_attachment_ids` 当作文件 id 去查，查不到就静默跳过。所以挂了知识库也不会有文件进沙箱。
- 导入回执：OCU `computer-use-server/uploads.py` `store_upload`（`:685`）。带回执 id 的上传如果该 id 已有回执，就直接返回回执里的路径（`:705-708`），不检查文件还在不在。用户在侧栏删掉副本后，再同步同一个 id，拿到的是一个已不存在的路径。
- 知识库成员关系：`Knowledges.get_knowledges_by_file_id`；读权限：知识库所有者，或 `AccessGrants.has_access(resource_type='knowledge', permission='read')`。两者的组合方式见 `backend/open_webui/utils/access_control/files.py:45-63`。
- 模型能拿到 file_id：内置知识库工具 `search_knowledge_files`、`query_knowledge_files` 等返回的结果带文件 `id`（`backend/open_webui/tools/builtin.py:2169` 起）。
- 上传 skill：表 `ocu_skill`（`backend/open_webui/models/ocu_skills.py:20-31`），路由 `backend/open_webui/routers/ocu_skills.py`。前端：
  - 管理员标签 `src/lib/components/admin/Settings/OcuSkills.svelte`；
  - 个人标签 `src/lib/components/chat/Settings/OcuSkillPreferences.svelte`；
  - `/` 菜单分组 `Commands/SlashCommands.svelte:69-78`，选中后插入提及 `ocu--{name}|{name}`（`CommandSuggestionList.svelte:57`）。
  - OCU filter 把用户消息里的 `<$ocu--{name}|{label}>` 改写成 `{label}`，标签字符类是 `[^<>]*`，中文可以通过。系统消息里另加一句点名英文 `{name}` 的指令（`computer_link_filter.py` `_SKILL_MARKER_RE`）。
- 上传 skill 挂在沙箱 `/mnt/skills/user/{name}`，模型通过 `view /mnt/skills/user/{name}/SKILL.md` 加载它。消息里这一行由上游 `src/lib/components/common/ToolCallDisplay.svelte:239-255` 渲染，显示的是工具名 `view`。
- 最新迁移是 `f7a8b9c0d1e2_add_ocu_skill.py`，后面没有其他迁移。

## A. 知识库文档拷入沙箱（`ocu-knowledge-file-copy`）

### 设计

- OCU 工具包新增一个工具 `copy_knowledge_file(file_id, description)`，一次拷一个文件，拷到 `/mnt/user-data/files/`。
  - 前置检查与其它工具一致：`_prepare_tool_call`，只服务已保存的对话。
  - 文件必须属于**对话主人**可读的某个知识库：经 `Knowledges.get_knowledges_by_file_id` 找到的知识库里，至少有一个由对话主人拥有，或通过 `AccessGrants` 授予了对话主人（或其所在分组，或全员 `user:*`）读权限。判定以对话主人为准，不看调用者（管理员可在别人的对话里触发调用）；管理员身份本身不算授权。
  - 不认 `file.meta.collection_name` 这条旧路径。它可能指向一个已经把该文件移出去的知识库，而知识库成员关系以 `knowledge_file` 关联为准。
  - 不属于任何可读知识库（包括本人上传但不在知识库里的文件）、文件不存在或没有存储路径：返回以 `Error:` 开头的说明，不上传。
- 拷贝复用 `_sync_uploaded_files`，回执 id 就是 WebUI 文件 id，因此同一对话里重复拷贝会去重。
- 副本被删后重拷：上传请求多带一个请求头 `X-OCU-Reimport-Missing: 1`。
  - OCU `store_upload` 只在带了这个请求头时，才去检查回执里的 `stored_name` 是否还是 outputs 下的常规文件。
  - 文件不在了：按正常流程（含重名加后缀）重新写入，并改写这条回执。
  - 文件还在（哪怕已被编辑过）：返回原回执，不覆盖用户的修改。
  - 不带这个请求头的请求（附件和生成图片的自动同步）行为不变，用户删掉的附件不会自己回来。
- 返回值：成功时给出沙箱路径（`/mnt/user-data/files/<stored_name>`）；失败时说明原因（无权限、不在知识库、上传失败），不抛异常。
- 告诉模型怎么用，两处：
  - 工具 docstring：先用知识库工具查到文件 `id`，再拷贝，然后按 docx/pdf skill 提取插图，用工作区文件链接展示；
  - OCU 系统提示词 `<notes_on_user_uploaded_files>` 加一句：如果有 `copy_knowledge_file` 工具，需要知识库文档的原始文件（例如插图）时用它。这句写成条件句，是因为同一份提示词也给 MCP 客户端用，而 MCP 客户端没有这个工具。
- 版本：工具包 version 升级；OCU 改动合并后，WebUI 的 `constraints.yaml ocu_checkout.sha` 跟着升级。部署时要重建 computer-use-server 镜像，并删掉 init 标记后重跑 init，库里存的工具源码才会更新。

### Not In Scope

- 挂载知识库时自动全量同步。
- 一次拷多个文件。
- 拷贝非知识库文件（其他对话的附件等）。
- 多模态嵌入或 RAG 抽图。
- 改动 WebUI 仓库的后端代码。本变更只改 OCU 仓库，外加 WebUI 的 pin 升级。

## B. 上传 skill 的中文显示名（`ocu-skill-display-name`）

### 设计

- 数据（一个迁移；本计划就是 AGENTS.md 要求的「迁移所在 plan」）：`ocu_skill` 新增可空列 `display_name`（Text）。迁移名 `add_ocu_skill_display_name`，`down_revision = 'f7a8b9c0d1e2'`，downgrade 删除这一列。
- 规则：
  - 可选；去掉首尾空白后为空，视为清除（存 `NULL`）。
  - 长度 ≤ 32 个字符。
  - 不得含 `<`、`>`，也不得含任何控制字符（包括换行）。`<`、`>` 会破坏提及标记 `<$ocu--{name}|{label}>`。
  - 不要求唯一。
  - 替换 ZIP 时保留；删除 skill 时随行删除。
- 英文 `name` 仍是唯一标识、挂载目录名和模型看到的名字。OCU 的 registry 契约（`/api/internal/user-config`）、OCU 服务端和模型提示词都不变。
- 路由：
  - 管理员 `POST /api/v1/ocu/skills/{name}/display-name`，请求体 `{"display_name": string | null}`。成功返回更新后的管理员条目；名字不存在返回 404；规则不符返回 400；非管理员 401。
  - `GET /admin`、`GET /`（用户列表）、`POST /{name}/toggle` 的返回都带上 `display_name`（可为 `null`）。
- 界面（显示名为空时一律退回英文名）：
  - 管理员「工作区 Skills」：每行一个显示名输入框和保存按钮，保存失败显示服务端给的原因。
  - 个人「工作区 Skills」：显示名为主，英文名为辅。
  - `/` 菜单：条目显示名为主、英文名为辅，按两者筛选，按显示名排序。选中后插入提及 `ocu--{name}|{显示名}`，标签显示中文名，发出的文字里也是中文名。filter 另外给模型一句点名英文名的读取指令（现有行为）。
  - 消息里的工具调用行：工具名为 `view` 且参数 `path` 正好是 `/mnt/skills/user/{name}/SKILL.md` 时，完成态显示「使用技能：{显示名}」，进行中显示「正在读取技能：{显示名}…」；展开后的输入/输出不变。查不到显示名（skill 已删除、看对话的人无读权限）时用 `{name}`。内置 skill（`/mnt/skills/public/…`）和其他工具的行不变。
  - 前端的显示名来自用户列表 `GET /`，同一页面内共享一份。工作区关闭（`features.enable_ocu_workspace` 为 false）时不发请求。

### Not In Scope

- 内置 skill 的中文名。
- 在上传时填写显示名、从 `SKILL.md` frontmatter 读显示名。
- 系统提示词、OCU `<available_skills>` 或内部 registry 契约里出现显示名（用户消息文本按 `/` 菜单规则携带显示名，不在此列）。
- 显示名唯一性。
- 改动 OCU 仓库。

## Decision Ledger（2026-11-11，用户拍板）

| #   | 分支                             | 结论                                                                                       |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | 问题 1 指的 agent                | 聊天模型本身                                                                               |
| 2   | 知识库文档怎么进沙箱             | 按需工具，按 file_id 拷贝；不做挂载即全量同步                                              |
| 3   | 拷贝范围                         | 只限属于用户可读知识库的文件                                                               |
| 4   | 重复拷贝                         | 去重；副本被删则重拷（OCU 上传接口加请求头，普通附件同步不变）                             |
| 5   | 批量                             | 一次一个                                                                                   |
| 6   | 中文名显示在哪里                 | 消息里的工具调用行；`/` 菜单与输入框标签                                                   |
| 7   | 中文名来源                       | 管理员在后台填写；新增 `display_name` 列，一次加列迁移                                     |
| 8   | 内置 skill                       | 不动，不做默认中文名表                                                                     |
| 9   | 显示名规则                       | 可选，≤32 字，留空显示英文名；去首尾空白，不含 `<` `>` 和换行；不要求唯一；替换 ZIP 时保留 |
| 10  | 工具调用行文案                   | 「使用技能：X」；进行中「正在读取技能：X…」；展开内容不变                                  |
| 11  | `/` 菜单                         | 中文名为主、英文名为辅；标签和发出的文字用中文名                                           |
| 12  | 编辑入口                         | 管理页列表每行可编辑                                                                       |
| 13  | 模型是否看到中文名               | 不需要；OCU 与模型提示词不变                                                               |
| 14  | 交付流程                         | 完整 stage-change-pipeline                                                                 |
| 15  | 折叠分组组头（Stage 3 后追加）   | 组头也用中文名，命中的调用显示为「使用技能：X」                                            |
| 16  | 读取失败文案（Stage 3 后追加）   | 「读取技能失败：X」，图标仍是红叉                                                          |
| 17  | 已发送消息气泡（Stage 3 后追加） | 显示中文名：上游 MentionToken 的 `$` 提及优先用标签                                        |
| 18  | 拷贝授权主体（Stage 3 后追加）   | 按对话主人的知识库读权限判定，任何调用者都一样；全员公开的知识库算可读                     |
