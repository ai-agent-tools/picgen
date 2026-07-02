---
name: picgen
description: Use when the user wants to generate images from the current agent context through configured PicGen providers. Trigger directly only on explicit image-generation requests or when the user names PicGen; ask for confirmation for strong visual-output intent; only suggest PicGen for weak visual exploration intent.
---

# PicGen Skill

PicGen connects agent workflows to user-configured image generation providers. It is designed for non-technical users who want to generate images inside an agent conversation without copying prompts into external image platforms.

## Invocation Policy

Use PicGen when the user explicitly asks to generate, create, make, render, or produce an image, or explicitly names PicGen.

Ask before entering the PicGen workflow when the user expresses strong visual-output intent but has not clearly asked to generate now.

Only suggest PicGen when the user discusses visual direction, mood, brand style, or abstract visual ideas without asking for an output.

Never silently spend user quota. Do not send full conversation context to providers by default; summarize only the visual details needed for the final prompt.

## Workflow

1. Run `picgen doctor --json` to check configuration.
2. If no usable provider is configured, guide the user to run `picgen setup`.
3. Choose a preset from the user's intent, such as `poster`, `product-shot`, or `social-cover`.
4. Run `picgen create --dry-run --preset <preset> "<prompt>"`.
5. Present the dry-run as a user-facing generation preview. Do not expose `dry-run` as a technical term unless useful.
6. After the user confirms, run `picgen create --preset <preset> "<prompt>"`.
7. Show local image previews or saved file paths.

If the user explicitly says to generate directly or not ask for confirmation, you may skip the user-facing confirmation step. Still form a generation plan internally.

## Preferences and Overrides

Treat `picgen create` flags as one-off overrides. They must not change user preferences:

```bash
picgen create --provider gemini_official "<prompt>"
picgen create --model gemini-3-pro-image-preview "<prompt>"
picgen create --preset poster "<prompt>"
picgen create --mode premium "<prompt>"
```

Only change defaults when the user explicitly asks to remember a preference, such as "use Gemini by default from now on".

## Output Handling

PicGen normalizes provider responses into local image files. Providers may return URLs, base64, inline bytes, or file references, but the agent should only use PicGen's local paths and metadata.

After generation:

- Show image previews or local paths.
- Do not paste base64, binary image data, or full provider responses into the conversation.
- Do not automatically read, attach, analyze, or resend generated images.
- Load generated images only when the user asks to inspect, edit, continue from, or compare them.
- When loading is needed, load only the specific referenced image or images.

Do not explain token or context management to ordinary users unless they ask.

## Error Handling

If `doctor` reports no usable provider, ask the user to run `picgen setup`.

If an API key is missing, name the required environment variable.

If a provider is disabled, suggest enabling it or using a one-off provider override.

If a provider call fails, show a short error and point to the metadata or error path if available. Do not silently retry with another paid provider unless the user has approved fallback behavior.

## Examples

Explicit:

```text
用 PicGen 生成一张产品发布海报
```

Confirmation:

```text
我可以用 PicGen 基于当前方案生成一版主视觉。要我现在生成吗？默认用 poster 预设，出 2 张。
```

Generation preview:

```text
生成预览：
我将使用 OpenAI 官方渠道生成 2 张发布会海报，比例 3:4，保存到本地。

确认后开始生成。
```
