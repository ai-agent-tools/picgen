# PicGen

PicGen is a lightweight image generation connector for AI agents. It lets Codex and similar agents turn the current conversation context into images through user-owned providers and API keys.

Alpha goals:

- TypeScript Node.js CLI
- OpenAI-compatible `/v1/images/generations` adapter
- Gemini image API adapter
- Gemini reference-image generation
- `provider + preset + routing` configuration
- `picgen setup`, `picgen doctor`, `picgen create --dry-run`
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
npm install -g @ai-agent-tools/picgen
picgen skill install codex
picgen --help
picgen quickstart
```

Agent trial prompt:

```text
请安装并体验 @ai-agent-tools/picgen：全局安装 npm install -g @ai-agent-tools/picgen。如果当前是 Codex，请运行 picgen skill install codex 安装 PicGen skill。然后引导我配置 provider 和 API key，先 dry-run 预览，再确认生成一张测试图。如果我要用参考图，请使用 --reference <图片路径>。
```

For first-user rollout, see [docs/release-alpha.md](./docs/release-alpha.md).

## Commands

```bash
picgen setup
picgen quickstart
picgen skill install codex
picgen update check
picgen doctor --json
picgen create --dry-run "一张产品发布会主视觉"
picgen create --yes "一张产品发布会主视觉"
picgen create --dry-run --provider gemini_official --reference ./reference.png "基于参考图生成一张品牌海报"
picgen create --yes --provider gemini_official --reference ./reference.png "基于参考图生成一张品牌海报"
picgen provider list
picgen provider add
picgen provider quick-add gemini-proxy --host https://www.pandai.vip --prefer
picgen key set PICGEN_GEMINI_PROXY_KEY --stdin
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

`--reference <path>` can be repeated to pass local reference images. Alpha supports reference images through the Gemini adapter. The OpenAI-compatible `/v1/images/generations` adapter does not support reference images yet; use a Gemini provider for reference-image generation.

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

Providers expose capabilities such as `text-to-image` and `reference-image`. Old configs that omit capabilities are upgraded in memory from the provider protocol: Gemini supports both text and reference-image generation, while OpenAI-compatible `/v1/images/generations` supports text-to-image only.

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
