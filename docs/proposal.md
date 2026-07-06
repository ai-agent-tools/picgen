# PicGen Alpha Proposal

PicGen is a lightweight image generation connector for AI agents. It lets users generate images from the current agent context through their own providers, API keys, and quota.

## Scope

Alpha focuses only on image generation:

- OpenAI-compatible `/v1/images/generations` and `/v1/images/edits`
- Gemini image API
- Reference-image and mask-guided image editing
- local CLI
- local Codex skill
- provider lifecycle management
- dry-run planning before paid generation

Out of scope for Alpha:

- video generation
- audio generation
- GUI configuration
- provider marketplace
- full Codex plugin packaging
- real image editing and variations

## Configuration Model

PicGen uses four layers:

- `provider`: where requests go, including official or third-party channels
- `mode`: model preference such as fast, balanced, or premium
- `preset`: usage defaults such as poster, product shot, social cover
- `routing`: default provider, fallback providers, and default mode
- `capability`: whether a provider supports text-to-image, reference-image, multi-reference-image, mask-guided-edit, native-inpaint, or future workflows

Users should not need to provide model, resolution, aspect ratio, or quality on every request. Setup and presets hold those choices.

## Provider Lifecycle

Providers can be managed repeatedly after initial setup:

```text
add -> test -> enable/disable -> edit -> remove
```

Disabled providers remain in config but are skipped by automatic routing.

`picgen setup` is a repeatable guided entry point. It should help users quick-add common providers, choose the default provider, choose a default generation preference, test providers, and add advanced custom providers without requiring them to understand resolution, aspect ratio, quality, or protocol details.

Provider `base_url` values are host-only. Users should not include `/v1` or `/v1beta`; protocol adapters append those paths internally.
Providers may optionally define `test_model` for health checks. This avoids hard-coding short-lived model names while still allowing lightweight connectivity tests.
Providers define `capabilities` so routing can skip unsupported providers. Old configs infer capabilities from protocol defaults.

## Agent Invocation Policy

PicGen should be visible to agents, but should not silently spend quota.

- Explicit image generation request: call PicGen directly.
- Strong visual-output intent: ask for confirmation first.
- Weak visual discussion: suggest PicGen, do not call.

Use `picgen create --dry-run` to show the planned provider, model, preset, aspect ratio, quantity, and prompt before generation.
Manual CLI generation asks for confirmation before contacting a provider. `--yes` skips that confirmation for explicit user-driven calls.

Reference images are passed with repeated `--reference <path>` flags. OpenAI-compatible providers use `/v1/images/edits` for reference-image generation; Gemini providers use `generateContent` by sending local files as inline image parts. Local mask edits use `--mask <path>` with at least one `--reference`: OpenAI-compatible providers send native masks to `/v1/images/edits`, while Gemini treats masks as guidance images with explicit edit instructions.

## Alpha Commands

```bash
picgen setup
picgen doctor --json
picgen create --dry-run "一张产品发布会主视觉"
picgen create --yes "一张产品发布会主视觉"
picgen create --dry-run --provider gemini_official --reference ./reference.png "基于参考图生成一张海报"
picgen provider list
picgen provider add
picgen provider test <name>
picgen provider prefer <name>
picgen provider enable <name>
picgen provider disable <name>
picgen provider remove <name>
picgen mode prefer <name>
picgen preset prefer <name>
```

## Current Status

The repository currently implements:

- TypeScript CLI skeleton
- default config and schema validation
- interactive provider add/edit flow
- provider enable/disable/remove/list
- provider test network checks
- provider/mode/preset preference commands
- doctor JSON output
- dry-run generation planning
- local output asset and metadata writing
- OpenAI-compatible image generation and image edit calls
- Gemini generateContent image generation call
- Gemini reference-image and mask-guided generation calls
- provider response redaction for generated image data and Gemini thought signatures
- routing tests

Keychain-backed API key storage and full plugin packaging are not implemented yet.
