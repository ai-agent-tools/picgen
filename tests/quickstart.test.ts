import { describe, expect, it } from "vitest";
import { formatQuickstart } from "../src/commands/quickstart.js";

describe("quickstart", () => {
  it("prints install and first-run guidance", () => {
    const output = formatQuickstart();

    expect(output).toContain("npm install -g @ai-agent-tools/picgen");
    expect(output).toContain("npx -y skills add ai-agent-tools/picgen --skill picgen");
    expect(output).toContain("picgen skill install codex");
    expect(output).toContain("picgen setup");
    expect(output).toContain('picgen create --dry-run "一张极简科技感产品海报"');
    expect(output).toContain("--reference ./reference.png");
    expect(output).toContain("Agent prompt:");
    expect(output).toContain("docs/release-alpha.md");
  });
});
