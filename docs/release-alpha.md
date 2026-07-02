# PicGen Alpha Release Checklist

This checklist is for the first internal or friend-and-colleague trial of PicGen.

## Install

```bash
npm install -g @ai-agent-tools/picgen
picgen --help
picgen quickstart
```

Node.js 20 or newer is required.

## Agent Prompt

Send this to Codex, Trae, Claude Code, or a similar coding agent:

```text
请安装并体验 @ai-agent-tools/picgen：全局安装 npm install -g @ai-agent-tools/picgen，运行 picgen setup 配置，然后先 dry-run 预览，再确认生成一张测试图。如果我要用参考图，请使用 --reference <图片路径>。
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

4. Set API keys in the shell or a local `.env` file:

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

## Safe Preview

Always start with dry-run:

```bash
picgen create --dry-run "一张极简科技感产品海报"
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

- OpenAI-compatible `/v1/images/generations` supports text-to-image only.
- OpenAI reference images need a future `/v1/images/edits` adapter.
- Gemini may return PNG even when a preset says jpeg or webp; PicGen does not transcode output formats yet.
- API keys are read from environment variables or `.env`; keychain storage is not implemented.
- Full Codex plugin packaging is not implemented yet. Use the bundled skill instructions or CLI directly.
- Multi-reference limits are not model-specific yet.

## Troubleshooting

`Missing API key environment variable`

Set the environment variable named in the error, or put it in `.env` in the current working directory.

`Provider host URL`

Use only the host. Do not add `/v1`, `/v1beta`, or endpoint paths.

`Provider "... " does not support reference-image`

Use a Gemini provider or remove `--reference`.

`Provider check failed`

Run:

```bash
picgen provider test <provider-name> --json
```

Check `base_url`, API key, model name, and provider availability.

`No enabled provider can satisfy...`

Run `picgen provider list`, enable a provider, add a fallback provider, or adjust the selected mode/model.

## Release Gate

Before publishing:

```bash
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

Publish when ready:

```bash
npm publish --otp <code>
```
