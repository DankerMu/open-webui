# Glossary

Open WebUI fork that embeds an Open Computer Use (OCU) workspace and ONLYOFFICE editing for a LAN deployment. Terms below are this project's own; generic Open WebUI / FastAPI / Svelte vocabulary is not listed. Source of the definitions: `docs/plans/` (2026-09-20 review).

## Language

**工作区 (workspace)**:
一个聊天对应的 OCU 沙箱与其工作区文件目录的总称，以 `chat_id` 为唯一键，没有独立的 workspace*id。
\_Avoid*: workspace_id, session, environment

**沙箱 (sandbox)**:
OCU 为一个聊天启动的 Docker 容器 `owui-chat-{chat_id}`，Agent 在其中执行代码、浏览网页、运行终端。
_Avoid_: container (when meaning the chat's runtime), VM, agent box

**工作区文件 (workspace files)**:
一个聊天里用户与 Agent 共用的唯一文件目录：上传的与生成的文件都在这里，双方都可修改。宿主机上是 `{BASE_DATA_DIR}/{chat_id}/outputs`（目录名沿用），沙箱内挂载为 `/mnt/user-data/files`；侧栏列出的就是它。Agent 的私有临时区 `/home/assistant` 不属于工作区文件。Plan 2 的 B0 落地之前，沙箱内仍是只读的 uploads 与可写的 outputs 两个路径。
_Avoid_: 产物 / outputs（Plan 1 旧称，只在指宿主机目录名或既有接口名时使用）, uploads（作为用户可见的分类）, artifacts (reserved for WebUI's native HTML/SVG Artifact panel)

**revision**:
工作区文件每次被检测到变化时单调递增的每聊天计数器；侧栏判断文件是否变化的依据。mtime 只作展示，不是身份。
_Avoid_: version（留给 Office 的「版本」）, mtime, timestamp

**file_id**:
工作区文件的稳定标识，由 path 索引与 (size+SHA-256) 索引共同维护；改名延续、路径复用不继承。
_Avoid_: path (as identity), inode, filename

**版本 (version)**:
Office broker 为一个文档保存的不可变内容快照，按 SHA-256 存放，每文档单调编号，带来源（保存、自动保存、关闭、恢复、冲突、被覆盖的工作区内容）与是否已发布。历史不原地改写。
_Avoid_: revision（那是工作区文件的变化计数器）, snapshot, backup

**persist / publish**:
Office 保存的两个内部阶段。persist = 把编辑器（ONLYOFFICE）交回的内容存为不可变版本并写保存回执，不改工作区文件；publish = 在 fence 窗口内原子替换工作区文件并向 outputs broker 登记。用户点保存与关闭会话都是 persist 后立即 publish；每 5 分钟的自动保存只 persist。界面上只有一个「保存」，不把两个阶段暴露成两个按钮。
_Avoid_: save (ambiguous), commit (git sense)

**fence**:
publish 窗口内对沙箱写入者的围栏，始终在 per-chat 锁内：容器在运行则 pause → 替换 → unpause（暂停失败即发布失败），容器未运行则直接替换；与容器 launch 共用同一把锁。
_Avoid_: lock (alone), freeze, mutex
