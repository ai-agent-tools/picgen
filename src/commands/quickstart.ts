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
    "  picgen key set PICGEN_GEMINI_PROXY_KEY --stdin",
    "  picgen doctor --json",
    "",
    "Preview before spending quota:",
    '  picgen create --dry-run "一张极简科技感产品海报"',
    "",
    "Generate after confirmation:",
    '  picgen create --yes "一张极简科技感产品海报"',
    "",
    "Use a reference image:",
    '  picgen create --dry-run --reference ./reference.png "基于参考图生成一张品牌海报"',
    "",
    "Agent prompt:",
    "  请帮我安装并配置 PicGen 生图工具。安装前请先检查这台电脑是否已经安装 Node.js 和 npm。如果没有安装，请先指导我安装 Node.js LTS 版本，并验证 node -v 和 npm -v 是否能正常显示版本号。然后执行 npm install -g @ai-agent-tools/picgen@latest 安装 CLI，再执行 npx -y skills add ai-agent-tools/picgen --skill picgen -g -y --copy 安装 PicGen skill。如果 skills 安装器不可用且当前是 Codex，请改用 picgen skill install codex。然后引导我配置 provider 和 API key，先预览生成方案，等我确认后再生成测试图。",
    "",
    "Notes:",
    "  - Provider host URLs should not include /v1 or /v1beta.",
    "  - picgen setup can store API keys in ~/.picgen/.env.",
    "  - Agent workflows should dry-run before real generation.",
    "  - Generated images are saved locally; do not paste base64 into chat.",
    "  - First-user rollout checklist: docs/release-alpha.md"
  ].join("\n");
}
