# PicGen Agent Invocation Contract

本文档定义 Agent 调用 PicGen 的产品语义和行为边界。它面向产品设计、工程实现和 Agent skill 编写，用于保证 Codex、Trae、Claude Code 等 Agent 在帮助非技术用户生成图片时，体验一致、透明，并避免不必要的额度消耗和上下文膨胀。

## 目标用户体验

PicGen 的目标不是让用户学习各家生图平台，而是让用户在 Agent 对话里完成一站式创作：

- 用户用自然语言描述想要的图片。
- Agent 根据上下文整理最终提示词。
- PicGen 根据用户偏好选择渠道、模型和用途预设。
- Agent 在真实生成前展示生成预览。
- 用户确认后，PicGen 调用 provider 生成图片并保存到本地。
- Agent 展示生成结果，用户可以继续要求修改、分析或生成变体。

用户不需要复制提示词到外部平台，也不需要理解 provider、model、aspect ratio、quality 等技术细节。

## 角色分工

Agent 负责理解用户意图和当前上下文：

- 判断是否应该调用 PicGen。
- 从对话上下文提炼最终生图 prompt。
- 选择合适的 preset，例如 `poster`、`product-shot`、`social-cover`。
- 当用户要求基于已有图片继续、变体或参考时，传入用户指定的本地参考图。
- 执行 dry-run 并向用户展示生成预览。
- 在用户确认后调用真实生成。
- 展示本地图片路径或图片预览。
- 在用户明确要求后，按需读取生成图片用于分析、修改或续作。

PicGen CLI 负责执行和资产管理：

- 读取配置和用户偏好。
- 解析 preset、mode、provider、model。
- 生成 dry-run plan。
- 调用 provider。
- 下载、解码并保存图片到本地。
- 归一化不同 provider 的返回结果。
- 输出简洁结果，避免在 stdout 中输出 base64、二进制或完整 provider response。
- 保存 metadata 以便排查，同时避免保存大体积图片 payload。

## 调用意图分级

### 明确生图意图

当用户明确要求生成、创建、制作、出图、渲染图片，或明确提到 PicGen 时，Agent 可以进入 PicGen 流程。

示例：

```text
用 PicGen 生成一张产品发布会主视觉。
帮我做一张小红书封面。
基于刚才的方案出两张海报。
```

默认流程是先 dry-run，再请求确认，然后真实生成。

### 强视觉输出意图

当用户表达了明确的视觉产出需求，但没有直接说要现在生成图片时，Agent 应先询问是否生成。

示例：

```text
这个方案能不能做成一张主视觉？
我想看看它做成海报是什么感觉。
```

Agent 可以回应：

```text
我可以基于当前方案生成一版海报预览。要我现在生成吗？
```

用户确认后，再进入 dry-run 流程。

### 弱视觉讨论意图

当用户只是讨论视觉风格、构图、情绪、品牌方向，而没有要求产出图片时，Agent 不应调用 PicGen，只可以建议后续可以生成。

示例：

```text
这个品牌适合什么视觉风格？
发布会主视觉可以有哪些方向？
```

## Dry-run 与确认

Agent 默认必须先运行 dry-run，因为 Agent 是代表用户行动，真实生成可能消耗用户额度并把 prompt 发送给第三方 provider。

Agent 内部命令：

```bash
picgen create --dry-run --preset poster "<prompt>"
```

面向用户时，不使用 dry-run 这个技术词，建议称为：

- 生成预览
- 生成计划
- 确认一下生成设置

用户确认内容应该简洁，重点包括：

- 用途或 preset
- provider 或渠道
- model，如适合展示
- 数量
- 比例
- 输出会保存到本地

示例：

```text
生成预览：
我将使用 OpenAI 官方渠道生成 2 张发布会海报，比例 3:4，保存到本地。

确认后开始生成。
```

如果用户明确说“直接生成”“不用确认”“现在就生成”，Agent 可以跳过向用户确认，但仍应在内部构造 plan，并按配置决定是否允许直接生成。

## 偏好与单次覆盖

PicGen 需要区分长期偏好和单次覆盖。

长期偏好来自配置和 setup：

- 默认 provider
- fallback providers
- 默认 mode
- 默认 preset

单次覆盖来自 `picgen create` 参数，不应修改配置：

```bash
picgen create --provider gemini_official "<prompt>"
picgen create --model gemini-3-pro-image-preview "<prompt>"
picgen create --preset poster "<prompt>"
picgen create --mode premium "<prompt>"
picgen create --reference ./reference.png "<prompt>"
```

只有显式偏好命令才修改配置，例如：

```bash
picgen provider prefer gemini_official
picgen mode prefer premium
picgen preset prefer social-cover
```

如果用户只是说“这次用 Gemini”，Agent 应使用单次覆盖。只有用户说“以后默认用 Gemini”时，Agent 才应修改偏好。

## Setup 简化原则

PicGen 面向非技术用户，setup 应尽量少问问题。

首次 setup 建议只确认：

- 默认渠道或 provider。
- API key 环境变量是否可用。
- 默认生成倾向：快速、均衡、高质量。

不要在首次 setup 中强迫用户理解和选择：

- 分辨率
- 宽高比
- quality
- n
- response format
- provider 协议细节

这些由 preset 和 routing 默认值承担。用户可以在更熟悉后通过 `preset` 或单次参数覆盖。

provider 的 `base_url` 应只配置 host，不要包含 `/v1` 或 `/v1beta`。PicGen 会根据协议自动拼接路径。

provider 探测可以使用较轻量的 `test_model`。Gemini provider 探测应使用文本请求验证 host、key、model 和 POST 路径，不应触发真实生图。

## 参考图输入

当用户明确要求使用已有图片、基于某张图继续、生成变体、图生图或使用视觉参考时，Agent 可以传入本地参考图。

命令模式：

```bash
picgen create --dry-run --provider gemini_official --reference ./reference.png --preset poster "<prompt>"
picgen create --provider gemini_official --reference ./reference.png --preset poster "<prompt>"
```

`--reference` 可以重复，用于传入多张本地图片。

dry-run 输出只应包含参考图路径、MIME 类型和文件大小，不应输出或展示图片 base64。

Alpha 阶段参考图能力由 Gemini adapter 支持。如果当前选择的是 OpenAI-compatible `/v1/images/generations` adapter，Agent 应为本次调用切换到 Gemini provider，或说明 OpenAI-compatible 参考图能力尚未实现。不要静默忽略用户传入的参考图。

## 图片资产协议

PicGen 应把不同 provider 的返回结果归一化成本地文件。

无论 provider 返回：

- 远程图片 URL
- base64
- inline image data
- file reference
- 临时下载地址

PicGen 都应下载、解码或转换成本地图片文件，并返回本地路径。

CLI 默认 stdout 只输出简洁结果：

```json
{
  "ok": true,
  "output_dir": "/path/to/output",
  "images": [
    {
      "path": "/path/to/image-1.png",
      "mime_type": "image/png",
      "metadata_path": "/path/to/metadata.json"
    }
  ],
  "metadata_path": "/path/to/metadata.json"
}
```

完整 provider response、调试信息和错误详情应写入 metadata 文件，不应默认打印到对话里。

metadata 应脱敏 provider 返回中的大字段，例如生成图片 base64 和 Gemini thought signature。metadata 主要用于诊断；除非用户正在排查错误，Agent 不应把 provider response 展示给用户。

## Provider 特定行为

Gemini 真实生图应请求只返回图片：

```json
{
  "generationConfig": {
    "responseModalities": ["IMAGE"]
  }
}
```

这样返回更紧凑，也避免无关文本。Gemini provider 探测不应使用 image-only 生图请求，而应继续使用文本请求做连通性检查。

Gemini 可能返回内部 thought parts 或 thought signatures。PicGen 不应向用户展示这些字段。如果响应里包含 `thought: true` 的中间图片，PicGen 只应保存非 thought 的最终输出图片。

## 图片展示与按需读取

生成完成后，Agent 默认只展示图片预览或本地路径。

Agent 不应自动读取图片二进制、base64、完整 provider response，也不应在生成后立刻把图片重新作为模型输入。

当用户明确要求以下操作时，Agent 才按需读取指定图片：

- 分析这张图
- 比较几张图
- 基于第 2 张继续修改
- 生成变体
- 做图生图或局部编辑

读取时只读取用户指定的图片，不要读取整个输出目录。

这是一条内部工程规则。默认不需要向普通用户解释“上下文”或“token”，只需说：

```text
生成完成，我已保存并展示图片。
```

当用户要求继续处理时，再自然回应：

```text
我会基于第 2 张继续处理。
```

## 错误处理

Agent 遇到错误时应给用户可执行的下一步，不要编造成功结果。

常见情况：

- 未配置 provider：引导运行 `picgen setup`。
- 缺少 API key：说明需要设置哪个环境变量。
- provider disabled：建议启用或临时切换 provider。
- preset 或 mode 不存在：建议列出可用选项或使用默认值。
- 模型不支持：建议编辑 provider 或改用其他 provider。
- provider 调用失败：展示简短错误和 metadata/error log 路径。

真实生成失败后，Agent 不应擅自切换到另一个付费 provider 重试，除非用户已确认可以使用 fallback provider。

## 隐私与额度

Agent 不应把完整对话上下文直接发送给 provider，除非用户明确要求“基于全部上下文生成”且已确认。默认应把上下文压缩成必要的视觉 prompt。

Agent 不应静默花费用户额度。Agent 发起的真实生成默认需要生成预览和用户确认。

用户明确要求“直接生成”时，可以跳过确认；团队后续可以通过配置控制是否允许 Agent 免确认生成。

## 推荐流程

明确生图请求：

```text
用户：帮我基于刚才方案生成一张发布会主视觉。
Agent：整理 prompt，选择 poster preset。
Agent：运行 picgen doctor --json。
Agent：运行 picgen create --dry-run --preset poster "<prompt>"。
Agent：展示生成预览并请求确认。
用户：确认。
Agent：运行 picgen create --preset poster "<prompt>"。
Agent：展示本地图片预览和路径。
```

后续修改：

```text
用户：第 2 张不错，帮我改成横版。
Agent：只读取第 2 张图片或把第 2 张作为后续输入。
Agent：根据编辑能力或后续 PicGen 能力继续处理。
```
