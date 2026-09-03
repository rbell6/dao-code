import { RefreshCwIcon, SearchIcon, SquareCheckBigIcon } from "lucide-react";

import { Button } from "../ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty";

function GhostBar({ className }: { readonly className: string }) {
  return <div aria-hidden className={`rounded-md bg-accent ${className}`} />;
}

export function JiraIssueListGhost({ rows = 7 }: { readonly rows?: number }) {
  return (
    <div
      aria-label="Loading Jira issues"
      className="space-y-0.5 motion-safe:animate-skeleton"
      role="status"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2"
          key={index}
        >
          <GhostBar className="size-4 rounded-full" />
          <div className="space-y-2">
            <GhostBar className={index % 2 === 0 ? "h-3.5 w-3/5" : "h-3.5 w-2/5"} />
            <GhostBar className="h-3 w-2/5" />
          </div>
          <GhostBar className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}

export function JiraIssueDetailGhost() {
  return (
    <div
      aria-label="Loading Jira issue"
      className="space-y-6 p-5 motion-safe:animate-skeleton sm:p-6"
      role="status"
    >
      <div className="space-y-2">
        <GhostBar className="h-3 w-28" />
        <GhostBar className="h-6 w-4/5" />
      </div>
      <GhostBar className="h-24 w-full rounded-lg" />
      <div className="space-y-2">
        <GhostBar className="h-4 w-20" />
        <GhostBar className="h-20 w-full" />
      </div>
    </div>
  );
}

export function JiraUnavailableState({
  title,
  description,
  onRetry,
}: {
  readonly title: string;
  readonly description: string;
  readonly onRetry?: () => void;
}) {
  return (
    <Empty className="py-16">
      <EmptyMedia variant="icon">
        <SquareCheckBigIcon />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {onRetry ? (
        <EmptyContent>
          <Button onClick={onRetry} size="sm" variant="outline">
            <RefreshCwIcon className="size-3.5" /> Retry
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

export function JiraIssueListEmptyState({
  query,
  filtered,
  refreshing,
  onClear,
  onRefresh,
}: {
  readonly query: string;
  readonly filtered: boolean;
  readonly refreshing: boolean;
  readonly onClear: () => void;
  readonly onRefresh: () => void;
}) {
  const queryLabel = query.length > 48 ? `${query.slice(0, 48)}...` : query;
  return (
    <Empty className="py-16">
      <EmptyMedia variant="icon">{query ? <SearchIcon /> : <SquareCheckBigIcon />}</EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>
          {query
            ? `Nothing matches "${queryLabel}"`
            : filtered
              ? "Nothing under these filters"
              : "No Jira issues"}
        </EmptyTitle>
        <EmptyDescription>
          {query
            ? "Try fewer words or search by issue key."
            : filtered
              ? "Widen the view, project, status, or issue type filter."
              : "Issues assigned to, reported by, or watched by you appear here."}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center gap-2">
        {query || filtered ? (
          <Button onClick={onClear} size="sm" variant="outline">
            Clear filters
          </Button>
        ) : null}
        <Button disabled={refreshing} onClick={onRefresh} size="sm" variant="outline">
          <RefreshCwIcon className="size-3.5" />
          {refreshing ? "Checking..." : "Check again"}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
