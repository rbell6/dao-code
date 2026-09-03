import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as JiraCli from "./JiraCli.ts";
import { jiraListJql } from "./JiraService.ts";
import * as JiraService from "./JiraService.ts";

describe("jiraListJql", () => {
  it("builds the default my-work view with bounded filters", () => {
    expect(
      jiraListJql({
        view: "my-work",
        query: "billing failure",
        projectKeys: ["APP", "OPS"],
        statusCategories: ["in-progress"],
        issueTypes: ["Bug"],
      }),
    ).toBe(
      '(assignee = currentUser() OR reporter = currentUser() OR watcher = currentUser()) AND project IN ("APP", "OPS") AND statusCategory IN ("In Progress") AND issuetype IN ("Bug") AND text ~ "billing failure" ORDER BY updated DESC',
    );
  });

  it("treats an issue key as an exact lookup", () => {
    expect(jiraListJql({ view: "assigned", query: "app-42" })).toBe(
      'assignee = currentUser() AND key = "APP-42" ORDER BY updated DESC',
    );
  });

  it("passes explicit JQL through without changing it", () => {
    expect(jiraListJql({ jql: "project = APP ORDER BY rank ASC", query: "ignored" })).toBe(
      "project = APP ORDER BY rank ASC",
    );
  });

  it("escapes user-provided JQL string values", () => {
    expect(jiraListJql({ view: "all", query: 'say "hello" \\ now' })).toBe(
      'text ~ "say \\"hello\\" \\\\ now" ORDER BY updated DESC',
    );
  });

  it.effect("runs mutations as non-interactive ACLI commands", () =>
    Effect.gen(function* () {
      const calls: Array<{ readonly operation: string; readonly args: ReadonlyArray<string> }> = [];
      const cli = JiraCli.JiraCli.of({
        execute: (operation, args) =>
          Effect.sync(() => {
            calls.push({ operation, args });
            return { stdout: "", stderr: "" };
          }),
      });
      const service = yield* JiraService.make.pipe(Effect.provideService(JiraCli.JiraCli, cli));

      yield* service.comment({ key: "APP-42", body: "Ready for review." });
      yield* service.transition({ key: "APP-42", status: "In Progress" });

      expect(calls).toEqual([
        {
          operation: "comment",
          args: [
            "jira",
            "workitem",
            "comment",
            "create",
            "--key",
            "APP-42",
            "--body",
            "Ready for review.",
          ],
        },
        {
          operation: "transition",
          args: [
            "jira",
            "workitem",
            "transition",
            "--key",
            "APP-42",
            "--status",
            "In Progress",
            "--yes",
            "--json",
          ],
        },
      ]);
    }),
  );
});
