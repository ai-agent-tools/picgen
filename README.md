# PicGen

PicGen is a lightweight image generation connector for AI agents. It lets Codex and similar agents turn the current conversation context into images through user-owned providers and API keys.

Alpha goals:

- TypeScript Node.js CLI
- OpenAI-compatible `/v1/images/generations` adapter
- Gemini image API adapter
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

## Configuration

By default PicGen reads and writes:

```text
~/.picgen/config.yaml
```

You can override it for development:

```bash
PICGEN_CONFIG=/path/to/picgen.yaml npm run dev -- doctor
```
