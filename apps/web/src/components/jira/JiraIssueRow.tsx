import type { JiraIssueSummary } from "@t3tools/contracts";
import { memo } from "react";

import { cn } from "~/lib/utils";

import { Badge } from "../ui/badge";
import { formatJiraRelativeDate, JiraStatusIcon } from "./JiraIssuePresentation";

function JiraIssueRowImpl({
  issue,
  selected,
  onSelect,
}: {
  readonly issue: JiraIssueSummary;
  readonly selected: boolean;
  readonly onSelect: (key: string) => void;
}) {
  return (
    <button
      aria-current={selected ? "true" : undefined}
      className={cn(
        "@container/jira-row grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "[contain-intrinsic-block-size:58px] [content-visibility:auto]",
        selected ? "bg-accent" : "hover:bg-accent/60",
      )}
      onClick={() => onSelect(issue.key)}
      type="button"
    >
      <JiraStatusIcon category={issue.status.category} className="size-4 shrink-0" />
      <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
        <span className="truncate text-sm font-medium text-foreground">{issue.summary}</span>
        <span className="justify-self-end whitespace-nowrap text-xs text-muted-foreground/70 tabular-nums">
          {formatJiraRelativeDate(issue.updatedAt)}
        </span>
        <span className="flex min-w-0 items-center gap-2 overflow-hidden text-xs text-muted-foreground/70">
          <span className="shrink-0 font-medium text-foreground/80">{issue.key}</span>
          <span className="truncate">{issue.projectName}</span>
          <Badge className="max-w-36 truncate" size="sm" variant="secondary">
            {issue.status.name}
          </Badge>
          <span className="hidden min-w-0 truncate @xl/jira-row:block">
            {issue.assignee?.displayName ?? "Unassigned"}
          </span>
        </span>
      </span>
    </button>
  );
}

export const JiraIssueRow = memo(JiraIssueRowImpl);
