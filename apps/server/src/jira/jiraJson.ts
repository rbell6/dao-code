import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type {
  JiraActor,
  JiraComment,
  JiraIssueDetail,
  JiraIssueStatusCategory,
  JiraIssueSummary,
} from "@t3tools/contracts";
import { decodeJsonResult } from "@t3tools/shared/schemaJson";

const RawActor = Schema.Struct({
  accountId: Schema.optional(Schema.NullOr(Schema.String)),
  displayName: Schema.optional(Schema.NullOr(Schema.String)),
  emailAddress: Schema.optional(Schema.NullOr(Schema.String)),
  avatarUrls: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        "48x48": Schema.optional(Schema.String),
        "32x32": Schema.optional(Schema.String),
        "24x24": Schema.optional(Schema.String),
        "16x16": Schema.optional(Schema.String),
      }),
    ),
  ),
});

const RawComment = Schema.Struct({
  id: Schema.optional(Schema.Union([Schema.String, Schema.NumberFromString, Schema.Number])),
  author: Schema.optional(Schema.NullOr(RawActor)),
  body: Schema.optional(Schema.Unknown),
  created: Schema.optional(Schema.NullOr(Schema.String)),
  updated: Schema.optional(Schema.NullOr(Schema.String)),
});

const RawIssue = Schema.Struct({
  id: Schema.optional(Schema.Union([Schema.String, Schema.NumberFromString, Schema.Number])),
  key: Schema.String,
  self: Schema.optional(Schema.NullOr(Schema.String)),
  fields: Schema.Struct({
    summary: Schema.String,
    description: Schema.optional(Schema.Unknown),
    status: Schema.optional(
      Schema.NullOr(
        Schema.Struct({
          id: Schema.optional(Schema.NullOr(Schema.String)),
          name: Schema.optional(Schema.NullOr(Schema.String)),
          statusCategory: Schema.optional(
            Schema.NullOr(
              Schema.Struct({
                key: Schema.optional(Schema.NullOr(Schema.String)),
                name: Schema.optional(Schema.NullOr(Schema.String)),
              }),
            ),
          ),
        }),
      ),
    ),
    issuetype: Schema.optional(
      Schema.NullOr(
        Schema.Struct({
          id: Schema.optional(Schema.NullOr(Schema.String)),
          name: Schema.optional(Schema.NullOr(Schema.String)),
          iconUrl: Schema.optional(Schema.NullOr(Schema.String)),
        }),
      ),
    ),
    priority: Schema.optional(
      Schema.NullOr(
        Schema.Struct({
          id: Schema.optional(Schema.NullOr(Schema.String)),
          name: Schema.optional(Schema.NullOr(Schema.String)),
          iconUrl: Schema.optional(Schema.NullOr(Schema.String)),
        }),
      ),
    ),
    assignee: Schema.optional(Schema.NullOr(RawActor)),
    reporter: Schema.optional(Schema.NullOr(RawActor)),
    labels: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
    created: Schema.optional(Schema.NullOr(Schema.String)),
    updated: Schema.optional(Schema.NullOr(Schema.String)),
    project: Schema.optional(
      Schema.NullOr(
        Schema.Struct({
          key: Schema.optional(Schema.NullOr(Schema.String)),
          name: Schema.optional(Schema.NullOr(Schema.String)),
        }),
      ),
    ),
    comment: Schema.optional(
      Schema.NullOr(Schema.Struct({ comments: Schema.optional(Schema.Array(Schema.Unknown)) })),
    ),
  }),
});

const RawSearch = Schema.Union([
  Schema.Array(Schema.Unknown),
  Schema.Struct({ issues: Schema.Array(Schema.Unknown) }),
  Schema.Struct({ values: Schema.Array(Schema.Unknown) }),
]);

type RawIssueType = typeof RawIssue.Type;
type DecodeFailure = Cause.Cause<Schema.SchemaError>;

const decodeSearch = decodeJsonResult(RawSearch);
const decodeIssue = decodeJsonResult(RawIssue);
const decodeIssueEntry = Schema.decodeUnknownExit(RawIssue);
const decodeCommentEntry = Schema.decodeUnknownExit(RawComment);

function trimmed(value: string | null | undefined): string | null {
  const result = value?.trim();
  return result ? result : null;
}

function actor(raw: typeof RawActor.Type | null | undefined): JiraActor | null {
  if (raw === null || raw === undefined) return null;
  const displayName = trimmed(raw.displayName) ?? trimmed(raw.emailAddress);
  if (displayName === null) return null;
  return {
    accountId: trimmed(raw.accountId),
    displayName,
    avatarUrl:
      trimmed(raw.avatarUrls?.["48x48"]) ??
      trimmed(raw.avatarUrls?.["32x32"]) ??
      trimmed(raw.avatarUrls?.["24x24"]) ??
      trimmed(raw.avatarUrls?.["16x16"]),
  };
}

function statusCategory(raw: string | null | undefined): JiraIssueStatusCategory {
  switch (raw?.trim().toLowerCase()) {
    case "new":
    case "to do":
    case "todo":
      return "todo";
    case "indeterminate":
    case "in progress":
      return "in-progress";
    case "done":
      return "done";
    default:
      return "unknown";
  }
}

function issueUrl(self: string | null | undefined, key: string): string | null {
  const raw = trimmed(self);
  if (raw === null) return null;
  try {
    return `${new URL(raw).origin}/browse/${encodeURIComponent(key)}`;
  } catch {
    return null;
  }
}

function adfText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(adfText).join("");
  if (typeof value !== "object" || value === null) return "";
  const node = value as Record<string, unknown>;
  if (typeof node.text === "string") return node.text;
  const content = adfText(node.content);
  switch (node.type) {
    case "paragraph":
    case "heading":
    case "listItem":
      return `${content}\n`;
    case "hardBreak":
      return "\n";
    default:
      return content;
  }
}

function summary(raw: RawIssueType): JiraIssueSummary {
  const key = raw.key.trim();
  const status = raw.fields.status;
  const issueType = raw.fields.issuetype;
  const priority = raw.fields.priority;
  return {
    key,
    summary: raw.fields.summary,
    url: issueUrl(raw.self, key),
    projectKey: trimmed(raw.fields.project?.key) ?? key.split("-")[0] ?? "",
    projectName: trimmed(raw.fields.project?.name) ?? trimmed(raw.fields.project?.key) ?? "",
    status: {
      id: trimmed(status?.id),
      name: trimmed(status?.name) ?? "Unknown",
      category: statusCategory(status?.statusCategory?.key ?? status?.statusCategory?.name),
    },
    issueType: {
      id: trimmed(issueType?.id),
      name: trimmed(issueType?.name) ?? "Issue",
      iconUrl: trimmed(issueType?.iconUrl),
    },
    priority:
      priority === null || priority === undefined
        ? null
        : {
            id: trimmed(priority.id),
            name: trimmed(priority.name) ?? "Unknown",
            iconUrl: trimmed(priority.iconUrl),
          },
    assignee: actor(raw.fields.assignee),
    reporter: actor(raw.fields.reporter),
    labels: raw.fields.labels ?? [],
    createdAt: trimmed(raw.fields.created),
    updatedAt: trimmed(raw.fields.updated),
  };
}

function comments(raw: RawIssueType): ReadonlyArray<JiraComment> {
  return (raw.fields.comment?.comments ?? []).flatMap((entry, index) => {
    const decoded = decodeCommentEntry(entry);
    if (Exit.isFailure(decoded)) return [];
    return [
      {
        id: String(decoded.value.id ?? index),
        author: actor(decoded.value.author),
        body: adfText(decoded.value.body).trim(),
        createdAt: trimmed(decoded.value.created),
        updatedAt: trimmed(decoded.value.updated),
      },
    ];
  });
}

export function decodeJiraIssueListJson(
  input: string,
): Result.Result<ReadonlyArray<JiraIssueSummary>, DecodeFailure> {
  const decoded = decodeSearch(input);
  if (!Result.isSuccess(decoded)) return Result.fail(decoded.failure);
  const payload = decoded.success as
    | ReadonlyArray<unknown>
    | { readonly issues: ReadonlyArray<unknown> }
    | { readonly values: ReadonlyArray<unknown> };
  let entries: ReadonlyArray<unknown>;
  if (Array.isArray(payload)) {
    entries = payload;
  } else {
    const objectPayload = payload as {
      readonly issues?: ReadonlyArray<unknown>;
      readonly values?: ReadonlyArray<unknown>;
    };
    entries = objectPayload.issues ?? objectPayload.values ?? [];
  }
  const issues: Array<JiraIssueSummary> = [];
  for (const entry of entries) {
    const issue = decodeIssueEntry(entry);
    if (Exit.isSuccess(issue) && issue.value.key.trim()) issues.push(summary(issue.value));
  }
  return Result.succeed(issues);
}

export function decodeJiraIssueDetailJson(
  input: string,
): Result.Result<JiraIssueDetail, DecodeFailure> {
  const decoded = decodeIssue(input);
  if (!Result.isSuccess(decoded)) return Result.fail(decoded.failure);
  return Result.succeed({
    ...summary(decoded.success),
    description: adfText(decoded.success.fields.description).trim(),
    comments: comments(decoded.success),
  });
}
