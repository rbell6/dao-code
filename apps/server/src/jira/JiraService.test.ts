import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as JiraCli from "./JiraCli.ts";
import { jiraAuthStatus, jiraListJql } from "./JiraService.ts";
import * as JiraService from "./JiraService.ts";

describe("jiraListJql", () => {
  it("reads account details from ACLI auth status", () => {
    expect(
      jiraAuthStatus(`✓ Authenticated
  Site: bamboohr.atlassian.net
  Email: rbell@bamboohr.com
  Authentication Type: api_token`),
    ).toEqual({
      site: "bamboohr.atlassian.net",
      email: "rbell@bamboohr.com",
      authenticationType: "api_token",
    });
  });

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

  it.effect("uses ACLI-supported search fields and non-interactive mutations", () =>
    Effect.gen(function* () {
      const calls: Array<{ readonly operation: string; readonly args: ReadonlyArray<string> }> = [];
      const cli = JiraCli.JiraCli.of({
        execute: (operation, args) =>
          Effect.sync(() => {
            calls.push({ operation, args });
            return {
              stdout:
                operation === "list" ? '[{"key":"APP-42","fields":{"summary":"Test issue"}}]' : "",
              stderr: "",
            };
          }),
      });
      const service = yield* JiraService.make.pipe(Effect.provideService(JiraCli.JiraCli, cli));

      yield* service.list({ view: "assigned", limit: 50 });
      yield* service.comment({ key: "APP-42", body: "Ready for review." });
      yield* service.transition({ key: "APP-42", status: "In Progress" });

      expect(calls).toEqual([
        {
          operation: "list",
          args: [
            "jira",
            "workitem",
            "search",
            "--jql",
            "assignee = currentUser() ORDER BY updated DESC",
            "--fields",
            "key,summary,status,issuetype,priority,assignee,reporter,labels",
            "--limit",
            "50",
            "--json",
          ],
        },
        {
          operation: "connectionStatus",
          args: ["jira", "auth", "status"],
        },
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

  it.effect("derives issue URLs from the authenticated site and caches the lookup", () =>
    Effect.gen(function* () {
      let statusCalls = 0;
      const cli = JiraCli.JiraCli.of({
        execute: (operation) =>
          Effect.sync(() => {
            if (operation === "connectionStatus") statusCalls += 1;
            return {
              stdout:
                operation === "connectionStatus"
                  ? "✓ Authenticated\n  Site: example.atlassian.net"
                  : '[{"key":"APP-42","fields":{"summary":"Test issue"}}]',
              stderr: "",
            };
          }),
      });
      const service = yield* JiraService.make.pipe(Effect.provideService(JiraCli.JiraCli, cli));

      const first = yield* service.list({ view: "assigned" });
      const second = yield* service.list({ view: "assigned" });

      expect(first.issues[0]?.url).toBe("https://example.atlassian.net/browse/APP-42");
      expect(second.issues[0]?.url).toBe("https://example.atlassian.net/browse/APP-42");
      expect(statusCalls).toBe(1);
    }),
  );
});
