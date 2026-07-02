# PicGen Project Guidance

## Project Goal

PicGen is a lightweight image generation connector for AI agents. It lets users generate images from the current agent context through their own providers, API keys, and quota.

Alpha focuses on:

- Local TypeScript Node.js CLI
- Local Codex skill
- OpenAI-compatible `/v1/images/generations`
- Gemini image API
- Provider lifecycle management
- Preset and routing based defaults
- Dry-run planning before paid generation

## Tooling

Use Node.js and npm for Alpha.

- Runtime: Node.js `>=20`
- Package manager: npm
- Development runner: `tsx`
- Build tool: `tsup`
- Test runner: `vitest`

Do not switch to bun or pnpm during Alpha unless the team explicitly decides to change the project toolchain. npm is intentionally chosen because it is the lowest-friction default for teammates and future plugin users.

Common commands:

```bash
npm install
npm run dev -- --help
npm run dev -- doctor --json
npm run dev -- create --dry-run --preset poster "一张产品发布会主视觉"
npm run typecheck
npm test
npm run build
```

The CLI loads `.env` from the current working directory, so local provider keys can be set there during development.

## Architecture

Keep the code organized around these layers:

- `provider`: where requests go, including official or third-party channels
- `protocol adapter`: how requests are translated, currently `openai-images` and `gemini`
- `mode`: model preference such as `fast`, `balanced`, or `premium`
- `preset`: usage defaults such as `poster`, `product-shot`, or `social-cover`
- `routing`: default provider, fallback providers, and model selection

Users should not need to provide model, resolution, aspect ratio, quality, or provider on every request. Defaults should come from setup, presets, and routing.

## CLI Behavior

`picgen setup` is a repeatable configuration entry point, not a one-time initializer.
It should guide non-technical users through default provider selection, default generation preference, provider testing, and provider addition without asking for resolution or quality details up front.
Provider host URLs should be configured without `/v1` or `/v1beta`; PicGen appends protocol paths internally.
Providers may optionally define `test_model` for health checks; do not hard-code short-lived model names in command logic.

Support provider lifecycle commands:

```text
add -> test -> enable/disable -> edit -> remove
```

Disabled providers should remain in config but be skipped by automatic routing. Removed providers should be deleted from config.

`picgen create --dry-run` should produce a generation plan without calling any provider or spending quota.
Manual `picgen create` should ask for confirmation before contacting a provider. `--yes` may skip CLI confirmation for explicit user-driven calls, but agent skills should still prefer dry-run plus user confirmation by default.

Do not silently send user context to third-party providers. Explicit image generation requests may call PicGen directly. Strong visual-output intent should ask for confirmation first. Weak visual discussion should only suggest PicGen.

## Current Implementation Status

Implemented:

- CLI skeleton
- Config schema and defaults
- Provider list/add/edit/enable/disable/remove
- Provider `test` network checks
- Provider/mode/preset preference commands
- Doctor JSON output
- Dry-run generation planning
- Local output asset and metadata writing
- Real OpenAI-compatible image generation call
- Real Gemini generateContent image generation call
- Routing tests
- Codex skill draft

Not implemented yet:

- Keychain-backed API key storage
- Full plugin packaging

## Verification

Before handing off changes, run:

```bash
npm run typecheck
npm test
npm run build
```

If generation behavior changes, also run at least one dry-run command and inspect the planned provider/model/preset.
