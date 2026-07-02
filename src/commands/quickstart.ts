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
    "  npm install -g @ai-agent-tools/picgen",
    "",
    "Configure:",
    "  picgen setup",
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
    "  请安装并体验 @ai-agent-tools/picgen：全局安装 npm install -g @ai-agent-tools/picgen，运行 picgen setup 配置，然后先 dry-run 预览，再确认生成一张测试图。如果我要用参考图，请使用 --reference <图片路径>。",
    "",
    "Notes:",
    "  - Provider host URLs should not include /v1 or /v1beta.",
    "  - Agent workflows should dry-run before real generation.",
    "  - Generated images are saved locally; do not paste base64 into chat.",
    "  - First-user rollout checklist: docs/release-alpha.md"
  ].join("\n");
}
