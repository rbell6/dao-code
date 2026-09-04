import type { JiraIssueSummary } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { jiraTransitionStatusOptions } from "./jiraStatusOptions";

function issue(projectKey: string, status: string): JiraIssueSummary {
  return {
    key: `${projectKey}-1`,
    summary: "Summary",
    url: null,
    projectKey,
    projectName: projectKey,
    status: { id: null, name: status, category: "unknown" },
    issueType: { id: null, name: "Task", iconUrl: null },
    priority: null,
    assignee: null,
    reporter: null,
    labels: [],
    createdAt: null,
    updatedAt: null,
  };
}

describe("jiraTransitionStatusOptions", () => {
  it("returns unique statuses from the selected issue project except its current status", () => {
    expect(
      jiraTransitionStatusOptions(
        [
          issue("IA", "Ready for Upload"),
          issue("IA", "Code Review"),
          issue("IA", "code review"),
          issue("IA", "Done"),
          issue("APP", "QA"),
        ],
        issue("IA", "Ready for Upload"),
      ),
    ).toEqual(["Code Review", "Done"]);
  });
});
