import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const JiraConnectionState = Schema.Literals([
  "ready",
  "missing-tool",
  "unauthenticated",
  "failed",
]);
export type JiraConnectionState = typeof JiraConnectionState.Type;

export const JiraConnectionStatus = Schema.Struct({
  state: JiraConnectionState,
  site: Schema.NullOr(Schema.String),
  email: Schema.NullOr(Schema.String),
  authenticationType: Schema.NullOr(Schema.String),
  detail: Schema.String,
});
export type JiraConnectionStatus = typeof JiraConnectionStatus.Type;

export const JiraIssueStatusCategory = Schema.Literals(["todo", "in-progress", "done", "unknown"]);
export type JiraIssueStatusCategory = typeof JiraIssueStatusCategory.Type;

export const JiraActor = Schema.Struct({
  accountId: Schema.NullOr(Schema.String),
  displayName: Schema.String,
  avatarUrl: Schema.NullOr(Schema.String),
});
export type JiraActor = typeof JiraActor.Type;

export const JiraIssueStatus = Schema.Struct({
  id: Schema.NullOr(Schema.String),
  name: Schema.String,
  category: JiraIssueStatusCategory,
});
export type JiraIssueStatus = typeof JiraIssueStatus.Type;

export const JiraIssueType = Schema.Struct({
  id: Schema.NullOr(Schema.String),
  name: Schema.String,
  iconUrl: Schema.NullOr(Schema.String),
});
export type JiraIssueType = typeof JiraIssueType.Type;

export const JiraIssuePriority = Schema.Struct({
  id: Schema.NullOr(Schema.String),
  name: Schema.String,
  iconUrl: Schema.NullOr(Schema.String),
});
export type JiraIssuePriority = typeof JiraIssuePriority.Type;

export const JiraIssueSummary = Schema.Struct({
  key: TrimmedNonEmptyString,
  summary: Schema.String,
  url: Schema.NullOr(Schema.String),
  projectKey: Schema.String,
  projectName: Schema.String,
  status: JiraIssueStatus,
  issueType: JiraIssueType,
  priority: Schema.NullOr(JiraIssuePriority),
  assignee: Schema.NullOr(JiraActor),
  reporter: Schema.NullOr(JiraActor),
  labels: Schema.Array(Schema.String),
  createdAt: Schema.NullOr(Schema.String),
  updatedAt: Schema.NullOr(Schema.String),
});
export type JiraIssueSummary = typeof JiraIssueSummary.Type;

export const JiraComment = Schema.Struct({
  id: Schema.String,
  author: Schema.NullOr(JiraActor),
  body: Schema.String,
  createdAt: Schema.NullOr(Schema.String),
  updatedAt: Schema.NullOr(Schema.String),
});
export type JiraComment = typeof JiraComment.Type;

export const JiraIssueDetail = Schema.Struct({
  ...JiraIssueSummary.fields,
  description: Schema.String,
  comments: Schema.Array(JiraComment),
});
export type JiraIssueDetail = typeof JiraIssueDetail.Type;

export const JiraIssueView = Schema.Literals([
  "my-work",
  "assigned",
  "reported",
  "watching",
  "all",
]);
export type JiraIssueView = typeof JiraIssueView.Type;

export const JiraIssueListInput = Schema.Struct({
  view: Schema.optional(JiraIssueView),
  query: Schema.optional(Schema.String.check(Schema.isMaxLength(200))),
  jql: Schema.optional(Schema.String.check(Schema.isMaxLength(2_000))),
  projectKeys: Schema.optional(
    Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(50))).check(Schema.isMaxLength(20)),
  ),
  statusCategories: Schema.optional(
    Schema.Array(JiraIssueStatusCategory).check(Schema.isMaxLength(4)),
  ),
  issueTypes: Schema.optional(
    Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(100))).check(
      Schema.isMaxLength(20),
    ),
  ),
  limit: Schema.optional(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(100)),
  ),
});
export type JiraIssueListInput = typeof JiraIssueListInput.Type;

export const JiraIssueListResult = Schema.Struct({
  issues: Schema.Array(JiraIssueSummary),
  jql: Schema.String,
});
export type JiraIssueListResult = typeof JiraIssueListResult.Type;

export const JiraIssueRef = Schema.Struct({ key: TrimmedNonEmptyString });
export type JiraIssueRef = typeof JiraIssueRef.Type;

export const JiraCommentInput = Schema.Struct({
  key: TrimmedNonEmptyString,
  body: TrimmedNonEmptyString.check(Schema.isMaxLength(32_000)),
});
export type JiraCommentInput = typeof JiraCommentInput.Type;

export const JiraTransitionInput = Schema.Struct({
  key: TrimmedNonEmptyString,
  status: TrimmedNonEmptyString.check(Schema.isMaxLength(200)),
});
export type JiraTransitionInput = typeof JiraTransitionInput.Type;

export class JiraUnavailableError extends Schema.TaggedErrorClass<JiraUnavailableError>()(
  "JiraUnavailableError",
  {
    reason: Schema.Literals(["missing-tool", "unauthenticated", "failed"]),
    message: Schema.String,
  },
) {}

export class JiraOperationError extends Schema.TaggedErrorClass<JiraOperationError>()(
  "JiraOperationError",
  {
    operation: Schema.String,
    message: Schema.String,
  },
) {}
