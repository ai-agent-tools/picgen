# PicGen Agent Invocation Contract

This document defines how agents should call PicGen on behalf of users. It is the canonical behavior contract for Codex, Trae, Claude Code, and other agent integrations.

## Purpose

PicGen lets non-technical users generate images directly inside an agent workflow without copying prompts into external image platforms. The agent understands the user's intent and context; PicGen handles routing, provider calls, local asset storage, and normalized results.

## Responsibilities

The agent is responsible for:

- Deciding whether PicGen should be used.
- Turning the conversation context into a concise image prompt.
- Choosing an appropriate preset such as `poster`, `product-shot`, or `social-cover`.
- Passing user-selected local reference images when the user asks to continue from, edit from, or use an existing image.
- Running a dry-run before agent-initiated generation.
- Showing a user-friendly generation preview.
- Calling real generation only after confirmation, unless the user explicitly asked to skip confirmation.
- Showing local image previews or paths after generation.
- Loading generated images only when the user asks for analysis, editing, continuation, or comparison.

The PicGen CLI is responsible for:

- Loading user preferences and config.
- Resolving provider, model, mode, preset, and output settings.
- Matching the request to provider capabilities such as `text-to-image` and `reference-image`.
- Producing dry-run plans without calling providers.
- Calling providers for real generation.
- Downloading, decoding, and saving generated images as local files.
- Normalizing provider-specific response formats.
- Printing compact results to stdout.
- Writing diagnostics to metadata files without storing large image payloads.

## Intent Levels

### Explicit Generation Intent

Use PicGen when the user explicitly asks to generate, create, make, render, or produce an image, or when the user names PicGen.

Examples:

```text
Use PicGen to generate a launch poster.
Create a social cover based on the current plan.
Generate two product shots from the description above.
```

The default agent flow is dry-run, confirmation, then real generation.

### Strong Visual Output Intent

When the user clearly wants a visual output but has not explicitly asked the agent to generate now, ask for confirmation before entering the PicGen workflow.

Example:

```text
I can generate a poster preview from this concept. Would you like me to do that now?
```

### Weak Visual Discussion Intent

When the user is only discussing visual direction, mood, layout, or brand style, do not call PicGen. Suggest generation only if helpful.

## Dry-run and Confirmation

Agent-initiated generation must run a dry-run first because real generation may spend user quota and send the prompt to a third-party provider.

Command pattern:

```bash
picgen create --dry-run --preset poster "<prompt>"
```

Do not expose the term `dry-run` to non-technical users by default. Present it as a generation preview or confirmation step.

The preview should summarize:

- Intended use or preset.
- Provider or channel.
- Model, when useful.
- Number of images.
- Aspect ratio.
- Local output behavior.

If the user explicitly says "generate directly", "do not ask", or equivalent, the agent may skip the user-facing confirmation step. The agent should still construct a plan internally.

## Preferences and One-off Overrides

Long-term preferences come from setup and config:

- Default provider.
- Fallback providers.
- Default mode.
- Default preset.

`picgen create` flags are one-off overrides and must not change config:

```bash
picgen create --provider gemini_official "<prompt>"
picgen create --model gemini-3-pro-image-preview "<prompt>"
picgen create --preset poster "<prompt>"
picgen create --mode premium "<prompt>"
picgen create --reference ./reference.png "<prompt>"
```

Only explicit preference commands should change config:

```bash
picgen provider prefer gemini_official
picgen mode prefer premium
picgen preset prefer social-cover
```

If the user says "use Gemini this time", use a one-off override. If the user says "use Gemini by default from now on", update preferences.

## Setup Simplicity

PicGen setup should minimize questions for non-technical users.

Initial setup should focus on:

- Preferred provider or channel.
- Whether the required API key environment variable is available.
- Default generation mode: fast, balanced, or high quality.

Initial setup should not require users to understand resolution, aspect ratio, quality, image count, response format, or protocol details. Presets and routing defaults should handle those choices.

Provider `base_url` values should be host-only. Users should not include `/v1` or `/v1beta`; PicGen appends protocol-specific paths internally.

Provider health checks may use a lightweight `test_model`. Gemini provider tests should use a text-only `generateContent` request so health checks validate connectivity without triggering image generation.

Providers should expose capabilities. At minimum:

- `text-to-image`: can generate from a text prompt.
- `reference-image`: can use one or more local images as generation references.

If capabilities are omitted from older configs, PicGen should infer defaults from the protocol. Gemini supports both `text-to-image` and `reference-image`; OpenAI-compatible `/v1/images/generations` supports `text-to-image` only.

Routing should skip providers that do not support the capability required by the request. If the user explicitly selects an unsupported provider, PicGen should fail clearly instead of silently ignoring the unsupported input.

## Reference Images

Agents may pass local reference images when the user explicitly asks to use an existing image, continue from a generated image, create a variant, or use a visual reference.

Command pattern:

```bash
picgen create --dry-run --provider gemini_official --reference ./reference.png --preset poster "<prompt>"
picgen create --provider gemini_official --reference ./reference.png --preset poster "<prompt>"
```

`--reference` may be repeated for multiple local images.

Dry-run output should include only reference image paths, MIME types, and byte sizes. It must not print or expose image base64.

Alpha supports reference images through the Gemini adapter. If the selected provider uses the OpenAI-compatible `/v1/images/generations` adapter, agents should switch to a Gemini provider for that run or explain that OpenAI-compatible reference-image support is not implemented yet.

## Output Asset Contract

PicGen must normalize provider responses into local image files.

Provider responses may include:

- Remote image URLs.
- Base64 image data.
- Inline image bytes.
- File references.
- Temporary download URLs.

PicGen should download, decode, or copy those outputs into local files and return local paths.

Default stdout should stay compact:

```json
{
  "ok": true,
  "output_dir": "/path/to/output",
  "images": [
    {
      "path": "/path/to/image-1.png",
      "mime_type": "image/png",
      "width": 1024,
      "height": 1024,
      "metadata_path": "/path/to/metadata.json"
    }
  ],
  "metadata_path": "/path/to/metadata.json"
}
```

Do not print base64, binary image data, or full provider responses to stdout. Store detailed responses in metadata files.

Metadata must redact large provider-only fields such as generated image base64 payloads and Gemini thought signatures. Metadata is for diagnostics; agents should not display provider responses to users unless they are debugging an explicit failure.

When PicGen can read the generated image dimensions, stdout and metadata should include `width` and `height` for each image. Agents should prefer these fields over reading image files just to check size or aspect ratio.

## Provider-specific Generation Behavior

Gemini image generation should request image-only responses with:

```json
{
  "generationConfig": {
    "responseModalities": ["IMAGE"]
  }
}
```

This keeps responses compact and avoids returning unnecessary text. Gemini provider health checks should not use image-only generation; they should remain text-only connectivity checks.

Gemini may return internal thought parts or thought signatures. PicGen should not expose these to users. If thought images are present, PicGen should save only non-thought output images as generation results.

## Display and On-demand Loading

After generation, the agent should show image previews or local paths only.

The agent must not automatically read, attach, analyze, or resend generated images after generation. Load generated images only when the user asks to inspect, edit, continue from, or compare them.

When loading is needed, load only the specific referenced image or images, not the whole output directory.

This is an internal efficiency rule. Do not explain token or context management to ordinary users unless they ask.

## Error Handling

Agents should provide actionable next steps and must not pretend generation succeeded.

Common cases:

- No provider is configured: guide the user to run `picgen setup`.
- API key is missing: name the required environment variable.
- Provider is disabled: suggest enabling it or using a one-off provider override.
- Unknown preset or mode: suggest available choices or the default.
- Unsupported model: suggest editing the provider or using another provider.
- Provider call failed: show a brief error and point to metadata or error logs.

After a paid provider call fails, do not silently retry with another paid provider unless the user has confirmed fallback behavior.

## Privacy and Quota

Do not send the full conversation context to providers by default. Compress context into the minimal visual prompt needed for the generation.

Do not silently spend user quota. Agent-initiated real generation requires a preview and confirmation by default.

Users may explicitly request direct generation. Future config may control whether agents are allowed to skip confirmation.
