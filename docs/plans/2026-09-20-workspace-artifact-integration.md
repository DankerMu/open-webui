# Plan 1：OCU 工作区 Artifact 集成

状态：待实施的技术计划；2026-09-20 按源码审核修订（第二轮：修正行号、补顶层导航防护、改网关拓扑为外部反代、沙箱网络改为独立 bridge + 防火墙阻断控制面、删除 workspace_id）。信任模型明确为局域网受信部署。源码已准备，未部署、未实现、未完成运行验收。

## 目标与边界

复用 OCU 的 `/preview/{chat_id}` 应用，在 Open WebUI 中提供专用工作区侧栏，支持 Files、Browser、Terminal；可靠处理新产物、修改刷新、历史聊天恢复、聊天切换和用户授权。保留原生 HTML/SVG Artifact 能力。

本计划的 Office 能力是只读预览，以及 Agent 修改文件后刷新。手工编辑和保存由 [Plan 2](2026-09-20-office-manual-editing.md) 实现；Plan 1 可独立交付。

既有约束：测试用公网 OpenAI-compatible API，生产切换内网 API；模型 key 仅在服务端；默认终端 Bash、不自动运行编码 CLI；sandbox 最长连续运行 168 小时，仅停止，不自动删除数据或卷。20 名员工不等于 20 个并发 sandbox，容量须独立验证。

## 信任模型与裁剪（LAN）

部署目标为企业局域网：全部用户为受信员工，无匿名入口、无公网暴露，浏览器经内网 DNS/TLS 访问。据此裁剪与保留：

- **不做**（防恶意员工的对抗机制）：单次兑换票据、nonce 防重放、独立工作区域名、跨用户渗透级测试。跨用户用例降级为授权拒绝冒烟。
- **保留**（与员工可信度无关）：
  1. 提示注入驱动的沙箱网络行为与生成内容——Agent 浏览网页/读取文档后可被注入指令，沙箱网络必须不可达 OCU/WebUI 控制面；模型生成的 HTML/SVG 在任何打开方式下（侧栏 iframe、顶层导航、新标签）都不得在 WebUI origin 上执行；
  2. 跨聊天串数据与授权边界——属正确性底线；
  3. 凭据位置——模型 API key、MCP key、GitLab token 不下前端、不进错误沙箱。
- **接受的残余风险**（记录在案）：MCP_API_KEY 为服务端共享密钥，泄露即可冒充工具路径；admin 经 WebUI 既有完成路径可进入他人聊天上下文（WebUI 原生行为），工作区侧仍以 owner-only 拒绝。

## 固定源码与已有证据

| 对象     | 本机目录                                          | 基线                                                                                              |
| -------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| OCU      | `/Users/danker/Documents/31308/open-computer-use` | `7318b2e7a5c23d3be3f4843f0955393b8058bcfd`，main；已 fetch 核对 origin/main                       |
| WebUI    | `/Users/danker/Documents/31308/open-webui-ocu`    | tag `v0.11.3`，`2a960a59fe1dbbd35282f0556b3666d81102e781`；分支 `codex/ocu-workspace-integration` |
| 历史参考 | OCU Git 历史，无需重新克隆                        | `955afc58c4484d64955e62d40a2e8960fa972ff4`                                                        |

本计划存放于 WebUI 仓库 `docs/plans/`；文中 `deploy/`、`docs/decisions/`、`computer-use-server/`、`openwebui/` 等相对路径均相对 OCU 目录。OCU 当前 `deploy/`、`docs/decisions/` 是既有未跟踪产物，实施时保留。旧部署决策含历史运行事实；VPS 已卸载，不能直接将其视作当前环境真值。不得覆盖首版决策；变更另记决策记录。

已核对源码（2026-09-20 审核修正行号）：

- OCU `computer-use-server/app.py:1136` 提供 preview SPA，`:595` 返回文件元数据（当前字段仅 name/path/size/modified/type/mime/url，无 file_id/revision/hash）。`:540` 的 `/files/{chat_id}/{filename}` 按猜测的 mime 内联返回（`:583-588`），HTML/SVG 会作为顶层文档执行；只有 `?download=1` 才走 attachment。
- OCU 端点全集（`app.py`）：`/`(:353)、`/api/uploads/{chat_id}/manifest|list`(:359,:396)、上传 POST(:421)、`/files/{chat_id}/archive`(:477)、`/files/{chat_id}/*`(:540)、`/api/outputs/{chat_id}`(:595)、`/browser/{chat_id}/status|json|json/version`(:634-681)、CDP WS(:700)、`/terminal/{chat_id}/status|start-ttyd|stop-ttyd|restart-container|resurrect-container|sessions|processes|processes/{pid}/kill|heartbeat|ws`(:798-1070)、`/preview/{chat_id}`(:1136)、`/system-prompt`(:1188)、`/skill-mounts`(:1265)、`/skill-list`(:1282)、`/health`(:1298)、`/api/skill-stats`(:1374，已有 `X-Internal-Api-Key` 校验 `:1385-1387`)、`/api/runtime/cli`(:1397，无鉴权，返回子代理 CLI 与默认模型)、`/mcp`、`/mcp-info`(:1512)。除 `/mcp` 与 `/api/skill-stats` 外无鉴权；CORS 为 `allow_origins=["*"]`（`:235`）。
- `computer-use-server/static/preview.js:202` HTML、`:401` DOCX、`:415` XLSX（`:435` 明确 `editable: false`）、`:451` PPTX。同文件包含 BrowserView、TerminalView、3 秒前台/15 秒后台轮询（`:1424-1441`），变更检测以 `f.modified`（mtime）为键（`:1350-1367`）。
- `openwebui/functions/computer_link_filter.py:469-473` 是预览链接触发点（文件链接或浏览器工具记录两个条件）；`:453` 仅为 URL 模式定义。
- `openwebui/tools/computer_use_tools.py:_run_tool`（`:532`）是工具完成通知的集中接入点；`event_emitter` 可能为 None（`:568-573` 提前返回）。
- WebUI `src/lib/utils/index.ts:getCodeBlockContents` 原生支持 HTML/CSS/JS，但不识别 OCU 预览链接。
- WebUI `src/lib/components/chat/Chat.svelte:getContents`（`:1927-1979`）写入 artifactContents；`Artifacts.svelte:236-262` 使用 srcdoc 与可由用户设置改动的 iframe sandbox。
- WebUI `backend/open_webui/models/chats.py:get_chat_by_id_for_user`（`:1756-1789`）包含共享聊天/文件夹只读访问与 admin 访问，不能直接等同于执行授权；`is_chat_owner`（`:1791-1800`）是现成的所有者谓词。
- 历史 `fix_preview_url_detection.py` 和 `fix_artifacts_auto_show.py` 可用 `git show 955afc5:openwebui/patches/<文件>` 阅读；只参考行为，不恢复 minified JS 替换流水线。当前 fork 源码中无对应替代提交，A2 须以源码提交重新实现消息内预览链接识别（或明确保留为普通链接，见 §4）。
- 容器身份即 chat_id：容器名 `owui-chat-{chat_id}`、卷 `chat-{chat_id}-workspace`、host 目录 `BASE_DATA_DIR/{chat_id}/{uploads,outputs}`（`docker_manager.py:557-566,664-669`；`app.py:493,557,601`）。产物 outputs 是 host bind mount，orchestrator 与 sandbox 同时可见（`docker_manager.py:724`）。因此**不引入 workspace_id**：工作区一律以 chat_id 为键，不做第二层间接。
- 现有部署 overlay（`deploy/production-like-test/`）：决策 11 与 `patches/private-sandbox-port-bindings.patch` 已把 sandbox 的 CDP/ttyd 动态端口只发布到私有网桥 gateway（`NETWORK-HARDENING.md:8`），orchestrator 通过 gateway 地址反代；`NETWORK-HARDENING.md:18` 已要求 WebUI 置于内网反向代理之后；`compose.webui.override.yml:10,56` 已为 WebUI 提供 PostgreSQL；`retention/stop-overage.sh:4` 自述"后续 MCP 请求会重启已停止沙箱"。
- 沙箱空闲自杀定时器在容器内以 `sleep N && kill 1` 实现（`docker_manager.py:919`），`_execute_bash` 用 `timeout` 包裹命令（`:933`）；两者都是内核定时器，cgroup 冻结期间照常计时。

## 实现设计

### 1. 工作区描述与权限

在 WebUI 新增后端路由模块 `backend/open_webui/routers/ocu_workspaces.py`、模型/迁移（Alembic，遵循 `migrations/versions` 现有模式，启动时自动 upgrade）和权限服务；在 `main.py` 按现有 `include_router` 模式注册。以下路径与字段均为拟新增契约：

- `GET /api/v1/ocu/workspaces/{chat_id}`：返回 chat_id、状态、capabilities、产物 revision、可用视图；不因 GET 创建 sandbox（现状即满足：OCU 仅工具调用创建容器）。
- `POST /api/v1/ocu/workspaces/{chat_id}/launch`：校验权限后恢复或启动沙箱（唯一允许启动已停止沙箱的入口）。
- `POST /api/v1/ocu/workspaces/{chat_id}/refresh`：受限频率刷新产物目录，仅获取元数据，不送入 LLM。
- `GET /api/v1/ocu/auth`（内部，供反代 `auth_request` 调用）：从 WebUI 会话取 user，从反代按路由提取并注入的 `X-Chat-Id` 请求头取 chat_id（不解析 URI，避免 nginx `X-Original-URI` / Caddy `X-Forwarded-Uri` 差异），仅回答 `is_chat_owner`。**只返回 200/401/403**（nginx `auth_request` 把其他状态当 500），反代把 403 映射为 404（`error_page 403 =404` 或 Caddy 等价）。200 时以响应头 `X-User-Id`、`X-User-Email` 带出身份，反代用 `auth_request_set`/`copy_headers` 复制到上游请求头；不返回正文，不产生副作用。
- 工作区键即 chat_id，无独立 workspace 表；WebUI 侧只需持久化 per-chat 的 revision 游标与 UI 偏好（可放 chat.meta，或一张 `ocu_chat_state(chat_id PK, revision, prefs)` 小表）。所有者永远是 `Chat.user_id`，不另存所有者列，不按客户端传入 email 授权。
- 文件元数据使用稳定 file_id、相对路径、大小、类型、mtime_ns、revision、内容哈希；mtime 不单独充当身份或并发版本号（可被 `touch -r`/`cp -p`/tar 恢复，且不能排序两个版本）。

**授权谓词（点名，禁止替换）**：一律使用 `Chats.is_chat_owner(chat_id, user.id)`。禁止使用 `get_chat_by_id_for_user`、文件夹读授权、`AccessGrants(shared_chat, read)` 推导工作区权限；admin、共享聊天、共享文件夹、公开链接一律 404。未登录 401；已授权但动作不允许 403；未授权和不存在统一 404。

**chat_id 合法性（OCU 侧 fail-closed）**：OCU 拒绝 `chat_id ∈ {"", "default"}` 及 `temporary:`/`local:`/`channel:` 前缀；拒绝无内部令牌头的请求（OCU 无法观察反代是否做过 `auth_request`，只能校验令牌）。WebUI 路由复用 `utils/chat_id.py:is_saved_chat_id()`。现状依据：所有工具包装器把空 chat_id 强制为 `"default"`（`computer_use_tools.py:566,613,643,672,699,738`），外部 `/api/v1/chat/completions` 与 automation 可合法缺少 chat_id（`middleware.py:2365-2368`），而 `default` 是真实共享容器。

**file_id 机制（首版从简）**：broker/描述服务维护 path→file_id 与 (size+SHA-256)→file_id 两张索引；对账时先按路径匹配，路径未命中且存在 (size+hash) 匹配时判定为改名并延续 file_id，否则分配新 id。哈希仅在疑似改名（删除与新建成对出现且 size 相同）时计算，不做全量哈希扫描。删除保留 tombstone，路径复用不得继承旧 file_id 的权限与历史。

**停止语义**：把"启动已停止沙箱"从 `_get_or_create_container` 的 get-or-start（`docker_manager.py:567-575`）中拆出；沙箱停止后只读文件仍可读，恢复执行必须经有权限的显式 launch；retention-guard 停止 168h 容器后，任何工具调用（含只读 `view`）不得隐式重启。容器的 get/create/start 统一经 OCU 进程内 per-chat 锁：**一把 `threading.Lock`，键为 chat_id**，在线程内获取（`_get_or_create_container` 是同步函数、经 `asyncio.to_thread`/MCP 线程调用，broker 提交也是线程内文件 I/O；同一资源不能混用 asyncio 与 threading 两种锁）。Plan 2 的提交围栏复用同一把锁。

每个 HTTP 动作、文件下载和 WebSocket 握手都检查 chat 绑定和动作范围。连接存活期间定期检查撤权/到期并关闭连接。新聊天先持久化真实 Chat ID，再初始化工作区；临时聊天禁用 OCU（临时 id 按 socket 生成，本身无法对应稳定沙箱）。

### 2. 工作区接入与隔离（LAN 同源外部反代方案）

LAN 下不引入独立域名与票据兑换。**拓扑：同源外部反向代理**——`NETWORK-HARDENING.md:18` 已要求 WebUI 置于内网反代之后，本计划复用它：nginx/Caddy 同时代理 WebUI 与 `/ocu/` 前缀，`/ocu/*` 每个请求（含 WebSocket 握手）先经 `auth_request` 调用 WebUI 的 `GET /api/v1/ocu/auth`（§1），通过后才转发到 OCU，并在转发时附加内部令牌头（共享密钥，仅内网服务持有）与服务端注入的 `X-User-Email`。**WebUI 进程内不实现 HTTP/WS 代理**；WebUI 新增的只有授权端点和描述/launch/refresh 路由。浏览器仅持有 WebUI 会话。

- 反代为 **default-deny**：只有下表列出的路径前缀被代理，其余一律 404；表格即 allowlist，漏项默认安全。
- 工具路径一并收口：`computer_use_tools.py` 的 `Valves.ORCHESTRATOR_URL` 与上传路径（`:770-828`，`:816` 当前无凭证直连）改为携带内部令牌直连 OCU 内网地址（工具在 WebUI 服务端执行，不经反代）；OCU 拒绝无内部令牌的 `X-Chat-Id`/`X-User-Email`（当前直接信任，`mcp_tools.py:1296-1305`）。email 仅由 WebUI 服务端 `__user__` 注入，OCU 不自行采信客户端头。
- **沙箱网络隔离（防提示注入，必做）**：沿用 overlay 已有路线——sandbox 仅接入独立沙箱 bridge（**不能用 `internal: true`**：Agent 需要出站上网浏览，且 internal 网络不支持端口发布），orchestrator **不加入**该网络；CDP/ttyd 动态端口按决策 11 与 `private-sandbox-port-bindings.patch` 只发布到该网桥 gateway 地址，orchestrator 经 gateway 地址反代。控制面隔离靠主机防火墙：在 `DOCKER-USER` 链对源为沙箱网段、目的为 OCU/WebUI/反代所在 compose 网段（`ocu-test-private`）、Docker socket 所在主机地址及元数据地址的流量 DROP，出站其余按 `NETWORK-HARDENING.md:20` allowlist。同时删除 `docker_manager.py:775-782` 把 sandbox 接入 compose 网络（`_get_compose_network_name`）的逻辑，否则沙箱与控制面同 L2，DROP 规则形同虚设。这样沙箱到控制面在 L3 即不可达。OCU 应用层再加来源网段判定（来自沙箱网段一律拒绝），此时才真正是纵深而非唯一控制。现状：所有 sandbox 与 orchestrator 同网（`docker_manager.py:775-782`），除 `/mcp`、`/api/skill-stats` 外端点无鉴权，沙箱内可直接读写任意聊天文件与终端。
- **生成内容隔离——三种打开方式全部覆盖**：
  1. 侧栏内嵌：模型生成的 HTML/SVG 放入无 allow-same-origin 的 sandboxed iframe（opaque origin），禁止访问工作区 cookie/API。
  2. **顶层导航/新标签**（filter 追加的文件链接 `computer_link_filter.py:453`、模型自贴链接、用户手输 URL）：反代对 `/ocu/files/{chat_id}/*` 响应中 `Content-Type` 属于 `text/html`、`image/svg+xml`、`application/xhtml+xml`、`text/xml`/`application/xml` 的，**强制追加** `Content-Security-Policy: sandbox allow-scripts allow-forms`（明确不含 `allow-same-origin`，页面仍可跑 JS 但 origin 为 opaque）与 `X-Content-Type-Options: nosniff`，并去掉 OCU 自带 CSP；侧栏 iframe 亦从该路径加载，属性一致。`?download=1` 路径保持 attachment。OCU 侧同步在 `app.py:583-588` 加同样响应头，作为反代漏配的纵深。
  3. 可信 OCU SPA（`/preview`）由专用 iframe `src` 加载，**固定** sandbox 属性（`allow-scripts allow-same-origin allow-forms`）与专用 CSP——不得沿用 `$settings.iframeSandbox*`（用户可改，`Artifacts.svelte:254-262`）或 `injectCsp` 配置。
  - 反代对所有变更类请求校验 `Origin`/`Sec-Fetch-Site` 并要求自定义头，拒绝 `Origin: null`——同源部署下 SameSite cookie 不拦截模型生成页面发起的 no-cors 简单请求。
- **端点 allowlist**（反代按表代理，未列出即 404；所有项均先过 `auth_request`）：
  - 只读、chat 绑定：`/api/outputs/{chat_id}`、`/api/uploads/{chat_id}/manifest|list`、`/files/{chat_id}/*`（含 archive，按上条加头）、`/preview/{chat_id}`、`/browser/{chat_id}/status|json|json/version`、`/terminal/{chat_id}/status`；
  - 变更型 GET（需显式决策）：`/terminal/{chat_id}/heartbeat`（重置自杀定时器；只在已认证会话内由 SPA 调用）、`/terminal/{chat_id}/sessions|processes`（在容器内执行命令）；
  - 执行/写：上传 POST、`/terminal/{chat_id}/*` 的 start-ttyd/stop-ttyd/restart-container/resurrect-container、processes/{pid}/kill、CDP WS、ttyd WS；restart/resurrect 受 §1 停止语义与 per-chat 锁约束；
  - 身份相关只读（须绑定 user，不得公开）：`/system-prompt`、`/skill-list`、`/skill-mounts`（按 user_email 返回技能与主机路径），反代注入 email 后转发；
  - **不代理**（仅内网服务间或运维访问）：`/`、`/health`、`/mcp`、`/mcp-info`、`/api/skill-stats`、`/api/runtime/cli`。SPA 若需 `/api/runtime/cli` 的 CLI 徽标，改由 WebUI 描述接口下发，不直接暴露该端点。
- 静态相对资源使用受限资源地址/重写器提供，只读范围不含终端或浏览器控制。禁止通配 CORS 带凭据访问（当前 OCU 为 `allow_origins=["*"]`，`app.py:235`；反代收口后 OCU 同步改为仅允许 WebUI origin）。

### 3. 专用侧栏与生命周期

WebUI 拟新增 `src/lib/components/chat/WorkspaceArtifact.svelte`、`src/lib/apis/ocu/index.ts` 和**新的 chat 键控 store**（仿 `chatRequestQueues`，`stores/index.ts:121-123`）。**不得复用 `artifactContents`**——它在流式过程中被消息文本整体重写（`Chat.svelte:1927-1979`），会导致工作区 iframe 每 token 重建。

- 挂载点：`ChatControls.svelte` 现有面板分支（`:219-220`、`:342-343`）、`closeHandler`（`:184-187`）、`specialPanel`（`:192`）四处；原生 `Artifacts.svelte` 只做必要的共存协调。
- 拆卸复用现有机制：`Chat.svelte:4251` 的 `{#if !loading}` 在切聊天时卸载整个 ChatControls 子树——不再另造第二套拆卸；仅在工作区绑定原地变化时用 `{#key}`。普通消息更新不触碰 `loading`，天然满足"不重建 iframe、保留终端连接/滚动位置/选中项"。迟到响应用 generation 丢弃。
- 状态：unavailable → loading → ready/empty/error；运行状态另有 stopped/disconnected，不以白屏替代错误。工作区状态以 chat_id 为键，保存打开偏好、选中 Files/Browser/Terminal、选中文件和 revision；持久化 UI 偏好不保存凭据。
- 显式"工作区"按钮随能力可用而出现；无产物也能进入终端/浏览器。首次有工作区/新产物时自动打开一次；用户关闭后，普通轮询不得强制打开。
- 历史聊天加载从后端描述恢复，不依赖旧 SSE 事件或再次执行 outlet。沙箱停止后仍可读持久化文件；不因查看旧聊天自动开机（见 §1 停止语义）。

### 4. 产物触发

在 `_run_tool` 完成后发出拟新增 `ocu:workspace_changed` 通知，负载仅 `{chat_id, reason}`：通知是刷新提示，前端收到后重新访问授权 API；revision 一律以授权 GET 为准，事件永不作为权威来源（`_run_tool` 无 DB 会话，也拿不到 revision）。

- **前端处理器位置（点名）**：放在 `Chat.svelte:1204-1207` 的 `chat:reload` 旁、`history.messages[event.message_id]` 闸门（`:1207-1209`）之前——否则无对应 message 的事件被静默丢弃。处理器只写 chat 键控脏标记；用户在别的聊天时不强制刷新，切回时按脏标记对账。
- `event_emitter` 可能为 None（automation/外部 API 路径，`middleware.py:3127-3128`）——轮询与页面重连完整对账是正确性路径，事件丢失可接受。
- 后端只接受来自可信工具执行链的通知（服务端 socket room 直发，浏览器无法伪造，`socket/main.py:1062-1083`）。
- 目录枚举支持数量/大小限制、分页、无变化快速返回；`revision` 随每次内容变化单调递增，事件乱序以 revision/请求 generation 消歧。preview.js 的变更检测从 `f.modified` 迁移到 `path + revision`。
- 旧 Markdown 链接保留为兼容入口，但只识别已配置来源、当前 chat 绑定，最终由后端授权；不嵌入任意模型输出 URL。A2 须以源码提交重新实现消息内预览链接识别（fork 当前无此能力，见"已核对源码"）。内外网地址仅由服务端配置决定。

## 工作包与依赖

| 顺序 | 改动位置                                                                                                                                                                                                                                                    | 可独立验收的交付                                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A1   | WebUI 新路由（描述/launch/refresh/auth）与 per-chat 状态持久化（含迁移，若采用新表）；反代 allowlist + `auth_request` + 生成内容响应头；OCU 内部令牌校验、chat_id 拒绝规则、来源网段限制、per-chat 锁与停止语义、`/files/*` 响应头、CORS 收紧、上传路径收口 | 两用户能取得自己的描述，全部跨用户请求 404；直接 OCU 入口与沙箱内访问控制面均不可达；顶层打开生成 HTML 读不到 WebUI token |
| A2   | WorkspaceArtifact、ChatControls/Chat/store；preview.js/browser-viewer.js 地址适配；消息内预览链接识别                                                                                                                                                       | 静态测试产物可在侧栏打开，HTML 与可信应用隔离；WebSocket 工作                                                             |
| A3   | OCU tool `_run_tool`、WebUI 事件处理（闸门前）、revision/轮询                                                                                                                                                                                               | 无模型链接也能显示新产物；修改刷新、断线补偿和历史恢复通过                                                                |
| A4   | 部署 overlay（独立沙箱 bridge + DOCKER-USER 阻断规则 + gateway 端口绑定、反代配置、retention-guard、备份含 per-chat 状态）、镜像构建、初始化脚本和文档                                                                                                      | 固定版本启动、RAG 保留、普通 Bash、168h 停止保留数据且不被工具调用隐式重启；离线物料可用                                  |
| A5   | 后端测试、前端 Vitest、Cypress/浏览器 E2E                                                                                                                                                                                                                   | 下表全部通过并存证，生成版本清单和回滚手册                                                                                |

只在独立 WebUI checkout 构建源码镜像；OCU 实施使用新 codex 分支并保留现有未跟踪文件。不得通过恢复已删除目录绕过 OCU 结构测试。构建依赖用 lockfile，镜像固定 digest，记录 Git SHA、构建参数、静态资源版本。构建时的 Pyodide/npm/Python 获取需纳入离线包；运行期禁用外部 CDN、自动模型下载及更新。

## 验收矩阵

所有样例先用确定性夹具覆盖，再用真实模型跑一次完整工作流。表格是必测集合，不代表测试已经执行。LAN 裁剪：跨用户用例为授权拒绝冒烟，不做渗透对抗。

| ID    | 场景与操作                                                                                                                                                                                       | 通过标准                                                                                                                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A-T01 | HTML 含按钮、JS、相对 CSS/图片，修改后刷新；`iframeSandboxAllowSameOrigin=true`；**同一文件分别经侧栏 iframe、点击消息内链接顶层打开、新标签直接输入 `/ocu/files/...` URL、SVG 内嵌 `<script>`** | 可交互、资源齐全、旧缓存不残留；三种打开方式下生成页面均读不到 WebUI token/localStorage、调不到执行 API、`document.origin` 为 opaque；响应带 `CSP: sandbox allow-scripts allow-forms` 与 `nosniff`，页面内 JS 仍可执行                                                                     |
| A-T02 | DOCX 中文、标题、表格；Agent 修改后复读                                                                                                                                                          | 内容正确更新，明确为内容预览，不承诺 Word 分页一致                                                                                                                                                                                                                                         |
| A-T03 | XLSX 多 sheet、公式缓存值、中文；Agent 修改                                                                                                                                                      | sheet 切换和新值正确；不静默将无缓存公式当作已计算                                                                                                                                                                                                                                         |
| A-T04 | PPTX 多页、不同尺寸、图表/图片；Agent 修改                                                                                                                                                       | 每页可查看，错误有下载回退；记录渲染兼容差异而不宣称像素一致                                                                                                                                                                                                                               |
| A-T05 | 浏览器导航、输入、画面更新；终端输入/resize/reconnect                                                                                                                                            | 实际双向交互成功，断线可恢复，无需暴露动态端口                                                                                                                                                                                                                                             |
| A-T06 | WebUI/OCU 重启后打开历史聊天                                                                                                                                                                     | 文件、工作区绑定仍在；不依赖旧消息事件，不意外创建 sandbox                                                                                                                                                                                                                                 |
| A-T07 | A/B 聊天快速切换，A 请求迟到，反复开关侧栏；A 在后台产生产物                                                                                                                                     | 无串文件/画面/终端；切回 A 按脏标记自动对账；关闭后轮询不抢焦点；无泄漏连接                                                                                                                                                                                                                |
| A-T08 | 授权冒烟：用户 B 取 A 的 chat/file/ws，匿名、分享链接、admin、文件夹读授权用户访问                                                                                                               | 描述、launch、refresh、预览、下载、归档、上传、CDP、terminal、进程操作全部 404/401；`/system-prompt`、`/skill-list`、`/skill-mounts` 不跨用户暴露；`/api/runtime/cli`、`/mcp-info`、`/health`、`/api/skill-stats` 经反代 404；沙箱内 `curl` OCU/WebUI 控制面在 L3 不可达（非仅应用层 403） |
| A-T09 | 登出/撤权时已有 WS；内部令牌缺失或错误                                                                                                                                                           | 撤权及时关闭；无令牌请求拒绝；凭据不出现在聊天、Referer 和普通日志                                                                                                                                                                                                                         |
| A-T10 | 空目录、超大目录、删除/改名、损坏 Office、服务不可达                                                                                                                                             | 有明确空态/失败/分页及重试；改名延续 file_id、路径复用不继承旧 id；当前文件消失不崩溃                                                                                                                                                                                                      |
| A-T11 | Agent 不输出链接、命令失败但产生文件、后台写文件；`event_emitter=None` 路径                                                                                                                      | 产物均能对账；不把通知失败当作工具成功/失败的替代证据                                                                                                                                                                                                                                      |
| A-T12 | 临时聊天、`channel:`/`local:` id、无 chat_id 的 completion/automation、分支/复制聊天、删除聊天                                                                                                   | 非保存 id 拒绝 OCU；不创建/不复用 `default` 容器；新 chat 不继承旧工作区授权；删除解除访问但按保留策略留数据                                                                                                                                                                               |
| A-T13 | RAG 问答、原生 HTML/SVG Artifact、普通模型聊天                                                                                                                                                   | 原有能力无回归，不启用全局跳过 RAG 补丁                                                                                                                                                                                                                                                    |
| A-T14 | 阻断公网、替换内网模型、重启                                                                                                                                                                     | HTML/Office/字体/终端/浏览器本地夹具可用；Draw.io 如启用须将现有 CDN 本地化                                                                                                                                                                                                                |
| A-T15 | 达到 168h、备份恢复、镜像回滚；停止后发消息/只读 view                                                                                                                                            | 仅停止 sandbox、卷保留；停止后工具调用不隐式重启，须显式 launch；数据库+文件共同恢复，回滚后权限不放宽                                                                                                                                                                                     |

## 验证、发布与回滚

WebUI 使用仓库现有 Vitest、Cypress、后端测试框架，增加权限/迁移测试和侧栏状态测试；OCU 增加过滤器、工具通知、HTTP/WS 权限和目录 revision 测试。Python 使用 uv/venv。先安装锁定依赖并跑未修改基线，记录已有失败；实施后逐工作包测试，最终跑集成矩阵与前端构建。截图必须来自普通用户真实浏览器，不能以构建成功替代界面验收。

上线前保存数据库、文件和配置的一致性备份，新增表采用兼容迁移；功能开关可关闭工作区入口，但关闭不得重新暴露无鉴权 OCU。回滚固定旧镜像和兼容 schema，保留产物、revision 与用户绑定。旧的不安全直连入口不作为回滚路径。

尚待实施阶段实测：iframe/模块脚本策略、工具事件与 WebUI output 结构兼容性、Office 渲染保真度、LAN 服务器实际容量。版本固定是复现基线，不代表该旧版本已经获得新的生产适用性结论。
