import { maybePrintUpdateHint } from "./update.js";

export async function runQuickstart(): Promise<void> {
  console.log(formatQuickstart());
  await maybePrintUpdateHint();
}

export function formatQuickstart(): string {
  return [
    "PicGen quickstart",
    "",
    "Install:",
    "  node -v",
    "  npm -v",
    "  npm install -g @ai-agent-tools/picgen",
    "  npx -y skills add ai-agent-tools/picgen --skill picgen -g -y --copy",
    "  picgen skill install codex",
    "",
    "Configure:",
    "  picgen setup  # can save provider API keys for you",
    "  picgen provider quick-add gemini-proxy --host https://www.pandai.vip --prefer",
    "  picgen key set PICGEN_GEMINI_PROXY_KEY --clipboard",
    "  picgen key set PICGEN_GEMINI_PROXY_KEY --stdin",
    "  picgen key list --json",
    "  picgen doctor --json",
    "",
    "Preview before spending quota:",
    '  picgen create --dry-run --preset fast-draft "一张简洁的 PicGen 测试图"',
    "",
    "Generate after confirmation:",
    '  picgen create --yes --preset fast-draft "一张简洁的 PicGen 测试图"',
    "",
    "Use a reference image:",
    '  picgen create --dry-run --reference ./reference.png "基于参考图生成一张品牌海报"',
    "",
    "Agent prompt:",
    "  请帮我安装并配置 PicGen 生图工具。请先阅读并按这个指南执行：https://raw.githubusercontent.com/ai-agent-tools/picgen/refs/heads/main/docs/agent-install.md 。你负责判断是否在本机持久环境、安装 CLI 和 skill、引导我配置 provider/API key，并先预览生成方案，等我确认后再生成测试图。不要让我理解命令细节，也不要让我把 API key 发到聊天里。",
    "",
    "Notes:",
    "  - Provider host URLs should not include /v1 or /v1beta.",
    "  - picgen setup can store API keys in ~/.picgen/.env.",
    "  - Agent workflows should dry-run before real generation.",
    "  - Generated images are saved locally; do not paste base64 into chat.",
    "  - First-user rollout checklist: docs/release-alpha.md"
  ].join("\n");
}
