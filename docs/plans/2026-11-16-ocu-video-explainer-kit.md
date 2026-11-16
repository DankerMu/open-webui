# 视频制作质量：科普讲解工具箱

Status: proposed（设计稿，未实现）。2026-11-16 用户经五轮提问确认了下文 Decision Ledger 的全部分支，开放项见文末。对应 OpenSpec change：`ocu-video-explainer-kit`。代码几乎全在 OCU 仓库；WebUI 仓库只有本计划、change 和 OCU pin。

## 背景

生产上用 Remotion 做的视频效果差。生产模型固定为 `qwen3.8-27b`（能看图，没有更强的模型可换），它要从零写整套动画代码，布局、配色、字号、节奏全靠自己。本机动效库（`~/Desktop/动效库`）的成片质量也一般，不作为质量标准；标准取 Remotion 官方和社区的好案例。

做法：模型不再写动画代码，只写一份 `script.json`；画面由预制、测过的场景组件渲染。官方模板 Prompt to Video（`remotion-dev/template-prompt-to-video` `src/lib/types.ts`：LLM 输出 zod 校验的时间线 JSON，固定合成渲染）就是这条路。

## What Already Exists

- **沙箱模板**：`open-computer-use/remotion-template/`，Remotion 4.0.537，依赖精确锁定；`src/Root.tsx` 只有一个渐显标题的 `Main`。`Dockerfile:324-347` 把它装到 `/opt/remotion-template`，`npm ci` 后下载并校验 Chrome Headless Shell 157.0.8080.0 的 6 个文件。
- **skill**：`skills/public/remotion/SKILL.md` 174 行，全是运行规则（拷模板、离线、不起 Studio、后台渲染、`--gl=swangle`、`generate_speech`），没有设计指导。官方 `remotion-best-practices` 原样 vendor 在同目录，哈希清单 `tests/fixtures/remotion-best-practices.sha256`。
- **视频开关**：`video_production_filter` 打开时，computer link filter 带 `X-OCU-Features: video` 取系统提示词，`skill_manager.video_skills`（`computer-use-server/skill_manager.py:613-626`）把 `remotion` 加进 `<available_skills>`。
- **配音**：`generate_speech` → `computer-use-server/speech.py`，调 OpenAI 兼容 `POST {TTS_BASE_URL}/audio/speech`（`speech.py:146`），写入 `/mnt/user-data/files/`。
- **沙箱**：2 CPU / 4 GB，软件 WebGL，无网络，镜像内有 ffmpeg、ffprobe（`Dockerfile:96`）和 `Noto Sans CJK SC`（`fonts-noto-cjk`，`Dockerfile:112`）。
- **静态测试**：`tests/test_remotion_image.py` 钉模板依赖、lockfile、Dockerfile 顺序、vendor 哈希和 SKILL.md 规则；`tests/test-docker-image.sh` 在构建好的镜像里做离线 still。
- **基础镜像**：`Dockerfile:6` `FROM ubuntu:24.04` 没钉 digest，`release.json` 也不记它。2026-11-12 Docker Hub 把 tag 换成 `noble-20261110`，11-13 的构建因此整层漂移，靠手工钉回 `noble-20261024.1`（`ubuntu@sha256:78d4744e…`）才复现出原镜像。
- **生产链路事实**（2026-11-16 实测）：dmxapi（`www.dmxapi.cn`）上 `qwen3.8-27b`、`doubao-seedream-5-0-flash-260915`、`mimo-v2.5-tts` 都在模型列表里；mimo 只走 `chat/completions`，`/v1/audio/speech` 返回 404；seedream 在 dmxapi 上走 `/api/v3/images/generations`，不是 `/v1`；生产已能稳定生图，配置以生产为准。

## 社区素材（许可证已核对，2026-11-16）

调研报告在会话 scratchpad，结论如下。

| 来源 | 许可证 | 用法 |
| --- | --- | --- |
| Onda（`degueba/onda`，commit `3c814051`） | MIT | **底座**。组件由 props 驱动，带 zod schema，内联样式；共享 `lib/` 约 1000 行，无外部依赖；`lib/composition.ts` + `lib/composition-renderer.tsx` 是现成的 JSON 时间轴渲染器。要改：`composition.ts:18` 的 zod v3 写法、`picsum.photos` 默认图、`PlacementBox` 居中时只有半幅宽（`lib/canvas.tsx:95-121`）。 |
| RenderComp（`RenderComp/free-remotion-templates`） | MIT | 整场景参考：ChapterTitle、SplitScreen、KpiCounter、BarChartAnim、LineChartAnim。要换写死的 `FONT`、把帧号改成参数。 |
| Remocn（`Remocn/remocn`） | MIT | 约 15 个：three-steps、dumbbell-shift、exploded-view、caption-subtitle + caption-core、ink-arrow、drift、focus-pull、push-through 等。785 项里 505 项要联网加载谷歌字体，排除；按空格断行的 said-who、hook-uncurl、answer-first、keep-words 排除；第三方品牌界面类排除。 |
| remotion-bits | MIT（只在 package.json 声明，无 LICENSE 文件） | 只借原语；依赖未安装的 `culori`。 |
| video-shotcraft | Apache-2.0 | 《审美准则》27 条（R/Q/S/C/P），已分成"能量的 / 能从源码查的 / 要人看的"三类；宣传片专属条目科普不用。音频不在 Apache 范围内，不拿。 |
| video-talkcraft、anything2explainer | PolyForm Noncommercial 1.0.0 | 用户已批准使用（本项目不营利）。借：anything2explainer 的解说词格式（章 ≤6 字、`|` 切字幕块 ≤16 字、空行分段）和"逐块合成、累计时长"的配音时间轴；talkcraft workbench 的"参数表 + 轨道/片段"结构和"讲什么 → 画什么"语义词表。拷文件时保留各自 `LICENSE:3` 的 Required Notice。 |

**中文的硬问题**（读代码确认）：`@remotion/captions` 4.0.537 只在以空格开头的 token 前分页（`create-tiktok-style-captions.ts`），中文整段会成一页，必须自己设 `pageBreakAfter`；多数组件按空格切词、`nowrap`、按 ASCII 估字宽、负字距、行高 1.0–1.1 加遮罩，都会让中文溢出或被裁切；数字格式要用万/亿。

## 设计

### 1. 工具箱放在模板里

- 工具箱是 `/opt/remotion-template` 的一部分，不另开目录：`src/kit/`（主题、组件、渲染器、schema）和 `bin/`（命令）。项目照旧拷模板，工具箱随之到位，`node_modules` 照旧共享只读。
- 不新增 npm 依赖。组件是拷进来的源码，只用已安装的包。
- 模型照这个顺序走，全部是沙箱里的命令（建项目用 `node /opt/remotion-template/bin/kit.mjs new <name>`，之后在项目目录里用 `node bin/kit.mjs <子命令>`）：
  1. `new <name>`：建 `/home/assistant/videos/<name>`，放一份示例 `script.json`；目录非空就失败，不覆盖旧项目；
  2. 写 `script.json`；
  3. 用现有生图工具配图，`image "<路径>"` 把图拷进 `public/images/`，打印要写进 `script.json` 的文件名；
  4. `voice`：列出每个字幕块要调的 `generate_speech`，文件名带"字幕文本 + 音色 + 声音说明"的短哈希；模型调完后 `voice-import` 按文件名前缀找回（含自动加的序号后缀），拷进 `public/voice/`；
  5. `timeline`：切首尾静音、按解码后的音频测时长、拼音轨并归一到 -16 LUFS，生成 `timeline.json`；字幕改了而配音没重做，按哈希报错；
  6. `check`：后台运行，`status` 查结果；校验 schema 和机械规则，渲染关键帧拼图，打印是/否清单；答"否"的要改了重查；
  7. `render`：后台渲染，先写到项目里，ffprobe 验过才原子地移到 `/mnt/user-data/files/<name>.mp4`；`status` 能区分进行中、成功、失败和被杀。
- 任何一步的输入不对都直接失败，报错写明哪个场景、哪个字段、怎么改。不在画面里渲染错误占位。

### 2. `script.json`

- zod 4 schema，`z.discriminatedUnion('kind', …)`；用 `z.toJSONSchema()` 导出 JSON Schema 放进 skill，模型照它写。
- 固定 1920×1080、30 fps；总时长 60–180 秒，超出时 `timeline` 报错。
- 骨架：开场钩子 1 个 → 3–5 章（章名 ≤6 字，每章 1–4 个场景）→ 小结 → 片尾。
- 顶层：标题、BGM（曲目 id 或 `none`）、骨架。主题首刀只有 `explainer` 一套，样片集里给亮色和深色两版供用户挑。
- 场景：`kind`、旁白（1–4 句，每句由若干 ≤16 字的字幕块组成；片尾可以没有旁白，固定 3 秒）、该 kind 的内容字段（要点、数字、对比两栏、步骤等）、可选配图（`image`：`public/images/` 里的纯文件名，不能带路径）。
- 场景种类：开场钩子、小结、片尾是必需的；正文候选为设问、概念卡（kicker/标题/要点/结论）、步骤流程（带箭头）、因果、对比、时间线（年份 + 事件）、关键数字、简单图表（柱/线）、图片推拉加标注、定义/引用，最终只保留用户在样片集里批准的。
- `custom`：每片最多 1 个，模型在 `src/custom/` 下自己写这一屏的 TSX，同样要过 `check`。
- 时长由配音决定：同句字幕块之间 0.06 秒，句间 10 帧，场景末 20 帧，章前 45 帧，片头 40 帧，片尾 90 帧（取自 anything2explainer）。场景长度取"旁白加间隔"和"组件最短时长"中较长的那个。片尾 90 帧就是片尾场景的收尾部分，无旁白的片尾正好 3 秒。每个场景交界有一个 15 帧转场，放在上一场景最后一个字幕块之后的停顿（20 或 45 帧）的最后 15 帧里，不压旁白、不改总时长。

### 3. 组件和主题

- 一套主题 token：配色、字号阶梯（标题、正文、字幕各有下限）、安全边距、几组固定的弹性参数。所有组件只读 token。
- 一个中文文本助手，所有组件共用：按标点或 `Intl.Segmenter` 分句分词（沙箱 Chrome 是否带中文分词数据要先验证）、标点不落行首、字距约 0、行高 ≥1.25、万/亿格式。
- 字幕：自己生成分页（按标点和字数设 `pageBreakAfter`），白字描边，固定在下方安全区。
- 转场：`@remotion/transitions` 加 Onda、Remocn 各挑一两种，全片统一。
- BGM：按场景时间线压低。有旁白时比人声低约 15 dB，无旁白时约 -6 dB，进出淡入淡出。
- 每个组件附一个样片（短视频 + 关键帧），放进样片集网页，用户标「过 / 重做 / 不要」，只有「过」的进工具箱。

### 4. `check`

- 机械检查，不过就失败：
  - schema；每屏字数上限；字幕块 ≤16 字；
  - 文字溢出（渲染时读 DOM 尺寸，或 `@remotion/layout-utils` 测量）、最小字号；
  - 关键信息落定后静止 ≥1 s（shotcraft R1），批量动效收尾静止 ≥0.5 s；
  - 无旁白的动画段 ≤3 s（C1 后半）；
  - 场景时长与配音一致；图片、字体、音频文件都在；
  - `custom` 场景不超过 1 个。
- 之后渲染关键帧拼图（沿用现有的 2x2 contact sheet），打印十来个是/否问题，模型看图逐条作答，答"否"的要改。问题从 shotcraft 的"要人看"一类里挑科普适用的：主角是否唯一、文字是否完整可读、画面与旁白是否对应、有无空白或黑屏等。

### 5. CC0 背景音乐

- 16 首，四类：calm/curious、upbeat/corporate、neutral/serious、loop。
- 只收能逐首核验许可的：实时页面写着 CC0，或存档声明加哈希能对上（FreePD 已关站，用 Wayback 的原始文件 digest 比对 IA 镜像）。各站点的"CC0 筛选"一律不直接信；Kevin MacLeod 有 CC BY 重复发布并登记 ISRC 的曲目排除。
- 统一归一到 -16 LUFS / -1.5 dBTP。
- 做一个试听页给用户，用户勾选的才打进镜像。`manifest.json` 记录来源 URL、许可 URL、证据快照、sha256、标题、作者、类别和 `approved_by`。

### 6. skill

- `SKILL.md` 改成路由（不超过 80 行）：科普讲解走工具箱的步骤；其他类型（课程、宣传、汇报）暂时照旧流程。
- 路由这一刀只在盲评验收通过后才合并；之前合并的工具箱代码没有入口，不影响现网行为。
- 运行细节（渲染、轮询、失败排查）挪到同目录的参考文件。官方 best-practices 只在写 `custom` 场景时读。
- NOTICE、THIRD-PARTY-LICENSES 补上 Onda、RenderComp、Remocn、remotion-bits（MIT）、shotcraft（Apache-2.0）、talkcraft 和 anything2explainer（PolyForm NC Required Notice）。字体只用镜像里已有的 Noto Sans CJK SC（apt 包），不另打包字体。

### 7. 基础镜像

- `Dockerfile` 改为 `FROM ubuntu:24.04@sha256:<digest>`，钉当前生产在用的 `noble-20261024.1`。
- `release.py` 把基础镜像 digest 记为 workspace 的构建材料。
- 加一条测试：`FROM` 不带 digest 时失败。

### 8. 评测

- 在 210.77.77.27 上起一套完整 WebUI + OCU 栈：独立 compose 项目名 `ocu-eval`，端口只绑 127.0.0.1，镜像从发布包 `docker load`，镜像代码不做任何修改，不跑 bootstrap 里设置主机防火墙和网络的步骤。沙箱用 OCU 已支持的 `ENABLE_NETWORK=false` 断网（OCU 会拒绝 internal 网络，`docker_manager.py:821-828`）。
- 磁盘：包、产物、成片放 `/home/nwm/ocu-eval/`；对话工作区是 Docker volume，落在根分区（剩约 28G）。只加载评测要用的镜像（不带 documentserver 和 retention-guard）；根分区空闲低于 15G 就不启动。清理只删本项目加载的镜像、compose 容器和网络，以及运行记录里那些 chat id 的沙箱容器和工作区 volume，不 prune。
- 模型 `qwen3.8-27b`（dmxapi），生图 `doubao-seedream-5-0-flash-260915`，配音 `mimo-v2.5-tts`。`DMXAPI_KEY` 长期放在 `/home/nwm` 下 0600 文件里，只按变量名引用。
- 配音转接：评测栈里跑一个小服务，把 `POST /audio/speech` 转成 dmxapi mimo 的 `chat/completions` 音频调用。只用于评测，生产代码不变。
- 评测脚本从本机发起，经 WebUI 聊天 API 发请求，和生产同一条链路，打开视频开关。
- 请求集：科普 5 个，每个跑 2 遍；课程、宣传、汇报各 1 个（只留作后续预设的基线）。改造前、后各跑一轮。
- 验收：科普的 10 对成片（同一请求、同一遍次的前后版本）打乱顺序给用户两两盲评，新版至少赢 8 对；另外渲染成功率和 `check` 通过率要达标（数值在 change 里定）。

## Not In Scope

- 课程、宣传、汇报三种预设（只在评测里留基线）。
- 竖屏 9:16。
- 3D 场景。
- 音效（SFX）库。
- Remotion Studio 预览。
- 修改 `generate_speech` 或让生产直接支持 mimo 协议。
- 生图相关代码（WebUI 图像生成、OCU 的生成图同步）：生产已能稳定生图，2026-11-16 用户明确要求不动。科普预设只消费生成好的图片。
- 视频开关和 skill 门控的行为。
- 新增 npm 依赖。

## Decision Ledger（2026-11-16，用户拍板）

| 分支 | 结论 |
| --- | --- |
| 质量标准 | 官方和社区的好案例；动效库不是标准 |
| 生产模型 | `qwen3.8-27b`，能看图，没有更强的模型；生产配了语音和生图 |
| 首刀预设 | 科普讲解，16:9，1–3 分钟，中文配音，配图用生图 |
| 分工 | 模型只写 `script.json`；科普片最多 1 个 `custom` 场景；其他类型暂走旧流程 |
| 组件来源 | Onda 为底座，RenderComp、Remocn 补充；PolyForm NC 的两个项目可以用（本项目不营利） |
| 组件审片 | 样片集用户审过才进工具箱；主题给亮色和深色两版供用户挑 |
| 背景音乐 | 要；挑一批 CC0，16 首四类；我核验许可，用户试听定稿 |
| 基础镜像 | 先钉 digest，作为本变更的第一个 issue |
| 评测地点 | 210.77.77.27，完整 WebUI + OCU 栈；key 长期放 0600 文件 |
| 评测配音 | 评测栈里加转接服务，生产不改 |
| 评测规模与验收 | 科普 5×2 + 其他各 1；用户盲评，新版至少赢 8/10 对，加机械指标 |

## 开放项

- 生产的生图设置（引擎、base URL、模型、尺寸）：用户提供，评测栈照抄，不改代码。dmxapi 的生图接口是 `POST https://www.dmxapi.cn/api/v3/images/generations`（`https://doc.dmxapi.cn/doubao-seedream-5-5-261028-text-to-image.html`；协议同火山方舟 Seedream，`https://docs.volcengine.com/docs/ark/seedream-5-5?lang=zh`）：`size` 为 `1K`/`1.5K`/`2K` 或总像素 921600–4624220 的具体值，`watermark` 默认 `true`。`doubao-seedream-5-0-flash-260915` 另有单独文档页，评测栈以生产实际配置为准。
- 沙箱 Chrome Headless Shell 是否带中文分词数据（`Intl.Segmenter('zh', {granularity: 'word'})`）：第一个组件任务先验证，没有就按标点和字数切。
- 渲染成功率、`check` 通过率的验收阈值：先跑基线再定。
