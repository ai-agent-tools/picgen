# PicGen Agent Installation Guide

Use this guide when a user asks an agent such as Codex, Trae Work, or Claude Code to install and configure PicGen for them.

## Goal

Install PicGen in the user's persistent local environment, configure one image provider, save the API key without exposing it in chat, run a low-cost preview, and generate one test image only after user confirmation.

## 1. Check Environment

Before installing anything or saving API keys, determine whether the current terminal is the user's persistent local environment or a sandbox/temporary environment.

Run lightweight checks:

```bash
pwd
echo "$HOME"
node -v
npm -v
npm root -g
which picgen || true
```

If this appears to be a sandbox, remote container, temporary workspace, or a terminal that cannot write to the user's real home directory, do not install PicGen, install skills, or save API keys there. First request permission to use the user's host/persistent terminal. If permission is unavailable or denied, give the user the shortest local-terminal command sequence possible.

User-facing wording:

```text
我检测到当前可能是临时沙箱。PicGen 需要安装到你的本机持久环境，否则新会话可能会丢失 CLI、skill 或 API key。请允许我在本机持久环境中继续安装和配置；如果无法授权，我再给你最少的本机终端命令。
```

## 2. Check Node.js

PicGen requires Node.js 20 or newer and npm.

```bash
node -v
npm -v
```

If either command is missing, guide the user to install the Node.js LTS version first. After installation, verify both commands show versions.

## 3. Install CLI And Skill

Install the CLI:

```bash
npm install -g @ai-agent-tools/picgen@latest
picgen --version
```

Install the PicGen skill:

```bash
npx -y skills add ai-agent-tools/picgen --skill picgen -g -y --copy
```

If the Skills installer is unavailable and the current agent is Codex, use the fallback:

```bash
picgen skill install codex --force
```

If the skill does not become visible immediately, ask the user to restart the agent or open a new session.

## 4. Configure Provider

Do not run `picgen setup` if interactive terminal prompts are not visible to the user. Ask in chat for:

- Provider type: Gemini or OpenAI-compatible.
- Provider host: host only, such as `https://www.pandai.vip`; do not include `/v1` or `/v1beta`.
- API key: ask the user to copy it to the clipboard and reply "copied"; do not ask them to paste the key into chat.

Gemini-compatible third-party channel:

```bash
picgen provider quick-add gemini-proxy --host https://www.pandai.vip --prefer
picgen key set PICGEN_GEMINI_PROXY_KEY --clipboard
picgen key show PICGEN_GEMINI_PROXY_KEY --json
picgen provider test gemini_proxy --json
```

OpenAI-compatible third-party channel:

```bash
picgen provider quick-add openai-proxy --host https://www.pandai.vip --prefer
picgen key set PICGEN_OPENAI_PROXY_KEY --clipboard
picgen key show PICGEN_OPENAI_PROXY_KEY --json
picgen provider test openai_proxy --json
```

If clipboard access is unavailable, use `picgen key set <ENV_NAME>` and let the user paste into the hidden terminal prompt, or pass the key through stdin if the runtime can do that safely. Never put API keys in shell history.

When discussing configured keys, say:

```text
在对话里我只读取脱敏后的 key 状态，不读取完整密钥。需要查看或编辑完整配置时，可以打开 ~/.picgen/.env；当前项目目录下的 .env 可能会覆盖它；shell 环境变量优先级最高。
```

## 5. First Smoke Test

The first image generation should be cheap and fast: one image, `fast-draft`, no premium/large/poster preset.

For Gemini providers, use the flash image model:

```bash
picgen create --dry-run --provider gemini_proxy --preset fast-draft --model gemini-3.1-flash-image-preview "一张简洁的 PicGen 测试图，白色背景，少量蓝绿色科技感点缀"
```

For OpenAI-compatible providers:

```bash
picgen create --dry-run --provider openai_proxy --preset fast-draft "一张简洁的 PicGen 测试图，白色背景，少量蓝绿色科技感点缀"
```

Show the preview to the user. Only after confirmation, run the same command with `--yes`.

## 6. After Success

After one provider is configured and one test image succeeds, ask whether the user wants to add another channel as a fallback:

```text
当前渠道已经配置并测试成功。你还可以继续添加另一个渠道作为备用。要继续添加吗？
```

If the user says yes, repeat provider setup and smoke testing. If no, stop setup and say PicGen is ready.
