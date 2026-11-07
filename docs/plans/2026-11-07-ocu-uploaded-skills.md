# 管理员上传的 OCU Skills

Status: proposed（设计稿，未实现）。2026-11-07 用户经三轮 grill 压测确认了 19 条分支结论（见文末 Decision Ledger），没有开放项。

## Goal

管理员上传 ZIP 格式的 skill（可以包含脚本，在 OCU 沙箱里执行），并决定哪些用户或分组能用。用户能关掉自己不想要的新增 skill，也能在输入框里用 `/` 点名使用某个新增 skill。

## Scope

- 新增 skill 的完整生命周期：上传、原地替换、硬删除、授权、用户个人禁用。
- 用 Open WebUI 实现 OCU 现有的外部 skill 注册接口（`MCP_TOKENS_URL` 指向的两个端点），替代 `settings-wrapper`。
- 管理员面板 → 设置，新增「工作区 Skills」标签；个人设置新增「工作区 Skills」标签；`/` 菜单新增「工作区 Skills」分组，只列出新增 skill。

## Not In Scope

- Open WebUI 原生 Skills（`skill` 表、Workspace → Skills、`view_skill`、`<$id|label>` 提及）不做任何修改。
- 内置 skill 不能被禁用。OCU 的 `_parse_api_skills` 不管接口返回什么都会把它们补回来（`computer-use-server/skill_manager.py:509-517`）。
- 内置 skill 不进 `/` 菜单，继续由模型根据 `<available_skills>` 自己判断用不用。
- OCU 服务端（`computer-use-server/`）不做任何改动。
- 不做即时生效（撤销也不做）、不做沙箱重新挂载、不做普通用户上传、不做 skill 版本历史、不做全局停用开关、不新增功能开关。
- OCU 解压器的 zip-slip 和解压总量问题由 #740 跟踪，不在本方案内修复。

## What Already Exists

- OCU 的 `skill_manager.py` 会调 `GET {MCP_TOKENS_URL}/api/internal/user-config/{email}` 拿用户的 skill 列表，调 `GET {MCP_TOKENS_URL}/api/internal/skills/{name}/download` 下载 ZIP，请求头都带 `X-Internal-Api-Key: {MCP_TOKENS_API_KEY}`（`skill_manager.py:291-372`）。拿到的 ZIP 以 `zip_sha256` 判断缓存是否失效，压缩包上限 `MAX_ZIP_SIZE = 50 MB`（`:44`）。
- 解压规则：如果所有条目都在同一个顶层目录下，会去掉这层目录；解压结果必须有 `SKILL.md`。解压后以只读方式挂到 `/mnt/skills/user/{name}`（`:411-431`、`:689-714`）。这段解压代码没有防路径穿越（#740）。
- 同名会顶替：`_parse_api_skills` 只在接口没返回某个内置名字时才补回内置版本（`:509-517`）。所以如果上传了一个叫 `docx` 的 skill，内置的 `docx` 就被顶替了。
- 内置名字：`DEFAULT_PUBLIC_SKILLS`（`skill_manager.py:218-224`）、`skills/public/` 下的目录，video feature 才出现的 `remotion`（`:567-584`），以及按名字覆盖描述的 `NATIVE_PROMPT_DESCRIPTIONS`（`:75`、`:616-618`）。
- OCU 的缓存：`user-config` 在内存里缓存 `MEMORY_CACHE_TTL = 60 s`，请求失败时退回磁盘缓存（`:39`、`:522-565`）；filter 把 system prompt 按 `(chat_id, user_email, features)` 缓存 `_PROMPT_TTL_SECONDS = 300`（`openwebui/functions/computer_link_filter.py:92`）。
- 生产部署中 OCU 已经通过私有网络访问 WebUI（`OCU_WEBUI_AUTH_URL=http://open-webui:8080/api/v1/ocu/auth`）。proxy 的 `location /` 会把其余路径全部转发给 WebUI（`deploy/proxy/nginx.conf.in:156`）。
- fork 已有：
  - `AccessGrants`，支持 `principal_id='*'` 通配授权（`backend/open_webui/models/access_grants.py:17`），授权界面组件是 `src/lib/components/workspace/common/AccessControl.svelte`；
  - 存储层 `Storage`（`backend/open_webui/storage/provider.py`）；
  - `ENABLE_OCU_WORKSPACE` 和 `OCU_INTERNAL_TOKEN`（`routers/ocu_workspaces.py:20,30`）。`OCU_INTERNAL_TOKEN` 目前只用于 WebUI 调 OCU（`utils/ocu_client.py:41`）。
- 消息处理顺序：inlet filter 在 `middleware.py:2635` 执行，早于原生 skill 提及的解析（`:2732`）和清除（`:2807`）。所以 OCU filter 能先看到并改写 `/` 插入的标记。
- CI 会按 `constraints.yaml` 的 `ocu_checkout.sha` 把固定版本的 OCU 拉到 `.run/open-computer-use`，并导出 `OCU_CHECKOUT`（`.github/workflows/ci.yml:111-133`）。
- OCU 仓库关闭了 issues，OCU 的工作在本仓库里跟踪，task 标 `[ocu]` 前缀。

## Design

### 存在条件

本功能不新增开关，跟随 `ENABLE_OCU_WORKSPACE`：
- 为 `true` 时启用全部功能。
- 为 `false` 时，路由不注册（返回 404），管理员标签、个人设置标签和 `/` 分组全部隐藏。
- 内部端点在 `OCU_INTERNAL_TOKEN` 为空时一律拒绝，绝不接受空密钥。

### 数据（一个迁移，两张表；本 plan 就是 AGENTS.md 要求的"迁移所在 plan"）

- `ocu_skill`
  - 字段：`name`（主键）、`description`、`zip_sha256`、`size`、`data`（ZIP 字节，存在数据库里）、`created_by`、`created_at`、`updated_at`。
  - `name` 取自 `SKILL.md` frontmatter 的 `name`，必须匹配 `^[a-z0-9][a-z0-9-]{0,63}$`，同时用作挂载目录名。
  - `description` 取自 frontmatter 的 `description`，必须有。
- `ocu_skill_user_disable`：主键为 `(user_id, skill_name)`。有记录就表示该用户禁用了这个 skill。
- 授权复用 `AccessGrants`（`resource_type='ocu_skill'`，`resource_id=name`）。第一次上传时写入一条 `user:*:read` 通配授权，实现"默认全员开放"。管理员要收紧范围时，在 `AccessControl` 界面去掉通配授权，改为授权给指定用户或分组。

### 保留名单

- `ocu_skills.py` 里写死一份保留名单：OCU `skills/public/` 的全部目录名、`remotion`，以及 OCU 内置描述表 `NATIVE_PROMPT_DESCRIPTIONS` 的全部名字。OCU 按名字取描述时不区分 skill 的类别（`skill_manager.py:616-618`），所以表里的名字即使不在 `skills/public/` 下，上传后显示的也会是 OCU 自带的描述。和保留名重名的上传返回 400。
- 防漂移测试：断言保留名单覆盖 `$OCU_CHECKOUT/skills/public/*` 的全部目录名、`remotion`，以及从固定版本 `computer-use-server/skill_manager.py` 解析出的 `NATIVE_PROMPT_DESCRIPTIONS` 名字。`OCU_CHECKOUT` 默认取 sibling `../open-computer-use`，与 `scripts/proxy-dev.sh:10` 一致，CI 会显式设置。目录不存在时测试失败，并提示需要 OCU checkout；不允许静默跳过。

### 后端：新建 router `routers/ocu_skills.py`，由 fork 自有的 `routers/ocu_workspaces.py` 以 `router.include_router(..., prefix='/skills')` 挂载，`main.py` 不改（它已超行数上限）

| 端点 | 鉴权 | 作用 |
|---|---|---|
| `POST /api/v1/ocu/skills/upload` | 管理员 | 上传 ZIP。新名字就新建并写入通配授权；名字已存在就原地替换 ZIP、`zip_sha256`、`description`，授权和禁用记录保持不变 |
| `GET /api/v1/ocu/skills/admin` | 管理员 | 全部新增 skill 及其授权 |
| `POST /api/v1/ocu/skills/{name}/access` | 管理员 | 修改授权 |
| `DELETE /api/v1/ocu/skills/{name}` | 管理员 | 硬删除：记录（连同 ZIP 字节）、授权、所有用户的禁用记录，在一个事务里完成 |
| `GET /api/v1/ocu/skills/` | 已登录用户 | 本人有读权限的新增 skill（管理员遵循现有的 `BYPASS_ADMIN_ACCESS_CONTROL`），以及各自的启用状态 |
| `POST /api/v1/ocu/skills/{name}/toggle` | 已登录用户 | 本人禁用或启用；对没有读权限的 skill 返回 404 |
| `GET /api/v1/ocu/skills/api/internal/user-config/{email}` | 仅 `X-Internal-Api-Key` | 按 OCU 契约格式返回已授权且未被禁用的新增 skill：`category='user'`，带 `description` 和 `zip_sha256` |
| `GET /api/v1/ocu/skills/api/internal/skills/{name}/download` | 仅 `X-Internal-Api-Key` | 返回 ZIP 字节 |

- 部署时设置 `MCP_TOKENS_URL=http://open-webui:8080/api/v1/ocu/skills`，OCU 拼出的路径正好对上上表最后两行；`MCP_TOKENS_API_KEY` 取 `OCU_INTERNAL_TOKEN` 的值。
- 内部端点的鉴权：用 `hmac.compare_digest` 比对 `X-Internal-Api-Key` 和 `OCU_INTERNAL_TOKEN`，不认 cookie。
- 内部端点的用户解析：用 `Users.get_user_by_email` 把 email 换成用户，email 不存在时返回空列表。
- 上传校验比 OCU 解压器更严格，并沿用它的去顶层目录规则：
  - 拒绝绝对路径、含 `..` 的条目、符号链接条目和加密条目；
  - 压缩包 ≤ 50 MB（超过返回 413），解压后总量 ≤ 200 MB（读取时按实际字节计数，不信任 `ZipInfo.file_size`），条目 ≤ 2000；
  - 去掉统一顶层目录后，根目录必须有 `SKILL.md`；frontmatter 必须有合法的 `name` 和非空的 `description`；名字不能在保留名单里。
  - 除压缩包超大返回 413 外，任一项不合格返回 400；数据库不留残余。

### 前端

- **管理员面板 → 设置 →「工作区 Skills」**：上传按钮、列表、每项的授权编辑（复用 `AccessControl`），删除前弹出确认框。界面上写明："撤销和删除对已有沙箱要等沙箱重建后才生效"。
- **个人设置 →「工作区 Skills」**：列出本人已授权的新增 skill，每项一个开关，状态持久保存。
- **`/` 菜单**：
  - 工作区开启时，`Commands/SlashCommands.svelte` 一直显示「工作区 Skills」分组，不管沙箱有没有启动、当前模型有没有挂 OCU filter。
  - 数据取自 `GET /api/v1/ocu/skills/` 中启用状态为开的条目。
  - 选中后插入提及节点，发送时由现有编辑器序列化为 `<$ocu--{name}|{name}>`（`RichTextInput.svelte:117-125` 把 `/` 提及写成 `$` 形式）。

### OCU filter（`openwebui/functions/computer_link_filter.py` 的 inlet）

- 识别用户消息里的 `<$ocu--{name}|{label}>` 标记（最后一条用户消息里的标记才追加提示），替换为 `{label}`，并在 system prompt 末尾追加一句："用户通过 / 指定使用 skill `{name}`，先阅读 `<available_skills>` 中它的 `SKILL.md` 再动手"。
- 如果 filter 没有运行，原生的 `strip_skill_mentions` 会把标记退化成纯文字 `{name}`（`SKILL_MENTION_STRIP_RE`，`middleware.py:2293`，匹配 `$` 形式；未知 id 在 `:2775-2780` 被忽略）。代价是这一轮不会追加上面那句提示。
- 用户手动写出一个自己没有权限的标记，也只是多了一句提示：沙箱里没有挂载这个 skill，模型找不到，不会越权。

### 生效时机（下一个新建沙箱；撤销也不要求立即生效）

| 操作 | `<available_skills>` 里的显示 | 沙箱里的挂载 |
|---|---|---|
| 上传、授权、启用 | 新对话约 ≤ 120 s；已有对话最坏约 ≤ 420 s（filter 300 s + OCU 各层缓存） | 下一个新建的沙箱 |
| 撤销授权、禁用、删除 | 同上 | 已有沙箱里的文件仍然可读，直到沙箱被重建 |
| 替换 ZIP | 同上 | 任一被授权用户的下一次 system prompt 渲染（`system_prompt.py:728-733` 调用 `ensure_skill_cached`）就会按 `zip_sha256` 重新下载并原地替换缓存目录（`skill_manager.py:443-453`）；**正在运行、已挂载该目录的沙箱也会在约 60–420 s 内看到新内容**。新建沙箱只读缓存（`docker_manager.py:1312`） |

### OCU 仓库改动（`[ocu]`/`[deploy]` task，OCU 服务端不改）

1. `computer_link_filter.py` 的 inlet 识别 `<$ocu--…|…>` 标记。
2. 部署配置：OCU 服务增加 `MCP_TOKENS_URL`，并让 `MCP_TOKENS_API_KEY` 取 `OCU_INTERNAL_TOKEN` 的值。WebUI 侧不新增环境变量。
3. proxy 增加 `location ^~ /api/v1/ocu/skills/api/internal/ { return 404; }`。这样内部端点不会通过浏览器入口暴露，是密钥之外的第二道防线。

## Success Criteria

- 管理员上传合法 ZIP 后，所有用户新建的沙箱里都出现 `/mnt/skills/user/{name}/SKILL.md`，`<available_skills>` 列出该 skill。
- 再次上传同名 ZIP 会原地替换，授权和禁用记录不变。
- 管理员把授权收紧到分组 A 以后，A 组以外用户的 `user-config` 返回结果里没有这个 skill。
- 用户禁用某个 skill 后，只有该用户的 `user-config` 和 `/` 菜单里没有它，其他用户不受影响。
- 删除后，所有用户的 `user-config` 和 `/` 菜单里都没有它；记录、ZIP、授权和禁用记录都不留存。
- `/` 菜单只列出当前用户已授权且未禁用的新增 skill；选中后发送，模型收到点名提示，用户消息里看不到原始标记。
- 超过 50 MB 的请求返回 413，以下 ZIP 都返回 400，两者都不留残余：含 `../`、绝对路径、符号链接或加密条目；解压总量或条目数超限；缺少 `SKILL.md`；`name` 不合法、和保留名重名或没有 `description`。
- 内部端点在没有密钥、密钥错误、只带 cookie、`OCU_INTERNAL_TOKEN` 为空这几种情况下都返回 401；经 proxy 访问返回 404。
- `ENABLE_OCU_WORKSPACE=false` 时，所有新端点返回 404，三处界面入口都不显示。

## Verification

- `routers/ocu_skills.py` 的 pytest 用 `TestClient` 覆盖：内部密钥、管理员、普通用户三种身份的 401/403/404 矩阵；授权 × 禁用的组合；原地替换；硬删除；ZIP 校验的全部拒绝场景；保留名单的防漂移断言。
- `make db-verify`（迁移 up → down → up）。
- `make smoke`：新增 hurl 用例覆盖内部端点和上传端点。
- `make verify-ui-ocu`：新增 Playwright 用例覆盖管理员上传页面、个人设置开关、`/` 菜单插入标记，OCU 用 stub。
- OCU 仓库：filter 标记改写的单元测试；proxy 拒绝内部路径的 `make smoke-proxy` 用例。
- Critical Paths 表新增一行候选：`routers/ocu_skills.py`（上传的代码会在沙箱里执行；涉及授权判断）。

## Risks

- 被撤销的 skill 在已有沙箱里仍然可读。这是用户选择的生效时机带来的代价，界面上要提示。
- OCU 的 `user-config` 请求失败或 `MCP_TOKENS_*` 被取消配置时，会退回磁盘缓存（`skill_manager.py:552-557`），并在下载失败时继续使用陈旧的解压目录（`:401-407`）。所以撤销一个有问题的 skill 的正确做法是在 WebUI 里删除它，且 registry 必须可达；回滚整个功能时还要清空 OCU 的 `SKILLS_CACHE_DIR`（含 `_user_configs/`）。
- 管理员上传的脚本会在每个被授权用户的沙箱里执行。信任边界是管理员本人，不对脚本内容做审查。
- 内部密钥和 WebUI 调 OCU 用的是同一个 `OCU_INTERNAL_TOKEN`，泄露一次两个方向都失守。用户接受这一点，理由是两端本来就在同一个私网信任域里。

## Amendments after Stage 3 review (2026-11-07)

Stage 3 审核发现了以下事实错误，已直接改在上文：标记格式实际是 `$` 形式；替换 ZIP 由 prompt 渲染触发下载；超过 50 MB 返回 413；回滚时 OCU 仍会使用缓存；管理员遵循 `BYPASS_ADMIN_ACCESS_CONTROL`。另有三处设计调整：
- ZIP 改为存在 `ocu_skill.data` 里，不再放 `Storage`/`UPLOAD_DIR`。原因有三：现有的「重置上传目录」和「删除全部文件」两个管理员操作会清空这个目录（`routers/retrieval.py:3204-3220`、`routers/files.py:562-569`）；存数据库后替换和删除都能在一个事务里完成，不会留下孤儿文件；数据库备份也会自动带上 ZIP。代价是数据库体积变大（每个 skill 最多 50 MB）。
- router 通过 `ocu_workspaces.py` 挂载，`main.py` 不改。
- 用户批准为 `SettingsModal.svelte` 加一条 `bounded_overrides` 上限（约 1350 行），两个新标签只在这里注册并加渲染分支，标签内容放在新组件里。

保留名单扩展到 `NATIVE_PROMPT_DESCRIPTIONS`，由用户在 Stage 3 之后追加确认（Decision Ledger #9、#16）。

## Assumptions

- 员工 email 在 WebUI 里唯一，并且和 filter 传给 OCU 的 `user_email` 一致。

## Decision Ledger（2026-11-07 grill，用户确认共同理解）

| # | 分支 | 结论 | 谁定的 |
|---|---|---|---|
| 1 | 谁能上传 | 只有管理员 | 用户 |
| 2 | 默认可见范围 | 全员开放（`user:*:read`），管理员可以收窄 | 用户 |
| 3 | 何时生效 | 下一个新建沙箱；撤销也不要求立即生效 | 用户 |
| 4 | `/` 菜单范围 | 只列新增 skill | 用户 |
| 5 | OCU 服务端 | 不改 | 用户 |
| 6 | 内部密钥 | 复用 `OCU_INTERNAL_TOKEN` | 用户 |
| 7 | 同名再次上传 | 原地替换，保留授权和禁用记录 | 用户 |
| 8 | 管理员入口 | 管理员面板 → 设置新标签 | 用户 |
| 9 | 与内置 skill 重名 | 写死保留名单（`skills/public/` + `remotion` + `NATIVE_PROMPT_DESCRIPTIONS` 的名字），重名拒绝；Stage 3 SC-7 之后由用户追加确认 | 用户 |
| 10 | 用户开关入口 | 个人设置新标签，持久保存 | 用户 |
| 11 | `/` 分组何时显示 | 工作区开启就一直显示，不管沙箱有没有启动 | 用户 |
| 12 | 功能开关 | 不新增，跟随 `ENABLE_OCU_WORKSPACE` | 用户 |
| 13 | ZIP 限额 | 50 MB / 解压 200 MB / 2000 条目 | 用户 |
| 14 | 名字来源 | `SKILL.md` frontmatter 的 `name` | 用户 |
| 15 | 删除 | 确认后硬删除全部 | 用户 |
| 16 | 保留名单防漂移 | CI 对照固定版本 OCU 的 `skills/public/` 和 `NATIVE_PROMPT_DESCRIPTIONS` | 用户 |
| 17 | OCU 工作的跟踪位置 | 本仓库 issue，task 标 `[ocu]` 前缀 | 事实核查 |
| 18 | 授权界面 | 复用 `AccessControl.svelte` | 事实核查 |
| 19 | filter 能否读到标记 | 能，inlet（`middleware.py:2635`）先于提及解析（`:2732`） | 事实核查 |

用户同时确认了两条默认做法：缺少 `description` 时返回 400；手动写出无权限的标记不会越权。
