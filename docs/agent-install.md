# PicGen Agent 安装指南

当用户让 Codex、Trae Work、Claude Code 等 Agent 帮忙安装和配置 PicGen 时，请按这份指南执行。

## 目标

把 PicGen 安装到用户的本机持久环境，配置一个生图 provider，安全保存 API key，先生成一次低成本预览，用户确认后再生成 1 张测试图。

不要让非技术用户理解命令细节。Agent 应尽量代办；只有无法获得本机持久环境权限时，才给用户最少的本机终端命令。

## 1. 检查安装环境

安装 CLI、安装 skill、保存 API key 之前，先判断当前终端是用户本机持久环境，还是 sandbox / remote container / 临时环境。

执行轻量检查：

```bash
pwd
echo "$HOME"
node -v
npm -v
npm root -g
which picgen || true
```

如果当前环境看起来是沙箱、远程容器、临时 workspace，或者不能写入用户真实 home 目录，不要把 PicGen、skill 或 API key 安装到这里。请先申请使用用户的本机持久终端或持久用户级环境。

建议话术：

```text
我检测到当前可能是临时沙箱。PicGen 需要安装到你的本机持久环境，否则新会话可能会丢失 CLI、skill 或 API key。请允许我在本机持久环境中继续安装和配置；如果无法授权，我再给你最少的本机终端命令。
```

如果获得权限，就继续在本机持久环境中代办。只有无法申请权限或用户拒绝时，才让用户复制命令到本机终端执行。

## 2. 检查 Node.js 和 npm

PicGen 依赖 Node.js 20 或更新版本，以及 npm。

```bash
node -v
npm -v
```

如果命令不存在，请先指导用户安装 Node.js LTS 版本。安装后再次验证 `node -v` 和 `npm -v` 能正常显示版本号。

## 3. 安装 CLI 和 Skill

安装 PicGen CLI：

```bash
npm install -g @ai-agent-tools/picgen@latest
picgen --version
picgen open --help
```

安装 PicGen skill：

```bash
npx -y skills add ai-agent-tools/picgen --skill picgen -g -y --copy
```

如果 `skills` 安装器不可用，且当前是 Codex，可以使用 Codex fallback：

```bash
picgen skill install codex --force
```

如果安装后 Agent 暂时看不到 skill，请提醒用户重启 Agent 或新开一个会话。

## 3.1 打开本地网页

如果用户说“打开 PicGen”、“打开生图工具”、“我想用网页配置/生图/找回图片”，请启动本地网页：

```bash
picgen open
```

PicGen 默认绑定本机 `127.0.0.1:8188`。如果端口被占用，会自动尝试后续端口。把命令输出的 URL 发给用户即可。这个服务不是常驻后台服务，终端关闭后网页也会关闭。

如果当前是沙箱或临时环境，不要在沙箱里启动给用户使用的网页；请先申请使用用户本机持久环境。无法申请时，再指导用户在本机终端执行 `picgen open`。

默认安装和首次代办配置时，Agent 仍优先使用剪贴板方式写入 API key，因为步骤少、不中断对话。网页适合用户想自己管理、排查或直接生图时打开。

网页适合普通用户完成这些事：

- 配置多个 provider，并选择默认 provider。
- 保存和查看 API key；默认脱敏，用户可在本地页面点击眼睛图标查看完整 key。
- 查看 key 来源：终端环境变量、当前项目 `.env`，或 PicGen 管理文件 `~/.picgen/.env`。
- 预览生成方案，确认后生成图片。
- 查看历史记录和本地保存路径，找回生成过的图片。

## 4. 配置 Provider

如果交互式终端选择项无法展示给用户，不要运行会阻塞的 `picgen setup`。请在聊天中询问：

- Provider 类型：Gemini 或 OpenAI-compatible。
- Provider host：只填域名，例如 `https://www.pandai.vip`，不要加 `/v1` 或 `/v1beta`。
- API key：请用户复制到剪贴板，然后回复“已复制”。不要让用户把 key 直接发到聊天里。

Gemini 第三方渠道：

```bash
picgen provider quick-add gemini-proxy --host https://www.pandai.vip --prefer
picgen key set PICGEN_GEMINI_PROXY_KEY --clipboard
picgen key show PICGEN_GEMINI_PROXY_KEY --json
picgen provider test gemini_proxy --json
```

OpenAI-compatible 第三方渠道：

```bash
picgen provider quick-add openai-proxy --host https://www.pandai.vip --prefer
picgen key set PICGEN_OPENAI_PROXY_KEY --clipboard
picgen key show PICGEN_OPENAI_PROXY_KEY --json
picgen provider test openai_proxy --json
```

如果不能读取剪贴板，可以让用户运行 `picgen key set <ENV_NAME>`，在隐藏输入框里粘贴 key；或者在运行环境安全支持时，通过 stdin 写入。不要把 API key 放进 shell history。

解释 key 检查时，使用这个口径：

```text
在对话里我只读取脱敏后的 key 状态，不读取完整密钥。需要查看或编辑完整配置时，可以打开 ~/.picgen/.env；当前项目目录下的 .env 可能会覆盖它；shell 环境变量优先级最高。
```

## 5. 首次轻量测试

首次测试只验证工具和渠道是否可用，应低成本、快速、只生成 1 张。不要用 `poster`、`product-shot`、`social-cover`，不要用 premium / large / high 多图方案。

Gemini provider 首次测试优先用 flash image model：

```bash
picgen create --dry-run --provider gemini_proxy --preset fast-draft --model gemini-3.1-flash-image-preview "一张简洁的 PicGen 测试图，白色背景，少量蓝绿色科技感点缀"
```

OpenAI-compatible provider 首次测试：

```bash
picgen create --dry-run --provider openai_proxy --preset fast-draft "一张简洁的 PicGen 测试图，白色背景，少量蓝绿色科技感点缀"
```

把 dry-run 预览展示给用户。用户确认后，再执行同一条命令并加上 `--yes`。

## 6. 测试成功后

一个 provider 配置并测试成功后，主动询问用户是否要继续添加备用渠道：

```text
当前渠道已经配置并测试成功。你还可以继续添加另一个渠道作为备用。要继续添加吗？
```

如果用户说继续，就重复 provider 配置和轻量测试流程。如果用户说不用，就结束配置，并告诉用户 PicGen 已经可以使用。
