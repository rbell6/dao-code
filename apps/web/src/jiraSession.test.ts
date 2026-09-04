import { describe, expect, it } from "vite-plus/test";

import { buildJiraStarterPrompt, normalizeJiraSite } from "./jiraSession";

describe("Jira session helpers", () => {
  it("builds an editable implementation prompt from the issue", () => {
    expect(
      buildJiraStarterPrompt({
        key: "IA-1234",
        summary: "Improve payroll export",
        url: "https://example.atlassian.net/browse/IA-1234",
        description: "Keep column ordering stable.",
      }),
    ).toBe(
      "Implement IA-1234: Improve payroll export\n\n" +
        "Jira: https://example.atlassian.net/browse/IA-1234\n\n" +
        "Use this Jira ticket as the source of truth. Inspect the repository before making changes.\n\n" +
        "Description:\nKeep column ordering stable.",
    );
  });

  it("normalizes a configured site or issue URL to its host", () => {
    expect(normalizeJiraSite("example.atlassian.net")).toBe("example.atlassian.net");
    expect(normalizeJiraSite("https://example.atlassian.net/browse/IA-1234")).toBe(
      "example.atlassian.net",
    );
  });
});
