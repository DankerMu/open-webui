# Glossary

Open WebUI fork that embeds an Open Computer Use (OCU) workspace and ONLYOFFICE editing for a LAN deployment. Terms below are this project's own; generic Open WebUI / FastAPI / Svelte vocabulary is not listed. Source of the definitions: `docs/plans/` (2026-09-20 review).

## Language

**工作区 (workspace)**:
一个聊天对应的 OCU 沙箱与其产物目录的总称，以 `chat_id` 为唯一键，没有独立的 workspace*id。
\_Avoid*: workspace_id, session, environment

**沙箱 (sandbox)**:
OCU 为一个聊天启动的 Docker 容器 `owui-chat-{chat_id}`，Agent 在其中执行代码、浏览网页、运行终端。
_Avoid_: container (when meaning the chat's runtime), VM, agent box

**产物 (outputs)**:
`{BASE_DATA_DIR}/{chat_id}/outputs`，host bind mount，沙箱可写、orchestrator 同路径可见；唯一允许手工编辑的根目录。
_Avoid_: artifacts (reserved for WebUI's native HTML/SVG Artifact panel), uploads, workspace files

**revision**:
产物内容每次变化时单调递增的版本号；文件身份与版本判断的依据。mtime 只作展示，不是身份。
_Avoid_: version, mtime, timestamp

**file_id**:
产物文件的稳定标识，由 path 索引与 (size+SHA-256) 索引共同维护；改名延续、路径复用不继承。
_Avoid_: path (as identity), inode, filename

**persist / publish**:
persist = 编辑器（ONLYOFFICE）forcesave 后只写入不可变 revision 与 SaveReceipt，不改工作区文件；publish = 最终关闭或用户显式"保存到工作区"时，经 fence 窗口原子替换工作区文件。
_Avoid_: save (ambiguous), autosave, commit (git sense)

**fence**:
publish 提交窗口内对沙箱写入者的围栏：容器运行则 pause/unpause，已停止则在 per-chat 锁内提交，pause 不可用则 stop/commit/start；与容器启动共用同一把锁。
_Avoid_: lock (alone), freeze, mutex
