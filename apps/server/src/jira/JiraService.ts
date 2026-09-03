import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import type {
  JiraCommentInput,
  JiraConnectionStatus,
  JiraIssueDetail,
  JiraIssueListInput,
  JiraIssueListResult,
  JiraIssueRef,
  JiraOperationError,
  JiraTransitionInput,
  JiraUnavailableError,
} from "@t3tools/contracts";
import {
  JiraOperationError as JiraOperationFailure,
  JiraUnavailableError as JiraUnavailableFailure,
} from "@t3tools/contracts";

import * as JiraCli from "./JiraCli.ts";
import { decodeJiraIssueDetailJson, decodeJiraIssueListJson } from "./jiraJson.ts";

export type JiraServiceError = JiraUnavailableError | JiraOperationError;

export class JiraService extends Context.Service<
  JiraService,
  {
    readonly connectionStatus: Effect.Effect<JiraConnectionStatus>;
    readonly list: (
      input: JiraIssueListInput,
    ) => Effect.Effect<JiraIssueListResult, JiraServiceError>;
    readonly detail: (input: JiraIssueRef) => Effect.Effect<JiraIssueDetail, JiraServiceError>;
    readonly comment: (input: JiraCommentInput) => Effect.Effect<void, JiraServiceError>;
    readonly transition: (input: JiraTransitionInput) => Effect.Effect<void, JiraServiceError>;
  }
>()("t3/jira/JiraService") {}

function quoteJql(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function jiraListJql(input: JiraIssueListInput): string {
  if (input.jql?.trim()) return input.jql.trim();
  const clauses: Array<string> = [];
  switch (input.view ?? "my-work") {
    case "my-work":
      clauses.push(
        "(assignee = currentUser() OR reporter = currentUser() OR watcher = currentUser())",
      );
      break;
    case "assigned":
      clauses.push("assignee = currentUser()");
      break;
    case "reported":
      clauses.push("reporter = currentUser()");
      break;
    case "watching":
      clauses.push("watcher = currentUser()");
      break;
    case "all":
      break;
  }
  if (input.projectKeys?.length) {
    clauses.push(`project IN (${input.projectKeys.map(quoteJql).join(", ")})`);
  }
  if (input.statusCategories?.length) {
    const names = input.statusCategories.flatMap((category) => {
      switch (category) {
        case "todo":
          return ["To Do"];
        case "in-progress":
          return ["In Progress"];
        case "done":
          return ["Done"];
        case "unknown":
          return [];
      }
    });
    if (names.length) clauses.push(`statusCategory IN (${names.map(quoteJql).join(", ")})`);
  }
  if (input.issueTypes?.length) {
    clauses.push(`issuetype IN (${input.issueTypes.map(quoteJql).join(", ")})`);
  }
  const query = input.query?.trim();
  if (query) {
    clauses.push(
      /^[A-Z][A-Z0-9_]*-\d+$/u.test(query.toUpperCase())
        ? `key = ${quoteJql(query.toUpperCase())}`
        : `text ~ ${quoteJql(query)}`,
    );
  }
  return `${clauses.length ? `${clauses.join(" AND ")} ` : ""}ORDER BY updated DESC`;
}

function serviceError(error: JiraCli.JiraCliError): JiraServiceError {
  return error.reason === "failed"
    ? new JiraOperationFailure({ operation: error.operation, message: error.detail })
    : new JiraUnavailableFailure({ reason: error.reason, message: error.detail });
}

function decodeFailure(operation: string): JiraOperationError {
  return new JiraOperationFailure({
    operation,
    message: "Atlassian CLI returned Jira data in an unsupported format.",
  });
}

function siteFromStatus(output: string): string | null {
  return output.match(/(?:https?:\/\/)?([a-z0-9][a-z0-9.-]*\.atlassian\.net)\b/iu)?.[1] ?? null;
}

export const make = Effect.gen(function* () {
  const cli = yield* JiraCli.JiraCli;

  const connectionStatus = cli.execute("connectionStatus", ["jira", "auth", "status"]).pipe(
    Effect.map(({ stdout, stderr }): JiraConnectionStatus => ({
      state: "ready",
      site: siteFromStatus(`${stdout}\n${stderr}`),
      detail: "Atlassian CLI is authenticated.",
    })),
    Effect.catch((error) =>
      Effect.succeed({
        state: error.reason,
        site: null,
        detail: error.detail,
      } satisfies JiraConnectionStatus),
    ),
  );

  const list: JiraService["Service"]["list"] = (input) => {
    const jql = jiraListJql(input);
    return cli
      .execute("list", [
        "jira",
        "workitem",
        "search",
        "--jql",
        jql,
        "--fields",
        "key,summary,status,issuetype,priority,assignee,reporter,labels",
        "--limit",
        String(input.limit ?? 50),
        "--json",
      ])
      .pipe(
        Effect.mapError(serviceError),
        Effect.flatMap(({ stdout }) => {
          const decoded = decodeJiraIssueListJson(stdout);
          return Result.isSuccess(decoded)
            ? Effect.succeed({ issues: decoded.success, jql })
            : Effect.fail(decodeFailure("list"));
        }),
      );
  };

  const detail: JiraService["Service"]["detail"] = (input) =>
    cli
      .execute("detail", [
        "jira",
        "workitem",
        "view",
        input.key,
        "--fields",
        "key,summary,status,issuetype,priority,assignee,reporter,labels,created,updated,project,description,comment",
        "--json",
      ])
      .pipe(
        Effect.mapError(serviceError),
        Effect.flatMap(({ stdout }) => {
          const decoded = decodeJiraIssueDetailJson(stdout);
          return Result.isSuccess(decoded)
            ? Effect.succeed(decoded.success)
            : Effect.fail(decodeFailure("detail"));
        }),
      );

  const comment: JiraService["Service"]["comment"] = (input) =>
    cli
      .execute("comment", [
        "jira",
        "workitem",
        "comment",
        "create",
        "--key",
        input.key,
        "--body",
        input.body,
      ])
      .pipe(Effect.mapError(serviceError), Effect.asVoid);

  const transition: JiraService["Service"]["transition"] = (input) =>
    cli
      .execute("transition", [
        "jira",
        "workitem",
        "transition",
        "--key",
        input.key,
        "--status",
        input.status,
        "--yes",
        "--json",
      ])
      .pipe(Effect.mapError(serviceError), Effect.asVoid);

  return JiraService.of({ connectionStatus, list, detail, comment, transition });
});

export const layer = Layer.effect(JiraService, make);
