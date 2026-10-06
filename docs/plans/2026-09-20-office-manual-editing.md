# Plan 2：工作区统一与内嵌 Office 手工编辑

状态：待实施的技术计划。2026-10-01 第三次修订：Plan 1 落地后按两个仓库的现状重新核对，并经逐分支压测由用户拍板。本次修订相对第二次修订的变化见文末「修订记录」。信任模型与 [Plan 1](2026-09-20-workspace-artifact-integration.md) 一致（局域网受信部署）。编辑器选型已由用户接受，发行物实测（B1）仍是后续工作的前置门。

文中 OCU 路径相对同级检出 `open-computer-use`（`origin/main` = `9c35a8c`），WebUI 路径相对本仓库。

## 目标

1. **工作区只有一个文件夹**。用户上传的文件和 Agent 生成的文件放在同一个目录里，用户和 Agent 都能修改其中任何文件；不再有 uploads / outputs 之分。
2. **在侧栏里直接编辑 DOCX、XLSX、PPTX**。保存后的原生文件可下载，Agent 读到的就是保存后的内容；历史版本可恢复；界面明确展示未保存、保存中、已保存、冲突和失败。

HTML 交互预览与只读 Office 预览沿用 Plan 1。不承诺 VBA、宏、旧二进制 doc/xls/ppt、Office 插件或排版完全保真；其他格式保留只读/下载入口，损坏或不支持的文件给出明确说明。

## 非目标

- 跨用户共同编辑。同一用户的多个标签可以加入同一编辑会话；聊天分享不带来编辑权。
- 内容合并。冲突时只提供「另存为新文件」和「覆盖」。
- 「交给 AI 继续修改」按钮。保存即发布，用户直接对 Agent 说话即可。
- 「放弃修改」。想撤销就用历史版本恢复。
- `pause` 不可用的运行时（rootless cgroup 限制、Kata、gVisor）。部署机是 rootful Docker + cgroup v2。
- Agent 的私有临时区 `/home/assistant` 进入侧栏或可被人工编辑。
- 已有聊天数据的环境原地升级。验收机清空重来，不提供迁移工具。
- 把人工修改回写到 WebUI 自己的文件库。
- 20 人正式部署的容量设计。容量是测量项，不在本计划内规定。
- 宿主机目录名与 HTTP 接口名（`/api/outputs`、`/files`、`/api/uploads`）改名。

## 信任模型与裁剪（LAN）

与 Plan 1 相同：受信员工、无公网暴露。冲突与协调机制（fence、哈希比较、幂等回调）是**数据正确性机制，不是防员工机制**，不因 LAN 裁剪。保留的对抗面只有一个：Agent 可被网页或文档提示注入，而它能在工作区里造任意文件。因此保留三项防护：提交路径的符号链接防护、发布时的沙箱写入围栏、编辑器使用独立 origin。

## 现状事实（2026-10-01 核对）

下列事实推翻或修正了前两次修订的前提，设计以它们为准。

| 事实                                                                                                                      | 出处                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 工具调用不会启动已停止的容器；只有显式 launch（及其 restart/resurrect 别名）启动或解冻，且在 per-chat 锁内                | `computer-use-server/docker_manager.py:942-963,1691-1763`                                            |
| per-chat 锁是进程内 RLock 加 `.lifecycle.lock` 上的 flock；OCU 以两个 worker 运行，跨进程只有 flock 可用                  | `docker_manager.py:142-230`、`computer-use-server/Dockerfile:48`                                     |
| `exec`、ttyd、kill 与 WebSocket 中继都不拿锁；持锁不会让新的 exec 排队                                                    | `docker_manager.py:1257,1329,1369-1379,1461-1467`、`app.py:926-940`                                  |
| 空闲回收在宿主机侧（`.idle.json`），不再有容器内 `sleep N && kill 1`；回收器不会停止已暂停的容器；部署值为 7 天           | `docker_manager.py:1238-1245,1825-1840`、`deploy/production-like-test/scripts/bootstrap-test.sh:345` |
| OCU 没有任何 `pause()` 调用；launch 会对已暂停容器执行 `unpause()`                                                        | `docker_manager.py:1733-1742`                                                                        |
| outputs broker 只在新增和大小变化时算哈希；大小不变的原地修改不产生新 revision；没有 file_id 反查路径或登记宿主写入的接口 | `computer-use-server/outputs_broker.py:536-545`                                                      |
| 侧栏变更检测已按 `path + revision`；`/files/*` 没有显式缓存头                                                             | `static/ocu-request.js:246-276`、`app.py:739-802`                                                    |
| 反代路由表固定 22 行并带 SHA pin，首段与占位符受限，chat 授权行必须带 `{chat}`                                            | `deploy/proxy/render.py:95-124`                                                                      |
| 只允许反代发布端口，且恰好一个                                                                                            | `deploy/check-ports.sh:98-110`                                                                       |
| 备份是全量冷备份，所有写入者停止；只导出 `openwebui` 库；覆盖 chat-data                                                   | `deploy/recovery.py`、`deploy/BACKUP-RESTORE.md`                                                     |
| 发布清单只认六个镜像角色                                                                                                  | `deploy/release.py:52-59`                                                                            |
| OCU 没有任何 SQL 客户端                                                                                                   | `computer-use-server/requirements.txt`                                                               |
| 上传文件对沙箱只读；OCU 工具每次按 MD5 比对，不一致就用 WebUI 文件库的原件覆盖                                            | `docker_manager.py:1086`、`openwebui/tools/computer_use_tools.py:1011`                               |
| 两个旧沙箱路径出现在 25 个被跟踪文件里（系统提示、三个公共技能、工具、沙箱镜像、恢复脚本、测试、文档）                    | `git grep`                                                                                           |
| 内嵌 Files 预览只读、无工具栏、消息协议封闭；frame 的 key 含 revision，revision 一变就重建                                | `src/lib/components/chat/WorkspaceArtifact.svelte:57-59,111-163`                                     |
| WebUI fork 没有未保存守卫；切换聊天会销毁工作区面板；侧栏没有放大                                                         | `src/lib/components/chat/ChatControls.svelte:350,494`                                                |
| WebUI 的 JWT 存在 localStorage（按 origin 隔离），cookie 为 HttpOnly；反代只有一个 `server_name _`                        | `backend/open_webui/routers/auths.py:198-203`、`deploy/proxy/nginx.conf.in:56`                       |

## 编辑器选型与机器

采用 ONLYOFFICE Docs 社区版 `v9.4.0`（AGPL v3），不修改源码，保留品牌与许可证文件。集成参考检出在 `/Users/danker/Documents/31308/onlyoffice-documentserver-reference`（`fb73d33c`），子模块未初始化，不是可编译的源码包；实施使用同版本发行镜像并固定镜像身份。Collabora Online 是备选，改选需要实现 WOPI，不能共用本计划的回调契约。

DocumentServer（下称 DS）9.4.0 的 changelog 写明 “Removed the limitation of 20 simultaneously opened documents”，但参考检出 `Readme.md:76` 仍写 “up to 20 maximum”。[B1 实测记录](../evidence/issue-119/2026-10-03-b1.md)中 21 个不同文档同时可编辑，没有上限拒绝或 cap 事件；`license` 返回静态许可额度，不是实时连接数。2026-10-03 用户批准按实测修订：不加人为 20 连接限制，不虚构 cap 事件或对应拒绝分支；真实 API/编辑器错误仍须报告。21 以上未测，不据此宣称无限容量。

验收机沿用计划中的 4 vCPU / 7.4 GiB RAM / 33 GiB 可用盘配置，验收时最多同时运行一个沙箱；这是操作约束，不新增沙箱并发配置。[官方 Community Docker 要求](https://helpcenter.onlyoffice.com/docs/installation/docs-community-sys-reqs-docker.aspx)列出 RAM ≥ 4 GB、swap ≥ 4 GB、空闲磁盘 ≥ 40 GB；不是 Docker 仓库 README 的推荐值（其 swap / 磁盘均为 ≥ 2 GB）。计划配置的磁盘低于 40 GB，属于功能验收偏差，不是生产容量证明。B1 本机隔离测试没有 LAN 访问，未实测验收机余量、内存或 swap；这些须由部署方记录，不能用本机数据代替。是否开 swap 由部署方决定，不作为验收门槛。

B1 不通过（发行物不可用、三格式不能打开/修改/导出、许可条款不适配）时，停止后续工作并回到本计划，不自动改选 Collabora。

## 关键设计

### 0. 工作区统一（B0）

沙箱里只保留一个用户可见的目录：

| 沙箱路径               | 内容                                 | 谁能看到             |
| ---------------------- | ------------------------------------ | -------------------- |
| `/mnt/user-data/files` | 工作区文件：上传的与生成的，都可读写 | 用户（侧栏）与 Agent |
| `/home/assistant`      | Agent 的私有临时区：依赖、中间文件   | 只有 Agent           |

- 宿主机上沿用现有的 `{BASE_DATA_DIR}/{chat_id}/outputs` 目录，读写挂载到 `/mnt/user-data/files`。目录名与 HTTP 接口名不改，所以 Plan 1 的文件标识、文件访问路由、侧栏和反代不需要随之重做。
- `/mnt/user-data/uploads` 与 `/mnt/user-data/outputs` 在沙箱里不再存在，也不留符号链接。`/mnt/user-data` 本身对沙箱用户不可写，按旧习惯写入会直接报错，而不是悄悄落在容器内部。
- 系统提示、公共技能、工具、沙箱镜像、恢复脚本、测试与文档中对旧路径的引用全部改为新路径。这会让 OCU fork 在这些文件上与上游长期分叉，已接受。
- 上传接口把文件写进同一个目录。遇到重名一律改名写入，不覆盖已有文件。
- WebUI 附件同步改为**每个附件只导入一次**：按 WebUI 的附件 ID 记录导入回执，之后该文件被编辑、改名或删除，都不会被覆盖或复活。
- 上传清单与上传列表两个只读接口随之失去意义，连同它们的反代行和 SPA 里的上传列表一并删除。
- 直接后果：Agent 可以修改或删除用户上传的原件。WebUI 文件库里仍有一份原件。

**已知限制**：文件被人工或 Agent 修改后，WebUI 文件库里的附件原件、以及已经注入模型上下文的内容不会更新。工作区里的文件才是当前内容。

### 1. 版本存储

Office broker 是 OCU 服务的进程内模块 `office/`。它的全部状态存为每聊天的文件，放在 `{BASE_DATA_DIR}/{chat_id}/.ocu/office/`，沿用 outputs broker 的写法：在 per-chat 锁（RLock + flock）内读改写，临时文件、fsync、`os.replace`、目录 fsync。不使用 PostgreSQL 或 SQLite。

这样做的理由：OCU 没有数据库客户端；两个 worker 之间只有 flock 可用；状态与版本文件在同一个文件系统上，不存在数据库与文件系统两处提交的问题；目录在现有 chat-data 备份集内；沙箱看不到 `.ocu`，Agent 改不了历史。代价是没有跨聊天查询，首版不需要。

- **文档**：以 Plan 1 的 `file_id` 为键，记录相对路径、类型、当前已发布版本及其内容哈希。
- **版本**：版本号（每文档单调递增）、父版本、SHA-256、大小、来源（保存、自动保存、关闭、恢复、冲突、被覆盖的工作区内容）、时间、是否已发布。版本内容按 SHA-256 存为不可变文件，历史不原地改写。
- **编辑会话**：session_id、file_id、编辑起点的内容哈希、editor_key、`save_seq`、`last_committed_seq`、状态。
- **保存回执**：会话、`save_seq`、内容哈希、对应版本、结果；用于回调幂等与重试。
- **提交日志**：发布前写入提交意图，完成后写入结果；启动时据此补完或回滚中断的发布。

术语：Plan 1 的 `revision` 仍是每聊天的产物变化计数器。Office 的不可变快照叫**版本**（version）。两者不混用。

新文件、同名替换、改名与删除按 Plan 1 的 `file_id` 机制处理，不靠路径或 mtime 充当身份。历史恢复生成新版本并经发布路径写回，不覆盖审计历史。版本默认不自动删除；写入前检查磁盘余量，不足时拒绝新编辑并给出明确错误。

### 2. 接口

浏览器可达的接口都带 `{chat}`，经反代的 chat 授权行先过 `auth_request`，再转给 OCU。OCU 自己不知道聊天归属，所以不设按 file_id 反查归属的授权路径。

| 接口（反代前缀 `/ocu` 之后）                         | 职责                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| POST `/api/office/{chat}/documents/{file}/sessions`  | 校验文件类型与当前内容，创建或加入编辑会话，签发编辑器配置 |
| GET `/api/office/{chat}/sessions/{session}`          | 返回会话的持久化状态；顺带检查正在编辑的文件是否已被改动   |
| POST `/api/office/{chat}/sessions/{session}/save`    | 发起保存并分配 `save_seq`；只表示已受理                    |
| POST `/api/office/{chat}/sessions/{session}/close`   | 发起关闭                                                   |
| POST `/api/office/{chat}/sessions/{session}/resolve` | 处理冲突：另存为新文件或覆盖                               |
| GET `/api/office/{chat}/documents/{file}/versions`   | 列历史版本                                                 |
| POST `/api/office/{chat}/documents/{file}/restore`   | 把某个历史版本恢复为新版本并发布                           |

以下接口不进反代表，只在控制面网络内可达：

| 接口                                     | 职责                                                    |
| ---------------------------------------- | ------------------------------------------------------- |
| GET `/office/source/{ticket}`            | DS 获取某一版本的文件内容；票据短期有效，限定文档与会话 |
| POST `/office/callback/{chat}/{session}` | DS 的保存回调；校验 DS 的 JWT、会话与 `save_seq`        |

围栏是进程内函数调用，不设 HTTP 接口。编辑器配置由服务端签名；模型 API key、MCP key、内部令牌、JWT 签名密钥不进入前端。文件获取、command service、回调使用服务器间地址，不使用浏览器地址。

### 3. 保存模型与状态机

**对用户只有一级保存：保存即发布。** 用户点保存，内容先存为不可变版本（persist），随即替换工作区文件（publish）。persist 与 publish 是内部两个阶段，不暴露成两个按钮。

| 触发                                                    | 行为                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 用户点保存                                              | persist，然后 publish                                                            |
| 有改动时每 5 分钟（由编辑器页面驱动，服务端不跑定时器） | 只 persist；在历史里标为「自动保存，未发布」                                     |
| 离开编辑器（切换聊天、关闭侧栏、关闭编辑器）            | 关闭会话；DS 的最终回调到达后，有改动则 persist 并 publish；界面显示「正在保存」 |
| 刷新页面或关闭浏览器标签                                | 有未发布改动时用浏览器原生提示拦截                                               |

状态栏的保存按钮是唯一的保存入口。编辑器自带的 Ctrl+S 不发布到工作区：编辑器运行在独立来源的框架里，页面截不到这个按键；按下后状态栏仍显示「未保存」，内容在下一次点保存或离开编辑器时发布。这是已知限制，写入用户文档。

文档化的损失上界是 5 分钟：DS 崩溃或重启时，最近一次自动保存之后的输入可能丢失，此时会话转为已失效。DS 的 `autoAssembly` 保持关闭。

会话状态：opening → editing → saving → editing；关闭走 closing → closed。另有 conflict、error、orphaned（DS 侧状态丢失或备份恢复后；重开时生成新的 `document.key`）。`document.key` 在同一编辑会话内保持稳定，保存后不换 key；会话最终关闭后，下一次会话使用新 key。

**排序与幂等**：broker 在发起保存或关闭时递增 `save_seq`。回调的 `save_seq` 低于 `last_committed_seq` 时拒绝，绝不回退版本。重复回调按（`save_seq` + 内容哈希）幂等返回同一结果。

**回调状态**：1 更新参与者；2 最终关闭，有改动则 persist 并 publish；3 记录最终保存失败；4 无修改关闭；6 forcesave 结果，按发起时的意图 persist 或 persist 并 publish；7 记录 forcesave 失败。未知状态不修改任何文件，记录可诊断错误。

**persist 过程**：校验回调 → 只从已配置的 DS 服务器间地址下载，校验重定向每一跳、超时与大小 → 检查文件大小、类型、OOXML 结构与 SHA-256 → 暂存并 fsync → 比较 `save_seq` → 写入不可变版本与保存回执。数据已持久化之后，才按 DS 协议确认成功；响应丢失导致的重试必须幂等。拒绝回调里提供的任意下载地址。

### 4. 手工编辑与 Agent 写入的协调

工作区目录的写入者：沙箱内进程（Agent 的工具、后台进程、终端），发布，上传接口。发布与上传接口都在 per-chat 锁内写入。沙箱内进程不拿锁，所以对运行中的容器，暂停是唯一的写入屏障。

1. **独立编辑副本**。编辑器从打开时的文件内容创建独立副本，记下此时的内容哈希。用户编辑期间 Agent 可以照常工作。
2. **发布时比较哈希**。发布前对工作区里的这一个文件算哈希，与编辑起点比较。一致才替换；不一致就是冲突，绝不最后写入者覆盖。
3. **两态围栏**，都在 per-chat 锁内：
   - 容器在运行：`pause` → 确认已暂停 → 比较哈希 → 原子替换 → 向 outputs broker 登记 → `unpause`。目标窗口小于 1 秒；超过 5 秒判失败并解冻。暂停失败就是发布失败：内容已作为版本保存，可以重试，不降级覆盖。
   - 容器未运行（已停止、不存在）：在锁内直接比较与替换。launch 用同一把锁，窗口内到达的启动请求排队到发布完成后执行。
4. **崩溃兜底**。暂停前写入围栏标记；OCU 启动时和现有的空闲回收轮询中，发现过期的围栏标记就解冻并清除。broker 崩溃不得让沙箱永久冻结。
5. **不需要让保留期守卫和恢复脚本避让**。保留期守卫只做 `docker stop`，这只会移除写入者；冷备份要求包括 OCU 在内的所有写入者停止，此时不可能有发布在进行；上游的清理任务在部署里是关闭的。
6. **冲突处理**。用户内容总是先存成一个版本。然后提供两个动作：「另存为新文件」（默认）；「覆盖工作区文件」（二次确认，被覆盖的内容也先存成一个版本）。原路径已被删除时只提供另存，不复活旧路径。关闭时自动发布遇到冲突而无人在场的：文件还在但内容变了，留到下次打开该文件时处理；原文件已不在，自动另存为新文件，出现在文件列表里。发布失败或编辑器服务重启留下的未发布版本，在下次打开该文件时提示「恢复自动保存的内容 / 从当前文件开始」。
7. **编辑期间的提醒**。编辑会话的状态轮询顺带检查正在编辑的这一个文件：大小或修改时间变了就算哈希，与编辑起点不同则在编辑器上显示「工作区文件已变化」。这只是提醒；防止误覆盖靠第 2 条。
8. **提交路径符号链接防护**。暂存文件在目标目录内用 `O_CREAT|O_EXCL|O_NOFOLLOW` 创建，以点开头命名（对文件列表不可见）；`os.replace` 前逐个父目录 `lstat`，任一为符号链接或解析后越出本聊天目录即拒绝。
9. **哈希时机**。只在三个时点对单个文件算哈希：打开编辑会话、发布、编辑期间的状态轮询（第 7 条）。常规对账不变：侧栏预览对「大小不变且伪造了修改时间」的改动不刷新，这仍是 Plan 1 已记录的盲区。

失去权限时只拦新操作：反代拒绝该用户的新请求，票据短期过期；已打开会话的最终回调仍发布到同一聊天，因为内容是有权时写的，而聊天归属不可转移。在 WebUI 删除聊天不会删除它的工作区目录（Plan 1 行为），最终回调照常保存到那个目录，此后无人可达，不新增删除通知；只有目录已被运维删除时，才只保留版本、不重建任何目录或文件。登出不即时撤销，沿用 Plan 1 已记录的偏差。

### 5. 前端

- **入口与状态**在 WebUI fork 的 `WorkspaceArtifact`。已实现的入口位于选中文件操作栏，复用 `Edit` 文案；只接受 broker 的 docx/xlsx/pptx 类型、已保存聊天及两个 literal true feature flags。当前类型只约束新的 Edit；已准入的 activation 在同一 `file_id` 的 path/type/MIME 更新后仍保留原 editor URL、策略、generation 与 session，并优先于 generated/只读预览渲染。状态条由 `OfficeEditorStatus` 投影最新有效 `ocu:office-state`：opening / unsaved / saving（含 closing） / saved / conflict / failed（含 editing 且 reason 非空） / expired / refused；Save 只在 editing 启用，并通过现有 controller 发送 `ocu:office-command` `save`。refused 与 closed 经现有 `stopEditor` 退役并回到只读预览/下载。expired 保留 frame 并提供 Open again。`workspace_changed` 仅在当前编辑上下文显示。状态条在 live 编辑时提供 Maximize/Restore 与 Version history。
- **编辑器**加载当前聊天的同源 `/ocu/preview/{chat}?embed=office`。每次显式编辑、重试或 Open again 建立本地 activation；Retry / Open again 继续已捕获的 activation，不把未选中或从未准入的非 Office 文件当作新的 Edit。revision、路径/改名/类型/MIME、其他文件更新及首个 session id 不重建 iframe。`office-editor-frame.ts` 的固定 `sandbox="allow-scripts allow-same-origin"`、`allow=""` 消费 [B1 第 14 项](../evidence/issue-119/2026-10-03-b1.md#14-minimal-tested-iframe-capabilities)，不读取用户 `$settings.iframeSandbox*`。
- `createOfficeEditorController` 验证当前窗口来源、origin、实际 frame URL、精确键/类型和 chat/file/generation；有效 ready 只产生一次同源定向 open。`save` 只对当前已 attached、opened、URL 匹配、当前 generation 且 store 为 editing 的 frame 向页面 origin 发送 `{type:'ocu:office-command',chat_id,generation,command:'save'}`，不含 file_id 或 HTTP。守卫通过同一 controller 对当前非 refused frame 发送 `close`。10 秒 ready deadline 先退役 authority，再显示失败和 Retry。controller 清理拥有的监听器与计时器，离开守卫负责退役前的关闭请求；同一 ID 的类型重分类不退役。宿主页状态只写入既有 `ocuOffice` store，消息协议与只读预览并列。
- **放大**是 `WorkspaceArtifact` 对现有选中文件包装的 native `popover="manual"`。放大时该包装仍在原 DOM 位置，浏览器把它放到 top layer 并使用明确的 viewport 几何；普通侧栏模式不带 `popover` 属性。退役、超时、Retry 与 Open again 都清回普通侧栏。Save 仍走现有 command 路径，Restore 只还原本地布局；controller/store 仍是唯一编辑权威。不使用 Fullscreen API、portal 或第二份 editor/status 分支。
- 放大验收仍依赖实际浏览器几何与命中：Navbar 标题点和旧 resize separator 点必须命中 overlay 或其子孙。窄屏必须在同一 1024px 以下宽度内完成打开、放大和恢复，不在连续性区间跨断点。证据停在 stub/gateway。
- **历史版本**由 `OfficeVersionHistory` 在现有包装内显示，可从编辑状态条或未编辑文件的操作栏打开；只在显式打开时读版本，不创建编辑会话。每行显示 broker 的版本号、时间、来源和 published 值。当前页有该文档的编辑 iframe 时禁用恢复并说明原因；其他页的 `open_session` 交给 broker 决定。恢复成功后重新读取列表，拒绝保留原行，恢复已成功但重读失败有单独提示。关闭或聊天/文件/视图/开关变化使旧响应失效，同 ID 元数据更新不重读。放大时历史仍在 native top layer 内，不移动编辑器。普通侧栏内表格可横向滚动，字段与动作不拆词换行。
- **冲突**由包装内的 `OfficeConflictDialog` 处理，放大时仍在 top layer。默认聚焦另存为新文件；覆盖必须二次确认，`path_missing` 不提供覆盖。关闭不发请求，重复状态不自动重开，可显式重开；普通拒绝保留对话框及 broker reason，`workspace_missing` 关闭并显示内容仍保留于版本库，停止该身份的后续 resolve。请求绑定已准入的编辑或 preflight 上下文与 session，合并重复提交，失效响应不影响其它上下文；成功不改写编辑身份或伪造 host 状态。`WorkspaceSelectedFile` 仅承接原选中文件操作栏的展示。
- **打开前检查**由 `OfficeOpenPreflight` 按新鲜 versions 响应判断：已结束会话的待解决冲突优先；否则无打开会话且最新版本未发布时，提供恢复或从当前文件开始；其它情况才创建 frame。恢复成功前不创建编辑器，失败保留选择；读取失败显示 Retry。待解决冲突复用现有对话框，不向 `ocuOffice` 伪造会话或 generation；关闭保留重开入口，解决成功回到文件入口，下一次显式 Edit 重新检查。有效的无会话 `refused/unpublished_version` 首次退役 frame 后静默重查，同一次用户 activation 的第二次拒绝显示错误与 Retry；替换 frame 不重置次数。上下文失效使旧完成无效，同 ID 元数据变化不重查。
- **未保存守卫**由 `office-leave-guard.ts` 拥有，上游 `ChatControls` 与 `Chat.svelte` 只增加导入和调用。切换聊天、关闭侧栏/编辑器、切换文件/视图先捕获原 chat/file/name/session/generation，每个 attachment 至多发送一次 close；broker 接受前保留原 iframe/document。每 chat/session 一个非重叠 follower，按一秒间隔读取状态，15 秒进度预算到期报告 unconfirmed 并只释放一次待执行动作，不承诺保存成功。报告区分 saved、saved-as 文件名、待解决冲突、字面 reason 失败及 unconfirmed，只属于原聊天，返回时重现而不自动打开编辑器。当前已挂载、dirty、非 refused 编辑器才注册原生 beforeunload。公共 Drawer/ResizableSidePanel 的可选 `onCloseRequest` 只表示用户关闭，布局销毁不写关闭偏好；默认调用方仍同步关闭。源代码范围与唯一 Chat 行数例外见 Office 决策记录。
- **离开边界**保留 Back/Forward 的 `popstate` 类型与 delta，等 SvelteKit 撤销已取消的遍历、回到原历史条目后再遍历，不用 `goto` 新增历史；更新意图与 Chat 销毁清除待重放监听。新 attachment 复用上个 owner 的 session，或在自己的 close 发送前已为 closing 时，不能把旧 closing 当作本次 close 的受理，仍受 15 秒预算约束；普通 editing 会话随后返回 closing 的受理不变。另存为不改 frame 身份，后续冲突按 status 的当前 `file_id` 查 versions，并用当前另存路径提示恢复。READY 前文件在完整 listing 中消失也只退役原 activation，返回后须再次显式 Edit；未完成的分页与同 ID 元数据刷新不退役。
- 编辑入口由 `ENABLE_OCU_OFFICE_EDIT` 控制，默认关闭；只接受大小写无关的 `true`/`false`，其它值启动失败并点名该变量；已认证 `/api/config` 的 `features.enable_ocu_office_edit` 与 `enable_ocu_workspace` 并列，匿名响应不含该键。
- WebUI 父页面的四个网关调用在 `src/lib/apis/ocu/office.ts`：`getOfficeSessionStatus`、`listOfficeVersions`、`restoreOfficeVersion`、`resolveOfficeConflict`。路径固定在 `/ocu`，段做 `encodeURIComponent`，cookie 同源；POST 带 `X-Requested-With: ocu-workspace`。失败复用 `WorkspaceRequestError`，broker 的字符串 `reason` 原样保留（含 404），无白名单；传输失败是 `0/request_failed`，不可读/非字符串 reason 是 `HTTP status/request_failed`，成功体不是 JSON 是 `HTTP status/invalid_response`。类型：`OfficeSessionStatus`（`session_id`、`file_id`、`document_key`、`state`、`reason`、`save_seq`、`last_committed_seq`、`last_published_seq`、`workspace_changed`、`saved_as`）、`OfficeVersions`（`file_id`、`published_version`、`open_session`、`versions`）、`OfficeRestoreResult`（`file_id`、`number`、`published`）、`OfficeResolveResult`（`session_id`、`state`、`file_id`、`path`）。会话创建、save、close 不在此模块。
- 每聊天编辑状态在 `src/lib/stores/ocu-office.ts`（`ocuOffice`），与 broker 的 `ocu-office-store` 不是同一层。导出 `OcuOfficeState`（`generation`、`fileId?`、`sessionId?`、`state?` 为 broker `OfficeSessionState` 或宿主 `refused`、`reason`、`dirty`、`workspaceChanged`、`savedAs`）、`beginOfficeGeneration`、`retireOfficeGeneration`、`isCurrentOfficeGeneration`、`applyOfficeState`。过期或缺失 generation 不改状态；对 A 的操作保持 B 的引用同一性。宿主 `session_id: null` 以省略 `sessionId` 表示，清除须显式传入 `undefined`。契约见 [Office 父页面客户端与编辑状态](../decisions/implemented/architecture/2026-10-04-ocu-office-client-store.md)。不写入 `artifactContents`。
- 打开前检查不启动已停止的沙箱。`make verify-ui-ocu` 配置六个 spec、复用七个 canonical Office scenarios，并先运行实际 `playwright test --list`。现有 first-open 仍关联 gateway session create 与父 store 接收的 editing。独立 `office` 聊天走 Edit → Unsaved → parent Save；测试在 Edit 前拦截该会话全部 GET status，真实 save202 到达后先观察可见 Saving 且无 Saved，再放行真实 GET，用 status `last_published_seq` 核对已接受的 `save_seq` 后才渲染 Saved。独立 `office_unsupported` 聊天对 create 415/`unsupported_type` 显示明确拒绝、无编辑器、只读预览与可下载的夹具字节，且该聊天私有记录无 close。放大浏览器证明保留同一 iframe 与 live document，overlay Save 走现有 command 路径；桌面截图见 [sidebar](../evidence/issue-156/office-maximize-sidebar.png) 与 [overlay](../evidence/issue-156/office-maximize-overlay.png)，窄屏 Drawer 见 [narrow](../evidence/issue-156/office-maximize-narrow.png)。历史版本另用不入库的浏览器 walk 验证真实网关恢复、放大时禁用恢复和编辑文档连续性，不增加浏览器 spec 或 stub 分支。独立 `office_conflict` 用例验证窄屏 Escape 不关闭 Drawer、放大后默认另存、真实 resolve、原文件保留及去重副本刷新；同一 iframe/document/session/generation 保持，截图见 [冲突对话框](../evidence/issue-158/office-conflict.png)。`office_unpublished` 验证 versions → restore → create 和发布后的历史，`office_stale` 验证版本读取 → 创建拒绝 → 重读 → 从当前文件编辑及保留未发布历史，均保存选择框截图。守卫另用独立浏览器 walk 验证桌面关闭、移动端 Escape、真实聊天切换与刷新提示，观察真实 close 到达、接受前原文档保留和原聊天报告；持久 B-T12/save-as 用例属于任务 27.2。证据停在 stub/gateway，不能替代真实 DS 保存或恢复验收。实现契约与取舍集中在上述 [Office 父页面客户端与编辑状态](../decisions/implemented/architecture/2026-10-04-ocu-office-client-store.md)。
- `/files/*` 增加 `Cache-Control: no-store`，使「改后预览不返回旧缓存」不依赖 mtime 巧合。

### 6. 部署

- DS 是第七个镜像角色，直接使用上游发行镜像（按拉取角色登记，记录镜像身份与归档 SHA-256），不构建派生镜像，不挂载 Docker socket，不共享沙箱文件树。它只加入控制面网络。
- **部署只有一种形态**：DS、反代的第二个监听和第二个端口始终存在，功能开关只决定 WebUI 是否显示「编辑」。开关关闭时 DS 仍占用内存，这是接受的代价；换来的是反代配置、端口守卫、冒烟和发布清单都不需要维护两套形态。
- **独立 origin**：反代多发布一个端口专给 DS，DS 自身不发布端口。端口守卫从「反代恰好一个端口」改为恰好两个。DS 端口上的所有请求也要求 WebUI 登录态。
- DS 的数据卷跨重启保留，但**不进备份**。备份前停止新会话并等待现有会话保存；恢复后所有编辑会话标记为已失效。
- **字体**：离线包携带开源中文字体。公文字体（仿宋\_GB2312、方正小标宋简体、楷体\_GB2312）由使用方提供，授权由使用方公司持有；部署时放入挂载目录，DS 启动时加载，不进仓库也不进离线包。宋体、黑体未提供，使用开源字体替换。字体替换造成的分页与换行差异记入保真记录。
- 运行期不依赖公网 CDN、在线转码或外部文档服务。

## 实施顺序

| 阶段 | 交付与退出条件                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B0   | 工作区统一：单一沙箱路径、上传写入同一目录、附件只导入一次、旧路径引用全部更新；用户上传的文件出现在侧栏里，Agent 能读写它                                   |
| B1   | 核对发行物、许可证与容量（官方最低值与实测余量并列）；隔离部署 DS；三格式样例都能打开、修改、导出；记录连接上限行为、关闭回调延迟、iframe 最小权限、字体来源 |
| B2   | broker 状态与版本存储、DS JWT、文件获取、回调、幂等、`save_seq` 排序、persist；三格式完成可靠保存，崩溃恢复测试通过                                          |
| B3   | 两态围栏、崩溃兜底解冻、符号链接防护、哈希比较、冲突处理、向 outputs broker 登记；后台写入者与提交窗口内并发启动的测试通过                                   |
| B4   | 编辑器 iframe、状态条、未保存守卫、放大、历史版本与恢复、聊天切换与旧会话恢复；普通用户流程通过                                                              |
| B5   | DS 进入发布清单与备份流程、反代第二端口、字体挂载、离线运行、重启（含 DS）、上限行为；验收矩阵执行完毕                                                       |

B0 与 B1 互不依赖，都是依赖图的根。B2 及之后全部依赖 B1；凡是依赖「工作区文件可编辑」的工作同时依赖 B0。

## 验收矩阵

| ID    | 测试                                                                                                      | 通过标准                                                                                                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-T01 | DOCX 中文、段落格式、表格、图片，编辑保存再打开                                                           | 修改保留，原生 DOCX 有效；列明分页与字体差异                                                                                                                                                 |
| B-T02 | XLSX 多 sheet、公式、格式、图表，改单元格保存                                                             | 公式与数据保留，结果重算可核对，无静默扁平化                                                                                                                                                 |
| B-T03 | PPTX 文本、图片、图形、页序与尺寸，编辑保存                                                               | 原生 PPTX 可重新打开，布局差异有记录                                                                                                                                                         |
| B-T04 | 保存按钮、5 分钟自动保存、关闭保存、无修改关闭                                                            | 正确处理回调状态 1/2/3/4/6/7；保存按钮与关闭都发布到工作区；自动保存只产生未发布版本；工作区文件确已替换后才显示已保存                                                                       |
| B-T05 | 同一用户双标签同时编辑，其中一个标签关闭                                                                  | 会话 key 稳定；没有额外的旧文件覆盖                                                                                                                                                          |
| B-T06 | 手工编辑同时由 bash、后台进程、终端修改原文件；容器运行与停止两态；容器已停止时在提交窗口内并发 launch    | 冲突可见，双方内容都保留；运行中靠暂停屏蔽写入，暂停失败则发布失败且不覆盖；崩溃后沙箱被兜底解冻；并发启动排队到发布完成后执行                                                               |
| B-T07 | 保存后让 Agent 修改，再在侧栏打开；Agent 做大小不变的修改后用户再保存                                     | Agent 读到保存后的内容；大小变化的修改使预览按 revision 刷新；大小不变的修改在打开会话、编辑期间轮询或发布时被哈希发现，不被覆盖                                                             |
| B-T08 | 重复、乱序回调（含乱序 `save_seq`），超时重试，签名错误，任意下载地址                                     | 幂等；低 `save_seq` 被拒绝，不回退版本；非法请求被拒绝，失败可诊断                                                                                                                           |
| B-T09 | 授权冒烟：B 用户替换 A 的文件、会话、key、历史与下载地址                                                  | 所有读取、编辑、恢复操作被拒绝；伪造回调被拒绝（LAN 冒烟强度）                                                                                                                               |
| B-T10 | 登出或账号停用后继续操作；过期票据；聊天被删除后回调到达                                                  | 新操作被拒绝；已打开会话的最终回调仍发布到同一聊天；在 WebUI 删除聊天不会删除工作区目录（Plan 1 行为），回调照常保存到该目录，此后无人可达；目录已被运维删除时只留版本，不重建任何目录或文件 |
| B-T11 | DS 或 OCU 重启、发布中断、磁盘满                                                                          | 文件不损坏；提交日志补完或回滚中断的发布；DS 重启的损失不超过 5 分钟，会话转为已失效；失败不假报成功                                                                                         |
| B-T12 | 切聊天、关侧栏、刷新网页、重开旧聊天                                                                      | 离开即自动保存并显示进度；刷新时有未发布改动则提示；已保存文件持久化；不串文档                                                                                                               |
| B-T13 | 损坏、超大、不支持的格式；同名替换、改名、删除；工作区内的符号链接                                        | 明确错误或只读回退；改名延续 file_id，删除留 tombstone；符号链接提交被拒绝；不复活已消失的路径                                                                                               |
| B-T14 | 历史版本恢复；整套备份还原                                                                                | 恢复生成新版本并发布；还原后文件、版本与 broker 状态一致，所有编辑会话为已失效，重开使用新 key                                                                                               |
| B-T15 | 断公网运行、中文字体、不同浏览器；超过原先假定的 20 文档边界                                              | 核心编辑保存可用；第 21 个文档和已有会话的 join 不受人为 cap 拒绝，实际 API/编辑器失败明确报告且不伪报保存成功；记录资源使用，不推断更高容量                                                 |
| B-T16 | 上传一个 Word 文件；让 Agent 修改它；用户再编辑它；同一附件再次触发同步；上传重名文件；Agent 按旧路径写入 | 上传的文件出现在侧栏并可编辑；Agent 与用户的修改都留在同一个文件上；再次同步不覆盖也不复活；重名上传改名写入；旧路径写入直接报错                                                             |

测试分为 broker 单元与集成、前端状态测试、三格式浏览器端到端和故障注入。PR CI 只跑回调协议夹具与前端状态测试；真实编辑器的三格式端到端由本地 make 目标运行，证据贴入 PR；验收矩阵在验收机上执行。不允许只用 mock 宣告保存成功。另用 LibreOffice 或桌面 Office 复开导出文件，避免只在同一编辑器内自证。

## 发布与回滚

发布前停止新编辑会话，等待现有会话保存并核对结果；备份按现有冷备份流程进行，DS 作为新增的写入者一并停止。回滚关闭编辑入口的功能开关，保留只读预览和全部版本；已保存的文件继续可下载、可供 Agent 使用。B0 的路径变更随沙箱镜像发布，回滚到旧镜像需要重建沙箱容器。2026-10-02 决定：Plan 1 版本没有正式上线，恢复工具只认新格式的发布清单，不兼容 Plan 1 的旧格式；正式环境不存在回滚到本计划之前版本的路径。

## 官方参考

- [打开文件](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/opening-file/)
- [回调状态与格式](https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/)
- [协作会话与 document.key](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/co-editing/)
- [Command service / forcesave](https://api.onlyoffice.com/docs/docs-api/additional-api/command-service/)
- [社区版条款说明](https://helpcenter.onlyoffice.com/docs/faq/docs-community.aspx)

镜像身份、连接上限行为、资源实测、关闭回调延迟、具体文件保真度都由 B1 记录发行物实测结果；本文不把候选当作已部署事实。

## 修订记录

**第三次修订（2026-10-01）**，相对第二次修订：

- 新增 B0「工作区统一」：uploads 与 outputs 合并为一个目录，沙箱内路径改为 `/mnt/user-data/files`，旧路径不留兼容；附件只导入一次。原「uploads 不可编辑」的非目标作废。
- broker 状态从 PostgreSQL 改为每聊天文件存储；`restore_epoch` 简化为「恢复后会话全部失效」。
- 浏览器可达接口改为带 `{chat}`；删除内部 fence 接口。
- 保存模型从两级改为一级（保存即发布）；新增每 5 分钟的自动保存；离开即自动保存；删除「交给 AI 继续修改」。
- 围栏从三态改为两态，删除 stop → commit → start 降级；删除「暂停前重置自杀定时器」与「保留期守卫、清理、恢复检查提交租约」，原因见「现状事实」。
- 哈希时机明确为打开、发布、编辑期间轮询；B-T07 改写。
- 撤权语义改为只拦新操作；B-T10 改写。
- DS 使用反代的第二个端口取得独立 origin；DS 数据卷不进备份；公文字体由使用方提供并挂载。
- 机器：沿用现有验收机，验收时最多同时运行一个沙箱（操作约束，不新增限制配置），低于 DS 官方最低值作为偏差记录；它只是验收环境。
- 三路审核后补充的三项用户决定（2026-10-02）：在 WebUI 删除聊天后，已打开会话的最后一次保存照常写入那个无人可达的目录，不新增删除通知（B-T10 改写）；无人在场时的修改要自动回到用户眼前（原文件已删则自动另存，有未发布版本则下次打开时提示恢复）；swap 只记录实测值，不作为验收门槛。
- 写规格时补充的三项用户决定（2026-10-01）：编辑器自带 Ctrl+S 不发布，只认状态栏保存；DS 与第二个端口始终存在，开关只管 WebUI 入口；「沙箱并发 1」只作验收约束。
- 术语：Office 的不可变快照改称「版本」，`revision` 保留 Plan 1 含义。
- 移除已由 Plan 1 完成的 `path + revision` 迁移。
- B1 实测修订（2026-10-03）：用户确认未修改官方镜像的许可证适配，并批准以 21 文档可编辑、无 cap 事件的观测替换 20 连接拒绝契约；同步 session、host、UI、stub 与任务要求。[选型决定](../decisions/implemented/architecture/2026-10-03-ocu-office-editor-selection.md)只解除 B1 前置门，不解除其余镜像验收冻结。
