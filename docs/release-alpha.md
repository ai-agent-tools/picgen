# PicGen Alpha Release Checklist

This checklist is for the first internal or friend-and-colleague trial of PicGen.

## Install

```bash
node -v
npm -v
npm install -g @ai-agent-tools/picgen
npx -y skills add ai-agent-tools/picgen --skill picgen -g -y --copy
picgen skill install codex
picgen --help
picgen quickstart
```

Node.js 20 or newer is required.

`npx -y skills add ...` is the preferred cross-agent skill installation path when supported. `picgen skill install codex` installs the bundled PicGen skill into `~/.codex/skills/picgen` as a Codex-only fallback. Restart the agent or start a new session if the skill is not visible yet.

## Agent Prompt

Send this to Codex, Trae, Claude Code, or a similar coding agent:

```text
请帮我安装并配置 PicGen 生图工具。请先阅读并按这个指南执行：https://raw.githubusercontent.com/ai-agent-tools/picgen/refs/heads/main/docs/agent-install.md 。你负责判断是否在本机持久环境、安装 CLI 和 skill、引导我配置 provider/API key，并先预览生成方案，等我确认后再生成测试图。不要让我理解命令细节，也不要让我把 API key 发到聊天里。
```

## First Run

1. Run setup:

```bash
picgen setup
```

2. Use quick-add unless you already know the provider protocol details.

3. Provider host URLs should be host-only:

```text
https://www.pandai.vip
https://api.openai.com
https://generativelanguage.googleapis.com
```

Do not include `/v1` or `/v1beta`.

4. Configure API keys:

For non-technical users, prefer `picgen setup`. It can save provider API keys in PicGen's managed env file:

```text
~/.picgen/.env
```

PicGen loads this file automatically.

Agents should inspect keys with `picgen key list/show`, which only prints masked status. If a technical user needs the complete saved value, point them to `~/.picgen/.env`; a project `.env` may override it, and shell environment variables have highest priority.

In agent environments where interactive terminal prompts are not visible, ask the user for provider type, host, and API key in chat, then use non-interactive commands. Example for a Gemini-compatible third-party channel:

```bash
picgen provider quick-add gemini-proxy --host https://www.pandai.vip --prefer
picgen key set PICGEN_GEMINI_PROXY_KEY --stdin
picgen provider test gemini_proxy --json
```

Advanced users can still use shell environment variables or a local project `.env`:

```bash
cp .env.example .env
```

```text
OPENAI_API_KEY=...
GEMINI_API_KEY=...
```

5. Check configuration:

```bash
picgen doctor --json
```

6. Check whether a newer PicGen version is available:

```bash
picgen update check
```

## Safe Preview

Always start with dry-run:

```bash
picgen create --dry-run --preset fast-draft "一张简洁的 PicGen 测试图"
```

Dry-run does not call providers and does not spend quota.

## Real Generation

After the preview looks right:

```bash
picgen create "一张极简科技感产品海报"
```

The CLI asks for confirmation before calling the provider. Use `--yes` only when you intentionally want to skip the prompt:

```bash
picgen create --yes "一张极简科技感产品海报"
```

## Reference Image Trial

Reference images are supported through Gemini providers in Alpha:

```bash
picgen create --dry-run --reference ./reference.png "基于参考图生成一张品牌海报"
picgen create --yes --reference ./reference.png "基于参考图生成一张品牌海报"
```

If the default provider does not support reference images, PicGen routes to a capable fallback provider. If the user explicitly selects an unsupported provider, PicGen fails clearly instead of ignoring the reference image.

## Expected Output

Generated images are saved locally under `outputs/picgen` by default. CLI output includes:

- `output_dir`
- `metadata_path`
- image path
- MIME type
- width and height when PicGen can read them

Provider image payloads and Gemini thought signatures are redacted from metadata.

## Current Alpha Limits

- OpenAI-compatible providers use `/v1/images/generations` for text-to-image and `/v1/images/edits` with multipart `image[]` / `mask` uploads for reference-image or mask edits.
- Gemini providers support reference images and mask-guided edits through `generateContent`; mask edits are guidance-based, not native inpainting.
- Gemini may return PNG even when a preset says jpeg or webp; PicGen does not transcode output formats yet.
- API keys are read from environment variables or `.env`; keychain storage is not implemented.
- Full Codex plugin packaging is not implemented yet. Use the bundled skill instructions or CLI directly.
- Multi-reference limits are not model-specific yet.

## Troubleshooting

`Missing API key environment variable`

Set the environment variable named in the error, or put it in `.env` in the current working directory.

`Provider host URL`

Use only the host. Do not add `/v1`, `/v1beta`, or endpoint paths.

`Provider "... " does not support reference-image` or `mask-guided-edit`

Use a provider that supports the requested image workflow, or remove `--reference` / `--mask`.

`Provider check failed`

Run:

```bash
picgen provider test <provider-name> --json
```

Check `base_url`, API key, model name, and provider availability.

`Provider request timed out`

High quality, large, or slow third-party image channels can take longer. Try again, use a faster preset, or raise the request timeout:

```bash
PICGEN_PROVIDER_TIMEOUT_MS=450000 picgen create --yes --preset poster "<prompt>"
```

`No enabled provider can satisfy...`

Run `picgen provider list`, enable a provider, add a fallback provider, or adjust the selected mode/model.

## Release Gate

PicGen publishes npm releases through GitHub Actions and npm Trusted Publisher.

Trusted Publisher settings on npm:

- Publisher: GitHub Actions
- Organization or user: `ai-agent-tools`
- Repository: `picgen`
- Workflow filename: `publish.yml`
- Environment name: `npm`
- Allowed actions: `Allow npm publish`

Before creating a release tag:

```bash
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

Publish when ready by bumping the package version and pushing the generated tag:

```bash
npm version prerelease --preid=alpha
git push github main --follow-tags
```

The workflow only publishes on pushed tags matching `v*`. Normal pushes to `main` do not publish.

The tag version and `package.json` version must match. npm versions are immutable; never reuse a version that has already been published. Alpha prereleases are published with an explicit npm dist-tag so npm accepts the prerelease publish and `@latest` installs continue to work for current trial users.

After publishing, ask trial users to upgrade with:

```bash
npm install -g @ai-agent-tools/picgen@latest
```
