import type { JiraIssueStatusCategory, JiraIssueView } from "@t3tools/contracts";
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  FolderIcon,
  LayersIcon,
  ShapesIcon,
} from "lucide-react";

import { WorkspaceFilterMenu } from "../WorkspaceFilterMenu";
import {
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "../ui/menu";

export const JIRA_VIEWS = [
  ["my-work", "My work"],
  ["assigned", "Assigned to me"],
  ["reported", "Reported by me"],
  ["watching", "Watching"],
  ["all", "All issues"],
] as const satisfies ReadonlyArray<readonly [JiraIssueView, string]>;

const JIRA_STATUSES = [
  ["", "Any status", LayersIcon],
  ["todo", "To do", CircleDashedIcon],
  ["in-progress", "In progress", CircleDotIcon],
  ["done", "Done", CircleCheckIcon],
] as const;

function FilterSubmenu({
  icon: Icon,
  label,
  valueLabel,
  children,
}: {
  readonly icon: typeof LayersIcon;
  readonly label: string;
  readonly valueLabel: string;
  readonly children: React.ReactNode;
}) {
  return (
    <MenuSub>
      <MenuSubTrigger>
        <Icon aria-hidden className="size-3.5" />
        <span className="flex-1">{label}</span>
        <span className="min-w-0 max-w-28 truncate text-xs text-muted-foreground">
          {valueLabel}
        </span>
      </MenuSubTrigger>
      <MenuSubPopup className="min-w-56">{children}</MenuSubPopup>
    </MenuSub>
  );
}

export function JiraWorkspaceFilters({
  view,
  project,
  status,
  issueType,
  projects,
  issueTypes,
  onViewChange,
  onProjectChange,
  onStatusChange,
  onIssueTypeChange,
  onClear,
}: {
  readonly view: JiraIssueView;
  readonly project: string | undefined;
  readonly status: JiraIssueStatusCategory | undefined;
  readonly issueType: string | undefined;
  readonly projects: ReadonlyArray<{ readonly key: string; readonly name: string }>;
  readonly issueTypes: ReadonlyArray<string>;
  readonly onViewChange: (view: JiraIssueView) => void;
  readonly onProjectChange: (project: string | undefined) => void;
  readonly onStatusChange: (status: JiraIssueStatusCategory | undefined) => void;
  readonly onIssueTypeChange: (issueType: string | undefined) => void;
  readonly onClear: () => void;
}) {
  const activeCount =
    Number(view !== "my-work") +
    Number(Boolean(project)) +
    Number(Boolean(status)) +
    Number(Boolean(issueType));
  const viewLabel = JIRA_VIEWS.find(([value]) => value === view)?.[1] ?? "My work";
  const statusLabel =
    JIRA_STATUSES.find(([value]) => value === (status ?? ""))?.[1] ?? "Any status";

  return (
    <WorkspaceFilterMenu activeCount={activeCount}>
      <FilterSubmenu icon={LayersIcon} label="View" valueLabel={viewLabel}>
        <MenuRadioGroup
          value={view}
          onValueChange={(value) => onViewChange(value as JiraIssueView)}
        >
          {JIRA_VIEWS.map(([value, label]) => (
            <MenuRadioItem key={value} value={value}>
              {label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </FilterSubmenu>

      <FilterSubmenu icon={FolderIcon} label="Project" valueLabel={project ?? "Any"}>
        <MenuRadioGroup
          value={project ?? ""}
          onValueChange={(value) => onProjectChange(value || undefined)}
        >
          <MenuRadioItem value="">Any project</MenuRadioItem>
          {projects.map((option) => (
            <MenuRadioItem key={option.key} value={option.key}>
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-medium">{option.key}</span>
                <span className="truncate text-muted-foreground">{option.name}</span>
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </FilterSubmenu>

      <FilterSubmenu icon={CircleDotIcon} label="Status" valueLabel={statusLabel}>
        <MenuRadioGroup
          value={status ?? ""}
          onValueChange={(value) =>
            onStatusChange((value || undefined) as JiraIssueStatusCategory | undefined)
          }
        >
          {JIRA_STATUSES.map(([value, label, Icon]) => (
            <MenuRadioItem key={value || "any"} value={value}>
              <span className="flex items-center gap-2">
                <Icon aria-hidden className="size-3.5" />
                {label}
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </FilterSubmenu>

      <FilterSubmenu icon={ShapesIcon} label="Issue type" valueLabel={issueType ?? "Any"}>
        <MenuRadioGroup
          value={issueType ?? ""}
          onValueChange={(value) => onIssueTypeChange(value || undefined)}
        >
          <MenuRadioItem value="">Any issue type</MenuRadioItem>
          {issueTypes.map((option) => (
            <MenuRadioItem key={option} value={option}>
              {option}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </FilterSubmenu>

      {activeCount > 0 ? (
        <>
          <MenuSeparator />
          <MenuItem onClick={onClear}>Clear filters</MenuItem>
        </>
      ) : null}
    </WorkspaceFilterMenu>
  );
}
