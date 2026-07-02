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

## Commands

```bash
picgen setup
picgen doctor --json
picgen create --dry-run "一张产品发布会主视觉"
picgen create --yes "一张产品发布会主视觉"
picgen create --dry-run --provider gemini_official --reference ./reference.png "基于参考图生成一张品牌海报"
picgen create --yes --provider gemini_official --reference ./reference.png "基于参考图生成一张品牌海报"
picgen provider list
picgen provider add
picgen provider test openai_official --json
picgen provider prefer gemini_official
picgen provider disable gemini_proxy
picgen provider remove gemini_proxy
picgen mode prefer premium
picgen preset prefer poster
```

`picgen setup` is repeatable. Use it to choose the default provider, choose the default generation preference, test providers, or add a new provider/channel.

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
PICGEN_OPENAI_PROXY_KEY=...
PICGEN_GEMINI_PROXY_KEY=...
```

Provider `base_url` values should be host-only. Do not include `/v1` or `/v1beta`; PicGen adds protocol paths automatically.

Providers may optionally set `test_model` in `~/.picgen/config.yaml` when health checks should use a lightweight model instead of the first generation model.

Generated image data and provider-only fields such as base64 image payloads and Gemini thought signatures are redacted from metadata. PicGen keeps the generated assets as local image files and keeps stdout compact for agent workflows.
