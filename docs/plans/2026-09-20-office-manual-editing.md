# Plan 2：内嵌 Office 手工编辑与保存

状态：待实施的技术计划；2026-09-20 按源码审核修订（第二轮：删除 put_archive 写入者、补容器启动与提交围栏的 TOCTOU 锁、修正冻结期定时器说明、明确复用 overlay 已有 PostgreSQL、修正容量出处）。信任模型与 [Plan 1](2026-09-20-workspace-artifact-integration.md) 一致（局域网受信部署）。依赖 Plan 1 的工作区授权、侧栏和文件标识。编辑器选型为建议，尚未做部署验证。

## 目标

用户在工作区侧栏/全屏中打开 DOCX、XLSX、PPTX，直接修改内容并保存；保存后的原生文件可下载、可被 Agent 读取和继续修改，历史版本可恢复。明确展示未保存、保存中、已保存、冲突和失败状态。HTML 交互预览沿用 Plan 1。

首版三种 OOXML 格式都交付；不承诺 VBA、宏、旧二进制 doc/xls/ppt、任意 Office 插件或复杂排版完全保真。其他格式保留只读/下载入口，损坏或不支持的文件给出明确说明。

## 信任模型与裁剪（LAN）

与 Plan 1 相同：受信员工、无公网暴露。本计划的冲突/协调机制（fence、revision 比较、幂等回调）是**数据正确性机制，不是防员工机制**，不因 LAN 裁剪。跨用户共同编辑首版不开放，跨用户用例为授权拒绝冒烟。保留的对抗面只有一个：Agent 可被网页/文档提示注入，因此提交路径的符号链接防护与沙箱写入围栏保留。

## 候选与代码准备

建议 ONLYOFFICE Docs：有文档、表格、演示文稿编辑器及统一 JS API/保存回调，集成工作集中在存储和权限。Collabora Online 是备选，改选后需实现 WOPI 文件、锁与保存协议，不能共用 ONLYOFFICE 回调契约。不使用 Mammoth/SheetJS 的预览 HTML 冒充 Office 编辑器。

| 仓库                      | 固定基线与目录                                                                                                             | 用途                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| WebUI / OCU               | 同 Plan 1；文中 OCU 相对路径均相对 OCU 目录                                                                                | 前端入口、授权、版本管理、文件提交          |
| ONLYOFFICE/DocumentServer | `v9.4.0` / `fb73d33c85f59d1a5d2e5a5ed05388ebc2418337`；`/Users/danker/Documents/31308/onlyoffice-documentserver-reference` | 顶层仓库及 Git 子模块版本索引，用作集成参考 |

DocumentServer 子模块未初始化，不是完整可编译的编辑器源码包。当前阶段无需修改编辑器内核；实施先验证同版本发布镜像并固定 digest。若改为从源码构建，必须按该提交递归拉取 core/sdkjs/server/web-apps 等子模块及构建依赖，再记录完整 manifest。当前 tag 仅候选基线，不宣称最新或已验收。

许可证和容量按选定版本核对：此 checkout 的 Readme 列出社区版最多 20 个同时连接，不能把 20 员工等同于 20 连接，也不能以其他版本新闻替代发行物验证。实施前核对该版 LICENSE、部署用途、编辑标签页计数和厂商条款；若限制不适配，明确采用合适发行版或重新评估 Collabora，不修改限制绕过授权。保留品牌与许可证文件。

容量事实（2026-09-20 审核修正）：测试 VPS 记录值为 **4 vCPU / 7.4 GiB RAM / 33 GiB 可用根磁盘**，sandbox 预算 2×(1 CPU/2 GiB)（`docs/decisions/2026-09-15-…:30,43`）。DocumentServer 官方 Docker 最低要求 **RAM ≥ 4 GB、空闲磁盘 ≥ 40 GB、swap ≥ 4 GB**（出处是 ONLYOFFICE/Docker-DocumentServer 仓库 README，**不在**本机 `onlyoffice-documentserver-reference` checkout 内；本机 README:76 只确认社区版"最多 20 个同时连接"），且镜像自带 PostgreSQL/RabbitMQ/Redis（DS 内部使用，与 broker 元数据库无关）。B1 必须将官方最低值与部署机实测余量并列记录；不满足则先扩容或减 sandbox 预算，不以 PoC 证明容量。

## 关键设计

### 1. 持久化文件版本

新增 Office broker，**作为 OCU 服务的进程内模块** `office/`（OCU 已持有 docker.sock，不新增 socket 持有者；fence/commit 接口仅内部可达；与 `_get_or_create_container` 共享 Plan 1 §1 的 per-chat 锁），浏览器侧请求经 Plan 1 的反代 `auth_request` 授权。业务元数据存 **overlay 已有的 PostgreSQL 实例**（`compose.webui.override.yml:10,56`，WebUI 在用），为 broker 建独立 database/账号，不新起实例、不用 DS 自带的 Postgres；迁移用一次性 job，仿同文件的 `open-webui-init` job 模式。文件与版本放持久化存储。

**可编辑根（首版明确限定）**：仅 `${OCU_CHAT_DATA_DIR}/{chat_id}/outputs`（host bind mount，sandbox rw、orchestrator 同路径可见，`docker_manager.py:667-669,724`）。`/mnt/user-data/uploads`（host 侧由上传端点写入）与 `/home/assistant`（命名卷，无稳定 host 路径）为明确非目标，计划文档与 UI 均不提供其编辑入口。

- Document：document_id、file_id（沿用 Plan 1 的 path/hash 双索引机制）、chat_id、相对路径（相对 outputs 根）、类型、current_revision、内容哈希。
- Revision：revision_id、父版本、SHA-256、大小、存储对象、作者/来源、时间；历史不可原地改写。
- EditSession：session_id、document_id、base_revision、editor_key、**save_seq、last_committed_seq**、参与者、状态、访问撤销状态。
- SaveReceipt：会话、**save_seq**、事件摘要、内容哈希、提交 revision、结果；用于回调幂等与重试。

新文件、同名替换、改名与删除按 Plan 1 §1 的 file_id 机制更新元数据，不靠路径或 mtime 充当身份。版本 API 返回 ETag，提交以 base_revision 做比较更新；历史恢复生成新版本并记录来源，不覆盖审计历史。版本数据默认不自动删除，设磁盘监控与写入前容量检查。**版本库存放在现有备份集内**（`deploy_root/data/...`）或同步扩展 `backup-test.sh`/`RESTORE.md` 覆盖；增加 `restore_epoch` 栅栏，broker 启动恢复拒绝重放早于最近一次恢复的 pending commit。

### 2. 拟新增接口

以下由 OCU 内部公开，浏览器可达的经 Plan 1 反代 allowlist（`/ocu/office/*`）并先过 `auth_request`；内部/fence 类接口不进 allowlist，仅服务端间可达：

| 接口                                        | 职责                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| POST `/office/documents/{file_id}/sessions` | 验证用户编辑权限、文件类型和 revision；签发编辑配置与 session_id                          |
| GET `/office/sessions/{id}/status`          | 返回持久化保存状态和 revision，不依赖浏览器本地状态                                       |
| POST `/office/sessions/{id}/save`           | 发起 forcesave 并分配 save_seq；只表示已受理，不立即显示"已保存"                          |
| POST `/office/sessions/{id}/close`          | 发起关闭/交接；按 status-2 延迟预算（实测约 10-15 秒，B1 验证）等待最终提交或保留恢复记录 |
| GET `/office/documents/{id}/revisions`      | 列历史版本，权限与文件一致                                                                |
| POST `/office/documents/{id}/restore`       | 基于 expected_revision 恢复为新版本                                                       |
| 内部 GET `/office/source/{ticket}`          | 编辑器获取特定版本的文件；短期、限定 document/session/action                              |
| 内部 POST `/office/callback/{session_id}`   | 验证编辑器 JWT、会话、save_seq 和事件，下载及提交修改文件                                 |
| 内部 POST `/office/fence/{chat_id}`         | 提交窗口的写入围栏（见 §4）；仅 broker 调用                                               |

浏览器配置由服务端签名；模型 API key、MCP key、JWT 签名密钥不进入前端。文件获取、command service、callback 使用服务器间可达地址，不能使用浏览器的 localhost 地址。

### 3. 编辑与保存状态机

opening → editing → save_requested → saving → saved/editing；最后关闭进入 closing → closed。另有 error、conflict、revoked、**orphaned**（编辑器侧状态丢失，重开须按 §3 key 规则生成新 document.key）。断线保留可恢复的会话记录。UI 区分"已存入编辑器"（persist）和"已提交工作区文件"（publish）。

ONLYOFFICE `document.key` 在同一协作编辑会话内保持稳定；forcesave 后不换 key。最终关闭并提交后，下次新会话以新 generation/revision 生成新 key。不能每次保存都生成新 key 打断编辑会话。

**persist / publish 分离**：

- **persist**：每个 status 6（forcesave）只写不可变 revision + SaveReceipt，不围栏沙箱、不改工作区文件。回调必须处理 `forcesavetype`（0 command service / 1 保存按钮 / 2 autoAssembly 或关闭触发），并显式配置 `autoAssembly`（首版建议关闭，仅显式保存与关闭触发）。
- **publish**：仅 status 2（最终关闭）或用户显式"保存到工作区"触发，经 §4 的 fence 窗口原子提交。publish 按 chat_id 排队去抖。

**排序规则**：broker 在发起 forcesave/close 时递增 `save_seq` 并记入 SaveReceipt；任何回调 `save_seq` 低于 `last_committed_seq` 时拒绝或隔离，绝不回退版本。重复事件按 (save_seq + 内容哈希) 幂等返回相同结果。启用 DS history 时以 `serverVersion` 做决胜。

回调状态处理：1 更新参与者；2 publish 最终提交；3 记录最终保存失败；4 无修改关闭；6 persist 并保持会话；7 记录 forcesave 失败。未知状态不修改文件，记录可诊断错误。

保存过程：验证回调 → 限定编辑器服务来源下载 → 检查文件大小/类型/OOXML 结构和 SHA → 暂存并 fsync → revision/save_seq 比较 → 写入不可变版本与提交意图 → fence 窗口内原子替换工作区文件 → 完成数据库提交记录 → 解除围栏并发送产物更新通知。数据库与文件系统不能假定单事务；使用提交日志和启动恢复任务处理任一步骤崩溃。

下载仅允许已配置编辑服务器 origin，验证重定向每一跳、超时、大小限制；拒绝回调提供的任意 URL。确认数据已持久化或已可靠记录重试任务后，才按编辑器协议确认成功；响应丢失导致的重试必须幂等。

### 4. 手工编辑与 Agent 写入的协调

不能仅在 `create_file`/`str_replace` 加锁：Agent 的 bash、后台进程和交互终端都能直接写挂载目录。现状 outputs 写入者矩阵（审核确认）：sandbox 内进程（exec/bash/ttyd/CDP，pause 可冻结）；**容器启动本身**（`_get_or_create_container` 在任何工具调用时自动 start 已退出容器，`docker_manager.py:567-575`，启动后沙箱内进程即可写）；带外运维（cleanup cron、RESTORE.md 整树恢复——须检查 commit 租约）。**不是** outputs 写入者、无需围栏：dockerd 侧 `put_archive` 只在容器创建时向 workdir 写 README.md（`docker_manager.py:824,853-877`），从不写 outputs；host 侧上传端点只写 uploads。

首版采用独立编辑副本 + revision 比较提交：

1. 编辑器从确定版本创建独立工作副本，用户编辑期间 Agent 可以生成其他文件。
2. 保存时若原文件版本/哈希已变化，保存为待解决版本并显示冲突；绝不最后写入者覆盖。**路径已消失/被替换时不复活旧路径**：保留用户内容为冲突版本，UI 提供"另存为新文件/覆盖已移动文件"。
3. **fence 三态规则**（替代"暂停失败即提交失败"）：
   - 容器存在且运行：定位 → `pause` → `container.reload()` 验证 `State.Paused` → 提交 → `unpause`；暂停失败则提交失败，不降级覆盖。
   - 容器不存在或已停止：**在 per-chat 锁内**检查状态并完成提交（常见路径——沙箱空闲自杀定时器默认 600s，长编辑会话期间容器通常已停止）。锁与 `_get_or_create_container`/launch/restart/resurrect 共用（Plan 1 §1），否则"检查已停止"到 `os.replace` 之间任一工具调用都会启动沙箱并写文件（TOCTOU）。持锁期间到达的启动请求排队等待提交完成，不拒绝。
   - pause 不可用（rootless cgroup 限制、Kata/gVisor 等运行时）：降级为 stop → commit → start（复用现有 restart/resurrect 路径）。
4. fence 窗口约束：提交前等待在途 `docker exec` 完成或取消（持 per-chat 锁即可，新 exec 会排队）。注意冻结期间内核定时器照常计时：`_execute_bash` 的 `timeout`（`docker_manager.py:933`）和自杀定时器 `sleep N && kill 1`（`:919`）会在解冻瞬间触发，所以 fence 窗口必须短（目标 < 1s，只做 lstat + os.replace + fsync），**pause 之前**先重置自杀定时器（`_reset_shutdown_timer` 是 `exec_run`，冻结后无法执行），超过 5s 的 pause 视为失败并 unpause；窗口内禁止 restart/resurrect/kill 与容器启动（同锁）；**OCU 侧看门狗按租约心跳兜底 unpause**（broker 崩溃不得永久冻结沙箱）；retention-guard/cleanup/restore 检查 commit 租约，避让在途提交。多个提交按 workspace 排队。文件系统 watcher 只能辅助探测，不能当作锁；解冻后持有旧 fd 的进程写入已 unlink inode 的，由下一次哈希对账登记为未管理 revision，不静默丢失。
5. **提交路径符号链接防护**（防提示注入，保留）：暂存文件用 `O_CREAT|O_EXCL|O_NOFOLLOW` 在目标目录内创建（点前缀命名，对 `/api/outputs` 列表天然不可见），`os.replace` 前逐父组件 `lstat`，任一为 symlink 或解析越出本聊天 outputs 根则拒绝提交；复用 `security.safe_path` 做预检并记录其 TOCTOU 窗口。
6. 用户点击"交给 AI 继续修改"时，等待 publish 确认和编辑会话关闭，再向 Agent 传递已提交文件路径/revision。交接是**建议性**的：Agent 写路径无 revision 参数（`mcp_tools.py:541,618`），交接后首个工具调用做哈希对账，把 Agent 写入登记为新 revision；未保存和冲突状态不能宣称已交接。如需强制，须走 broker 写 API（即 L78 推迟的"正式文件区 + staging"方案），本版明确不做。

如短暂停顿不可接受，可后续替换为 broker 管理的正式文件区 + sandbox staging 的统一发布机制；这涉及修改所有写入路径与挂载，不属于简单前端替换。

同一文档可由同一有权用户的多个标签加入同一 editor_key；跨用户共同编辑需要独立显式文档共享授权，首版默认不开放，不能借聊天分享获得权限。未来启用多用户协作时，沿用同会话 key、参与者撤权和相同提交仲裁。

### 5. 前端与部署

在 OCU `preview.js` 的三种 Office 文件头部新增"编辑"入口和保存状态；只读预览保留。拟拆出 `static/office-editor.js`，由侧栏承载 DocsAPI 编辑器，可放大全屏。iframe 生命周期不随每次产物轮询重建；离开/切换聊天提示未提交状态，恢复时查服务端会话。`/api/outputs` 与侧栏变更检测迁移到 `path + revision`（mtime 仅作展示），`/files/*` 加内容哈希派生 ETag 或 `Cache-Control: no-store`，保证"改后预览/编辑器不返回旧缓存"不依赖 mtime 巧合。

可信编辑器与生成 HTML 使用不同权限与 CSP。编辑器自有 origin、frame-ancestors、JWT、WebSocket 和静态资源全部内网可达——LAN 部署下 DS 直接作为内网 origin（经 Plan 1 同一外部反代挂到独立路径前缀，或独立内网端口，实施时二选一并记录），浏览器与服务器间地址分别明确。不挂载 Docker socket 给编辑器，不直接共享整个 sandbox 文件树。**DS 是有状态服务**：挂载其数据卷，定义强制保存间隔为文档化损失上界并在 UI 呈现；DS 重启/替换后未 persist 内容按损失上界处理，会话转 orphaned。

离线包包括固定镜像、字体（核对分发许可）、字典、编辑器前端、迁移、配置模板和校验清单。中文字体与字体替换需进入保真测试。运行期不依赖公网 CDN、在线转码或外部文档服务。

## 实施顺序

| 阶段 | 交付与退出条件                                                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1   | 核对候选发行物/许可证/容量（官方最低值 vs 实测余量并列），隔离部署编辑器（含数据卷与内网 origin）；确定性三格式样例均能打开、修改、导出                   |
| B2   | broker 元数据、版本存储、JWT/文件获取/回调/幂等、save_seq 排序、persist/publish 分离；三格式均完成可靠保存，崩溃恢复测试通过                              |
| B3   | fence 三态、看门狗解冻、租约与 retention/cleanup/restore 协同、符号链接防护、冲突恢复、AI 交接对账；bash/终端后台 writer 与提交窗口内并发容器启动测试通过 |
| B4   | 编辑侧栏/全屏、状态提示（含损失上界）、聊天切换与旧会话恢复；普通用户流程通过                                                                             |
| B5   | 跨用户拒绝冒烟、离线、重启（含 DS）、压力、备份恢复（含 restore_epoch）；固定镜像与发布文档完整后交付                                                     |

Plan 1 的文件 ID/revision/授权定义是本计划的前置契约；可提前做 B1，但不能在 A1 未完成时公开编辑入口。编辑器候选发生变化时先更新本计划对应适配层、验收与物料清单。

## 验收矩阵

| ID    | 测试                                                                                                                                               | 通过标准                                                                                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-T01 | DOCX 中文、段落格式、表格、图片，编辑保存再打开                                                                                                    | 修改保留，原生 DOCX 有效；列明分页/字体差异                                                                                                                                         |
| B-T02 | XLSX 多 sheet、公式、格式、图表，改单元格保存                                                                                                      | 公式与数据保留，结果重算可核对，无静默扁平化                                                                                                                                        |
| B-T03 | PPTX 文本、图片、图形、页序/尺寸，编辑保存                                                                                                         | 原生 PPTX 可重新打开，布局差异有记录                                                                                                                                                |
| B-T04 | 保存按钮、关闭保存、无修改关闭、forcesave                                                                                                          | 正确处理 1/2/3/4/6/7 与 forcesavetype 0/1/2；status 6 只 persist；只有 publish 持久化确认才显示已保存                                                                               |
| B-T05 | 相同用户双标签同时编辑；其中一标签关闭                                                                                                             | 同会话 key 稳定；无额外旧文件覆盖                                                                                                                                                   |
| B-T06 | 手工编辑同时由 bash/后台进程/终端修改原文件；容器运行/停止/不支持 pause 三态；**容器已停止时，在提交窗口内并发发起工具调用或 launch 试图启动容器** | 冲突可见、双方版本保留；fence 三态行为正确；失败不覆盖；看门狗兜底解冻；并发启动排队到提交完成后执行，提交结果与启动后写入不互相覆盖；解冻后在途命令不被 `timeout` 误杀、容器不自杀 |
| B-T07 | 保存后让 AI 修改，再在侧栏打开；mtime 被恢复的文件修改                                                                                             | AI 读取最新 revision 并在对账后登记新 revision；预览/编辑器按 revision 刷新，不返回旧缓存                                                                                           |
| B-T08 | 重复/乱序回调（含乱序 save_seq）、超时重试、签名错误、任意下载 URL                                                                                 | 幂等、低 save_seq 拒绝或隔离、不回退版本；非法请求拒绝，失败可诊断                                                                                                                  |
| B-T09 | 授权冒烟：B 用户替换 A 的文件/session/key/历史/下载 URL                                                                                            | 所有读取、编辑、回调冒充及恢复操作被拒绝（LAN 冒烟强度）                                                                                                                            |
| B-T10 | 撤权/登出期间编辑及保存，过期票据                                                                                                                  | 禁止新操作，未提交内容按恢复策略隔离保存，不写回无权工作区                                                                                                                          |
| B-T11 | 数据库/编辑器（DS）/broker 重启、提交中断、磁盘满                                                                                                  | 文件不损坏；日志恢复事务；DS 重启损失不超过文档化上界，会话转 orphaned；失败版本可恢复，不假报成功                                                                                  |
| B-T12 | 切聊天、关侧栏、刷新网页、重开旧聊天                                                                                                               | 未保存状态有提示，已保存文件持久化，不串文档                                                                                                                                        |
| B-T13 | 损坏/超大/不支持格式、同名替换、改名删除、outputs 内符号链接                                                                                       | 明确错误或只读回退；改名延续 file_id、删除留 tombstone；符号链接提交被拒绝；不复活已消失路径                                                                                        |
| B-T14 | 历史版本恢复、整套备份还原（含版本库）                                                                                                             | 恢复生成新 revision；数据库、文件、会话与编辑器恢复信息一致；restore_epoch 阻止重放旧 pending commit                                                                                |
| B-T15 | 断公网运行、中文字体、不同浏览器；达到连接/资源上限                                                                                                | 核心编辑保存可用；容量不足排队/拒绝而非丢数据                                                                                                                                       |

测试拆为 broker 单元/集成、前端状态测试、三格式浏览器 E2E 与故障注入。回调协议测试可用受控夹具；正式验收必须连接真实编辑器，不允许只用 mock 宣告保存成功。另用独立解析器/桌面 Office 或 LibreOffice 复开导出文件，避免只在同一编辑器自证。

## 发布与回滚

发布前停止新编辑会话，等待或强制保存现有会话并核对结果；备份 metadata DB、不可变版本、工作区当前文件及编辑器可恢复缓存。Schema 采用兼容迁移。回滚关闭新编辑入口、保留只读预览和全部版本；未提交编辑不得随容器替换删除。已完成保存的文件继续可下载及供 Agent 使用。

## 官方参考

- [打开文件](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/opening-file/)
- [回调状态与格式](https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/)
- [协作会话与 document.key](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/co-editing/)
- [Command service / forcesave](https://api.onlyoffice.com/docs/docs-api/additional-api/command-service/)
- [社区版条款说明](https://helpcenter.onlyoffice.com/docs/faq/docs-community.aspx)

版本、许可证/连接限制、镜像 digest、资源上限、status-2 延迟、具体文件保真度均须在 B1 记录发行物实测结果；当前文档不把候选当作已部署事实。
