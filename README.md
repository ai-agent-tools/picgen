# PicGen

PicGen is a lightweight image generation connector for AI agents. It lets Codex and similar agents turn the current conversation context into images through user-owned providers and API keys.

Alpha goals:

- TypeScript Node.js CLI
- OpenAI-compatible `/v1/images/generations` and `/v1/images/edits` adapter
- Gemini image API adapter
- Reference-image and mask-guided image editing
- `provider + preset + routing` configuration
- `picgen setup`, `picgen doctor`, `picgen create --dry-run`
- Local web interface with settings, generation, and history
- Local Codex skill instructions

## Development

Project conventions are documented in [AGENTS.md](./AGENTS.md).

```bash
npm install
npm run dev -- --help
npm run typecheck
npm run build
```

## Install

```bash
node -v
npm -v
npm install -g @ai-agent-tools/picgen
npx -y skills add ai-agent-tools/picgen --skill picgen -g -y --copy
picgen skill install codex
picgen --help
picgen quickstart
picgen open
```

Use `npx -y skills add ...` for cross-agent skill installation when supported. `picgen skill install codex` is a Codex-only fallback that copies the bundled skill into `~/.codex/skills/picgen`.

Agent trial prompt:

```text
请帮我安装并配置 PicGen 生图工具。请先阅读并按这个指南执行：https://raw.githubusercontent.com/ai-agent-tools/picgen/refs/heads/main/docs/agent-install.md 。你负责判断是否在本机持久环境、安装 CLI 和 skill、引导我配置 provider/API key，并先预览生成方案，等我确认后再生成测试图。不要让我理解命令细节，也不要让我把 API key 发到聊天里。
```

For agent-assisted installation, see [docs/agent-install.md](./docs/agent-install.md). For first-user rollout, see [docs/release-alpha.md](./docs/release-alpha.md).

## Commands

```bash
picgen setup
picgen quickstart
picgen open
npx -y skills add ai-agent-tools/picgen --skill picgen -g -y --copy
picgen skill install codex
picgen update check
picgen doctor --json
picgen create --dry-run --preset fast-draft "一张简洁的 PicGen 测试图"
picgen create --yes --preset fast-draft "一张简洁的 PicGen 测试图"
picgen create --n 2 --size 1088x576 --quality low "生成两张横版活动 banner"
picgen create --aspect-ratio 16:9 --size medium "生成一张横版封面"
picgen create --dry-run --reference ./reference.png "基于参考图生成一张品牌海报"
picgen create --yes --reference ./reference.png "基于参考图生成一张品牌海报"
picgen create --dry-run --reference ./room.png --mask ./mask.png "只把沙发换成蓝色"
picgen provider list
picgen provider add
picgen provider quick-add gemini-proxy --host https://www.pandai.vip --prefer
picgen key set PICGEN_GEMINI_PROXY_KEY --clipboard
picgen key set PICGEN_GEMINI_PROXY_KEY --stdin
picgen key list --json
picgen provider test openai_official --json
picgen provider prefer gemini_official
picgen provider disable gemini_proxy
picgen provider remove gemini_proxy
picgen mode prefer premium
picgen preset prefer poster
```

`picgen setup` is repeatable. Use it to quick-add a common provider/channel, choose the default provider, choose the default generation preference, test providers, or add a custom provider/channel.

Quick-add setup asks only for the essentials: provider name, host URL, API key environment variable, and model list with recommended defaults. Advanced custom setup is still available when you need to choose protocol and channel manually.

Real `picgen create` calls ask for confirmation before contacting a provider. Use `--yes` only when you want to skip that CLI confirmation.

`picgen open` starts a local web interface at `127.0.0.1`, defaulting to port `8188`. It is a foreground local server: keep the terminal open while using the page, and press Ctrl+C to close it. The page can configure multiple providers, save API keys to PicGen's managed env file, preview generation plans, generate images, and browse saved history under `outputs/picgen`.

`--reference <path>` can be repeated to pass local reference images. OpenAI-compatible providers use `/v1/images/edits` with multipart `image[]` uploads for reference-image generation, while Gemini providers pass references through `generateContent`. `--mask <path>` can be used with `--reference` for local edits: OpenAI-compatible providers send a native multipart `mask` file to `/v1/images/edits`; Gemini providers use the mask as an additional guide image with explicit edit instructions.

One-off generation settings such as `--n`, `--size`, `--aspect-ratio`, `--quality`, and `--output-format` override preset defaults without changing user preferences. OpenAI-compatible providers receive exact `WIDTHxHEIGHT` sizes when `--size` is provided, such as `1088x576`. If only an aspect ratio is known, PicGen maps it to a low-cost 1K size, such as `16:9 -> 1024x576` and `3:4 -> 768x1024`. Gemini providers receive `aspectRatio` plus `imageSize`; exact pixel sizes are converted to the closest supported ratio and usually `1K` for speed and cost.

Gemini generation requests ask for image-only responses with `responseModalities: ["IMAGE"]`. Provider health checks still use a text-only request so they can verify host, key, model, and endpoint readiness without triggering image generation.

## Configuration

By default PicGen reads and writes:

```text
~/.picgen/config.yaml
```

You can override it for development:

```bash
PICGEN_CONFIG=/path/to/picgen.yaml npm run dev -- doctor
```

PicGen also loads `.env` from the current working directory:

```text
OPENAI_API_KEY=...
GEMINI_API_KEY=...
```

For non-technical users, `picgen setup` can save API keys for you in:

```text
~/.picgen/.env
```

PicGen loads this managed env file automatically. Shell environment variables take priority, and a project `.env` can override the managed file for local testing.

Each provider should have its own `api_key_env` value. When adding another provider of the same type, PicGen assigns a new key name by default, such as `PICGEN_GEMINI_PROXY_2_KEY`, so multiple channels do not overwrite each other's API keys.

Older configs that reused the same `api_key_env` across multiple providers are migrated automatically when PicGen loads the config. PicGen keeps the first provider unchanged, assigns unique key names to the later providers, and copies the existing key value into the managed env file when the value is available.

When agents inspect key configuration, they should use `picgen key list/show` so chat output only contains masked key status. To inspect or edit the full saved key directly, open `~/.picgen/.env`; a project `.env` in the current directory may override it, and shell environment variables take highest priority.

You can start from the included example:

```bash
cp .env.example .env
```

Provider `base_url` values should be host-only. Do not include `/v1` or `/v1beta`; PicGen adds protocol paths automatically.

Providers may optionally set `test_model` in `~/.picgen/config.yaml` when health checks should use a lightweight model instead of the first generation model.

Generation requests use adaptive provider timeouts: fast draft requests allow 120s, balanced requests allow 180s, and high quality or large requests allow 300s. If a third-party channel is slower, override it with `PICGEN_PROVIDER_TIMEOUT_MS`:

```bash
PICGEN_PROVIDER_TIMEOUT_MS=450000 picgen create --yes --preset poster "一张产品发布会主视觉"
```

Providers expose capabilities such as `text-to-image`, `reference-image`, `multi-reference-image`, `mask-guided-edit`, and `native-inpaint`. Old configs that omit older capabilities are upgraded from the provider protocol when PicGen loads config. OpenAI-compatible providers support text generation plus image edits through `/v1/images/edits`; Gemini supports references and mask-guided edits through `generateContent`.

Generated image data and provider-only fields such as base64 image payloads and Gemini thought signatures are redacted from metadata. PicGen keeps the generated assets as local image files and keeps stdout compact for agent workflows.

## Updates

Check npm for the latest PicGen version:

```bash
picgen update check
```

`picgen doctor` and `picgen quickstart` may show a lightweight update hint. PicGen caches update checks for 24 hours. Disable update checks with:

```bash
PICGEN_DISABLE_UPDATE_CHECK=1 picgen doctor
```

## Maintainer Release

npm publishing uses GitHub Actions with npm Trusted Publisher. Normal pushes to `main` do not publish; pushing a `v*` tag triggers `.github/workflows/publish.yml`.

```bash
npm run typecheck
npm test
npm run build
npm pack --dry-run
npm version prerelease --preid=alpha
git push github main --follow-tags
```
