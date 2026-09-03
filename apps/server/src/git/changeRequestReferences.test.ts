import { describe, expect, it } from "@effect/vitest";

import { applyChangeRequestReferences } from "./changeRequestReferences.ts";

describe("applyChangeRequestReferences", () => {
  it("adds the primary work key to the title and all missing links to the body", () => {
    expect(
      applyChangeRequestReferences(
        { title: "Improve payroll export", body: "## Summary\n\nImproves the export." },
        [
          { key: "IA-1234", url: "https://example.atlassian.net/browse/IA-1234" },
          { key: "IA-1235", url: "https://example.atlassian.net/browse/IA-1235" },
        ],
      ),
    ).toEqual({
      title: "[IA-1234] Improve payroll export",
      body: "## Summary\n\nImproves the export.\n\n## Related work\n\n- [IA-1234](https://example.atlassian.net/browse/IA-1234)\n- [IA-1235](https://example.atlassian.net/browse/IA-1235)",
    });
  });

  it("does not duplicate a key or URL already present in generated content", () => {
    const url = "https://example.atlassian.net/browse/IA-1234";
    expect(
      applyChangeRequestReferences(
        { title: "IA-1234: Improve payroll export", body: `Jira: ${url}` },
        [{ key: "IA-1234", url }],
      ),
    ).toEqual({ title: "IA-1234: Improve payroll export", body: `Jira: ${url}` });
  });

  it("creates a clean related-work section when the generated body is empty", () => {
    expect(
      applyChangeRequestReferences({ title: "Improve payroll export", body: "" }, [
        { key: "IA-1234", url: "https://example.atlassian.net/browse/IA-1234" },
      ]).body,
    ).toBe("## Related work\n\n- [IA-1234](https://example.atlassian.net/browse/IA-1234)");
  });
});
