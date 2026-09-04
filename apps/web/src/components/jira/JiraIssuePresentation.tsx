import type { JiraIssueStatusCategory } from "@t3tools/contracts";
import { CheckCircle2Icon, CircleDotIcon, CircleIcon, SquareCheckBigIcon } from "lucide-react";

import { cn } from "~/lib/utils";

export function JiraStatusIcon({
  category,
  className,
}: {
  readonly category: JiraIssueStatusCategory;
  readonly className?: string;
}) {
  switch (category) {
    case "done":
      return <CheckCircle2Icon className={cn("text-emerald-500", className)} />;
    case "in-progress":
      return <CircleDotIcon className={cn("text-blue-500", className)} />;
    case "todo":
      return <CircleIcon className={cn("text-muted-foreground", className)} />;
    case "unknown":
      return <SquareCheckBigIcon className={cn("text-muted-foreground", className)} />;
  }
}

export function formatJiraRelativeDate(value: string | null): string {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const elapsed = Date.now() - timestamp;
  const minutes = Math.round(elapsed / 60_000);
  if (Math.abs(minutes) < 60) return `${Math.max(1, Math.abs(minutes))}m`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `${Math.abs(hours)}h`;
  return `${Math.abs(Math.round(hours / 24))}d`;
}
