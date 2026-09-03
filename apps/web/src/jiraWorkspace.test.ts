import type { JiraIssueSummary } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { jiraIssueFacets } from "./jiraWorkspace";

function issue(projectKey: string, projectName: string, issueType: string): JiraIssueSummary {
  return {
    key: `${projectKey}-1`,
    summary: "Summary",
    url: null,
    projectKey,
    projectName,
    status: { id: null, name: "Open", category: "todo" },
    issueType: { id: null, name: issueType, iconUrl: null },
    priority: null,
    assignee: null,
    reporter: null,
    labels: [],
    createdAt: null,
    updatedAt: null,
  };
}

describe("jiraIssueFacets", () => {
  it("builds sorted, unique project and issue type filters from loaded issues", () => {
    expect(
      jiraIssueFacets([
        issue("IA", "Iron Arc", "Task"),
        issue("APP", "Application", "Bug"),
        issue("IA", "Iron Arc", "task"),
      ]),
    ).toEqual({
      projects: [
        { key: "APP", name: "Application" },
        { key: "IA", name: "Iron Arc" },
      ],
      issueTypes: ["Bug", "Task"],
    });
  });
});
