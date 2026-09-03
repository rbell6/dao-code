import * as Result from "effect/Result";
import { describe, expect, it } from "vite-plus/test";

import { decodeJiraIssueDetailJson, decodeJiraIssueListJson } from "./jiraJson.ts";

function issue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "10001",
    key: "APP-42",
    self: "https://example.atlassian.net/rest/api/3/issue/10001",
    fields: {
      summary: "Make Jira a first-class workspace",
      status: {
        id: "3",
        name: "In Progress",
        statusCategory: { key: "indeterminate", name: "In Progress" },
      },
      issuetype: { id: "10002", name: "Story", iconUrl: "https://example/icon.svg" },
      priority: { id: "2", name: "High" },
      assignee: { accountId: "ada", displayName: "Ada Lovelace" },
      reporter: { accountId: "grace", displayName: "Grace Hopper" },
      labels: ["integration"],
      created: "2026-09-01T12:00:00.000Z",
      updated: "2026-09-03T12:00:00.000Z",
      project: { key: "APP", name: "Application" },
      ...overrides,
    },
  };
}

function expectSuccess<A>(result: Result.Result<A, unknown>): A {
  expect(Result.isSuccess(result)).toBe(true);
  if (!Result.isSuccess(result)) throw new Error("expected a successful Jira decode");
  return result.success;
}

describe("decodeJiraIssueListJson", () => {
  it("normalizes ACLI search output and derives the browser URL", () => {
    const issues = expectSuccess(decodeJiraIssueListJson(JSON.stringify({ issues: [issue()] })));

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      key: "APP-42",
      summary: "Make Jira a first-class workspace",
      url: "https://example.atlassian.net/browse/APP-42",
      projectKey: "APP",
      status: { name: "In Progress", category: "in-progress" },
      issueType: { name: "Story" },
      priority: { name: "High" },
      assignee: { accountId: "ada", displayName: "Ada Lovelace" },
    });
  });

  it("accepts array output and skips malformed entries", () => {
    const issues = expectSuccess(
      decodeJiraIssueListJson(JSON.stringify([issue(), { key: "BROKEN" }])),
    );

    expect(issues.map(({ key }) => key)).toEqual(["APP-42"]);
  });
});

describe("decodeJiraIssueDetailJson", () => {
  it("flattens Atlassian document content in descriptions and comments", () => {
    const detail = expectSuccess(
      decodeJiraIssueDetailJson(
        JSON.stringify(
          issue({
            description: {
              type: "doc",
              content: [
                { type: "heading", content: [{ type: "text", text: "Context" }] },
                { type: "paragraph", content: [{ type: "text", text: "Ship the workspace." }] },
              ],
            },
            comment: {
              comments: [
                {
                  id: "20001",
                  author: { accountId: "ada", displayName: "Ada Lovelace" },
                  body: {
                    type: "doc",
                    content: [
                      { type: "paragraph", content: [{ type: "text", text: "Looks good." }] },
                    ],
                  },
                  created: "2026-09-03T13:00:00.000Z",
                },
              ],
            },
          }),
        ),
      ),
    );

    expect(detail.description).toBe("Context\nShip the workspace.");
    expect(detail.comments).toEqual([
      {
        id: "20001",
        author: {
          accountId: "ada",
          displayName: "Ada Lovelace",
          avatarUrl: null,
        },
        body: "Looks good.",
        createdAt: "2026-09-03T13:00:00.000Z",
        updatedAt: null,
      },
    ]);
  });
});
