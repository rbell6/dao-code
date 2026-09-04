import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  type EnvironmentId,
  JiraIssueListInput,
  JiraIssueStatusCategory,
  JiraIssueSummary,
  JiraIssueView,
  ThreadId,
} from "@t3tools/contracts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RefreshCwIcon, SquareCheckBigIcon } from "lucide-react";
import { useCallback, useEffect, useEffectEvent, useMemo } from "react";
import { useAtomValue } from "@effect/atom-react";

import { RightPanelTabs } from "../components/RightPanelTabs";
import { WorkspacePageContainer } from "../components/WorkspacePageContainer";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { WorkspaceSearchInput } from "../components/WorkspaceSearchInput";
import { JiraIssueDetailView } from "../components/jira/JiraIssueDetailView";
import { JiraIssueRow } from "../components/jira/JiraIssueRow";
import { JiraWorkspaceFilters, JIRA_VIEWS } from "../components/jira/JiraWorkspaceFilters";
import {
  JiraIssueListEmptyState,
  JiraIssueListGhost,
  JiraUnavailableState,
} from "../components/jira/JiraWorkspaceStates";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { SidebarInset } from "../components/ui/sidebar";
import { Toggle, ToggleGroup } from "../components/ui/toggle-group";
import { isCommandPaletteOpen } from "../commandPaletteBus";
import { resolveShortcutCommand } from "../keybindings";
import { isTerminalFocused } from "../lib/terminalFocus";
import { normalizeJiraSite } from "../jiraSession";
import { jiraTransitionStatusOptions } from "../jiraStatusOptions";
import { jiraIssueFacets } from "../jiraWorkspace";
import {
  selectActiveRightPanelSurface,
  selectSelectedRightPanelSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
  type JiraIssueSurface,
} from "../rightPanelStore";
import { useEnvironments } from "../state/environments";
import { useProjects, useThreadShells } from "../state/entities";
import { jiraEnvironment } from "../state/jira";
import { useEnvironmentQuery } from "../state/query";
import { useDebouncedValue } from "../state/queries";
import { cn } from "~/lib/utils";
import { primaryServerKeybindingsAtom } from "~/state/server";

export interface JiraSearch {
  readonly environmentId?: EnvironmentId;
  readonly key?: string;
  readonly q?: string;
  readonly mode?: "search" | "jql";
  readonly view?: JiraIssueView;
  readonly project?: string;
  readonly status?: JiraIssueStatusCategory;
  readonly issueType?: string;
}

const STATUS_CATEGORIES: ReadonlyArray<JiraIssueStatusCategory> = ["todo", "in-progress", "done"];
const JIRA_PANEL_ID = ThreadId.make("jira-panel");
const JIRA_PANEL_ENVIRONMENT_ID = "jira-panel" as EnvironmentId;
const EMPTY_PREVIEW_SESSIONS = {};
const EMPTY_PREVIEW_DESKTOP_STATE = {};
const EMPTY_TERMINAL_LABELS = new Map<string, string>();
const EMPTY_PENDING_SURFACES = new Set<string>();

function optionalSearchString(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, limit) : undefined;
}

export const Route = createFileRoute("/_chat/jira")({
  validateSearch: (raw: Record<string, unknown>): JiraSearch => {
    const key = optionalSearchString(raw.key, 100);
    const project = optionalSearchString(raw.project, 50);
    const issueType = optionalSearchString(raw.issueType, 100);
    return {
      ...(typeof raw.environmentId === "string" && raw.environmentId
        ? { environmentId: raw.environmentId as EnvironmentId }
        : {}),
      ...(key ? { key } : {}),
      ...(typeof raw.q === "string" && raw.q ? { q: raw.q.slice(0, 2_000) } : {}),
      ...(raw.mode === "jql" ? { mode: "jql" as const } : {}),
      ...(JIRA_VIEWS.some(([value]) => value === raw.view)
        ? { view: raw.view as JiraIssueView }
        : {}),
      ...(project ? { project: project.toUpperCase() } : {}),
      ...(STATUS_CATEGORIES.some((value) => value === raw.status)
        ? { status: raw.status as JiraIssueStatusCategory }
        : {}),
      ...(issueType ? { issueType } : {}),
    };
  },
  component: JiraWorkspace,
});

function JiraWorkspace() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { environments, isReady } = useEnvironments();
  const capableEnvironments = useMemo(
    () =>
      environments.filter(
        (environment) => environment.serverConfig?.environment.capabilities.jira === true,
      ),
    [environments],
  );
  const selectedEnvironment =
    capableEnvironments.find(({ environmentId }) => environmentId === search.environmentId) ??
    capableEnvironments[0] ??
    null;
  const environmentId = selectedEnvironment?.environmentId ?? null;
  const mode = search.mode ?? "search";
  const view = search.view ?? "my-work";
  const query = search.q ?? "";
  const projects = useProjects();
  const threadShells = useThreadShells();
  const debouncedQuery = useDebouncedValue(query, 250);

  const updateSearch = useCallback(
    (patch: { readonly [Key in keyof JiraSearch]?: JiraSearch[Key] | undefined }) => {
      void navigate({
        search: (previous) => {
          const next = { ...previous, ...patch } as Record<string, unknown>;
          for (const [key, value] of Object.entries(next)) {
            if (value === undefined) delete next[key];
          }
          return next as JiraSearch;
        },
        replace: true,
      });
    },
    [navigate],
  );

  const connection = useEnvironmentQuery(
    environmentId === null ? null : jiraEnvironment.connectionStatus({ environmentId, input: {} }),
  );
  const canLoad = environmentId !== null && connection.data?.state === "ready";
  const listInput = useMemo(
    (): JiraIssueListInput => ({
      view,
      ...(mode === "jql"
        ? { jql: debouncedQuery || undefined }
        : { query: debouncedQuery.slice(0, 200) || undefined }),
      ...(search.project ? { projectKeys: [search.project] } : {}),
      ...(search.status ? { statusCategories: [search.status] } : {}),
      ...(search.issueType ? { issueTypes: [search.issueType] } : {}),
      limit: 50,
    }),
    [debouncedQuery, mode, search.issueType, search.project, search.status, view],
  );
  const issues = useEnvironmentQuery(
    canLoad && environmentId !== null
      ? jiraEnvironment.list({ environmentId, input: listInput })
      : null,
  );
  const facetIssues = useEnvironmentQuery(
    canLoad && environmentId !== null && mode === "search"
      ? jiraEnvironment.list({ environmentId, input: { view, limit: 50 } })
      : null,
  );
  const facets = useMemo(
    () => jiraIssueFacets(facetIssues.data?.issues ?? issues.data?.issues ?? []),
    [facetIssues.data?.issues, issues.data?.issues],
  );
  const rightPanelRef = useMemo(() => scopeThreadRef(JIRA_PANEL_ENVIRONMENT_ID, JIRA_PANEL_ID), []);
  const rightPanelState = useRightPanelStore((state) =>
    selectThreadRightPanelState(state.byThreadKey, rightPanelRef),
  );
  const selectedRightPanelSurface = useRightPanelStore((state) =>
    selectSelectedRightPanelSurface(state.byThreadKey, rightPanelRef),
  );
  const activeJiraSurface =
    rightPanelState.isOpen && selectedRightPanelSurface?.kind === "jira"
      ? selectedRightPanelSurface
      : null;
  const selectedKey = activeJiraSurface?.key ?? search.key ?? null;
  const detailEnvironmentId =
    (activeJiraSurface?.environmentId as EnvironmentId | undefined) ?? environmentId;
  const detail = useEnvironmentQuery(
    detailEnvironmentId !== null && selectedKey !== null
      ? jiraEnvironment.detail({ environmentId: detailEnvironmentId, input: { key: selectedKey } })
      : null,
  );
  const selectedSite = normalizeJiraSite(
    detailEnvironmentId === environmentId
      ? (connection.data?.site ?? detail.data?.url ?? null)
      : (detail.data?.url ?? null),
  );
  const environmentProjects = useMemo(
    () => projects.filter((candidate) => candidate.environmentId === detailEnvironmentId),
    [detailEnvironmentId, projects],
  );
  const linkedThreads = useMemo(
    () =>
      selectedKey === null || selectedSite === null
        ? []
        : threadShells.filter(
            (thread) =>
              thread.environmentId === detailEnvironmentId &&
              thread.linkedJiraIssue?.site.toLowerCase() === selectedSite.toLowerCase() &&
              thread.linkedJiraIssue.key.toLowerCase() === selectedKey.toLowerCase(),
          ),
    [detailEnvironmentId, selectedKey, selectedSite, threadShells],
  );
  const transitionStatusOptions = useMemo(
    () =>
      detail.data === null
        ? []
        : jiraTransitionStatusOptions(
            facetIssues.data?.issues ?? issues.data?.issues ?? [],
            detail.data,
          ),
    [detail.data, facetIssues.data?.issues, issues.data?.issues],
  );
  const openIssue = useCallback(
    (key: string, targetEnvironmentId = environmentId) => {
      if (targetEnvironmentId === null) return;
      useRightPanelStore.getState().openJiraIssue(rightPanelRef, {
        environmentId: targetEnvironmentId,
        key,
      });
      updateSearch({ environmentId: targetEnvironmentId, key });
    },
    [environmentId, rightPanelRef, updateSearch],
  );
  useEffect(() => {
    if (!search.key || environmentId === null) return;
    useRightPanelStore.getState().openJiraIssue(rightPanelRef, {
      environmentId,
      key: search.key,
    });
  }, [environmentId, rightPanelRef, search.key]);
  const clearSearch = useCallback(
    () =>
      updateSearch({
        q: undefined,
        view: "my-work",
        project: undefined,
        status: undefined,
        issueType: undefined,
      }),
    [updateSearch],
  );

  const selectSurfaceInUrl = (surface: JiraIssueSurface | null) =>
    updateSearch(
      surface === null
        ? { key: undefined }
        : { environmentId: surface.environmentId as EnvironmentId, key: surface.key },
    );
  const activateSurface = (surface: JiraIssueSurface) => {
    useRightPanelStore.getState().activateSurface(rightPanelRef, surface.id);
    selectSurfaceInUrl(surface);
  };
  const closeSurface = (surface: JiraIssueSurface) => {
    useRightPanelStore.getState().closeSurface(rightPanelRef, surface.id);
    const next = selectActiveRightPanelSurface(
      useRightPanelStore.getState().byThreadKey,
      rightPanelRef,
    );
    selectSurfaceInUrl(next?.kind === "jira" ? next : null);
  };
  const closeOtherSurfaces = (surface: JiraIssueSurface) => {
    useRightPanelStore.getState().closeOtherSurfaces(rightPanelRef, surface.id);
    selectSurfaceInUrl(surface);
  };
  const closeSurfacesToRight = (surface: JiraIssueSurface) => {
    useRightPanelStore.getState().closeSurfacesToRight(rightPanelRef, surface.id);
    const next = selectActiveRightPanelSurface(
      useRightPanelStore.getState().byThreadKey,
      rightPanelRef,
    );
    selectSurfaceInUrl(next?.kind === "jira" ? next : null);
  };
  const closeAllSurfaces = () => {
    useRightPanelStore.getState().closeAllSurfaces(rightPanelRef);
    selectSurfaceInUrl(null);
  };

  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  // This page has no ChatView, so the shared panel handles `rightPanel.close`
  // itself. With nothing open the event falls through to its native meaning.
  const closeActiveSurfaceFromShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (activeJiraSurface === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) closeSurface(activeJiraSurface);
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isCommandPaletteOpen()) return;
      const command = resolveShortcutCommand(event, keybindings, {
        context: { terminalFocus: isTerminalFocused() },
      });
      if (command === "rightPanel.close") closeActiveSurfaceFromShortcut(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keybindings]);

  if (isReady && capableEnvironments.length === 0) {
    return <JiraUnavailable />;
  }

  const refresh = () => {
    connection.refresh();
    issues.refresh();
    facetIssues.refresh();
    detail.refresh();
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden">
      <WorkspacePageHeader className="border-b">
        <SquareCheckBigIcon className="size-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold">Jira</h1>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {connection.data?.site ? (
            <span className="hidden max-w-52 truncate text-xs text-muted-foreground sm:block">
              {connection.data.site}
            </span>
          ) : null}
          {capableEnvironments.length > 1 ? (
            <Select
              value={environmentId ?? undefined}
              onValueChange={(value) =>
                value && updateSearch({ environmentId: value as EnvironmentId, key: undefined })
              }
            >
              <SelectTrigger
                aria-label="Jira environment"
                className="w-auto max-w-44 min-w-0"
                size="compact"
                variant="ghost"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {capableEnvironments.map((environment) => (
                  <SelectItem key={environment.environmentId} value={environment.environmentId}>
                    {environment.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          ) : null}
          <Button
            aria-label="Refresh Jira"
            disabled={issues.isPending}
            onClick={refresh}
            size="icon-sm"
            variant="ghost"
          >
            <RefreshCwIcon className={cn("size-3.5", issues.isPending && "animate-spin")} />
          </Button>
        </div>
      </WorkspacePageHeader>

      {connection.data?.state && connection.data.state !== "ready" ? (
        <JiraSetupState state={connection.data.state} detail={connection.data.detail} />
      ) : (
        <main className="relative flex min-h-0 flex-1">
          <WorkspacePageContainer
            className="h-full min-h-0 min-w-0 flex-1 gap-3 pt-4 pb-4"
            width="expanded"
          >
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <WorkspaceSearchInput
                ariaLabel={mode === "jql" ? "JQL query" : "Search Jira issues"}
                busy={issues.isPending && Boolean(issues.data)}
                onChange={(value) => updateSearch({ q: value || undefined })}
                placeholder={
                  mode === "jql" ? "project = APP ORDER BY updated DESC" : "Search key or text"
                }
                value={query}
              />
              <div className="flex shrink-0 items-center gap-2">
                <ToggleGroup
                  aria-label="Jira search language"
                  variant="segmented"
                  value={[mode]}
                  onValueChange={(values) => {
                    const next = values[0];
                    if (next === "search" || next === "jql") {
                      updateSearch({ mode: next === "jql" ? "jql" : undefined });
                    }
                  }}
                >
                  <Toggle value="search">Search</Toggle>
                  <Toggle value="jql">JQL</Toggle>
                </ToggleGroup>
                {mode === "search" ? (
                  <JiraWorkspaceFilters
                    issueType={search.issueType}
                    issueTypes={facets.issueTypes}
                    onClear={clearSearch}
                    onIssueTypeChange={(issueType) => updateSearch({ issueType })}
                    onProjectChange={(project) => updateSearch({ project })}
                    onStatusChange={(status) => updateSearch({ status })}
                    onViewChange={(nextView) => updateSearch({ view: nextView })}
                    project={search.project}
                    projects={facets.projects}
                    status={search.status}
                    view={view}
                  />
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-background">
              <IssueList
                error={issues.error}
                filtered={
                  view !== "my-work" || Boolean(search.project || search.status || search.issueType)
                }
                isPending={issues.isPending || connection.isPending}
                issues={issues.data?.issues ?? []}
                onClear={clearSearch}
                onRefresh={refresh}
                onSelect={openIssue}
                query={query}
                selectedKey={
                  activeJiraSurface?.environmentId === environmentId ? selectedKey : null
                }
              />
            </div>
          </WorkspacePageContainer>

          {activeJiraSurface && detailEnvironmentId !== null ? (
            <RightPanelTabs
              activeSurfaceId={activeJiraSurface.id}
              agentsAvailable={false}
              browserAvailable={false}
              defaultWidth={typeof window === "undefined" ? 640 : Math.floor(window.innerWidth / 2)}
              desktopByTabId={EMPTY_PREVIEW_DESKTOP_STATE}
              diffAvailable={false}
              environmentId={detailEnvironmentId}
              filesAvailable={false}
              liveAgentCount={0}
              mode="inline"
              onActivate={(surface) => {
                if (surface.kind === "jira") activateSurface(surface);
              }}
              onAddAgents={() => undefined}
              onAddBrowser={() => undefined}
              onAddBrowserInProfile={() => undefined}
              onAddDiff={() => undefined}
              onAddFiles={() => undefined}
              onAddJira={() => undefined}
              onAddPullRequest={() => undefined}
              onAddTerminal={() => undefined}
              onCloseAllSurfaces={closeAllSurfaces}
              onCloseOtherSurfaces={(surface) => {
                if (surface.kind === "jira") closeOtherSurfaces(surface);
              }}
              onCloseSurface={(surface) => {
                if (surface.kind === "jira") closeSurface(surface);
              }}
              onCloseSurfacesToRight={(surface) => {
                if (surface.kind === "jira") closeSurfacesToRight(surface);
              }}
              onCopyFilePath={() => undefined}
              open={rightPanelState.isOpen}
              jiraAvailable={false}
              pendingSurfaceIds={EMPTY_PENDING_SURFACES}
              previewSessions={EMPTY_PREVIEW_SESSIONS}
              pullRequestAvailable={false}
              surfaces={rightPanelState.surfaces}
              terminalAvailable={false}
              terminalLabelsById={EMPTY_TERMINAL_LABELS}
              widthStorageKey="t3code:jira-panel-width"
            >
              <JiraIssueDetailView
                detail={detail.data}
                environmentId={detailEnvironmentId}
                error={detail.error}
                isPending={detail.isPending}
                key={`${detailEnvironmentId}:${selectedKey ?? "empty"}`}
                linkedThreads={linkedThreads}
                onChanged={() => {
                  issues.refresh();
                  facetIssues.refresh();
                  detail.refresh();
                }}
                projects={environmentProjects}
                site={selectedSite}
                statusOptions={transitionStatusOptions}
              />
            </RightPanelTabs>
          ) : null}
        </main>
      )}
    </SidebarInset>
  );
}

function JiraUnavailable() {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden">
      <WorkspacePageHeader className="border-b">
        <SquareCheckBigIcon className="size-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold">Jira</h1>
      </WorkspacePageHeader>
      <JiraUnavailableState
        description="Update and reconnect the environment that should run Atlassian CLI."
        title="Jira is not available on a connected environment"
      />
    </SidebarInset>
  );
}

function JiraSetupState({
  state,
  detail,
}: {
  readonly state: "missing-tool" | "unauthenticated" | "failed";
  readonly detail: string;
}) {
  return (
    <div className="grid flex-1 place-items-center p-6 text-center">
      <div className="max-w-xl space-y-4">
        <SquareCheckBigIcon className="mx-auto size-9 text-muted-foreground" />
        <div>
          <h2 className="font-semibold">
            {state === "missing-tool"
              ? "Install Atlassian CLI"
              : state === "unauthenticated"
                ? "Connect Jira Cloud"
                : "Jira is unavailable"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        </div>
        {state !== "failed" ? (
          <code className="block rounded-lg border bg-muted/40 p-3 text-left text-xs">
            {state === "missing-tool"
              ? "https://developer.atlassian.com/cloud/acli/guides/install-acli/"
              : "acli jira auth login --web"}
          </code>
        ) : null}
      </div>
    </div>
  );
}

function IssueList({
  issues,
  selectedKey,
  isPending,
  error,
  query,
  filtered,
  onSelect,
  onClear,
  onRefresh,
}: {
  readonly issues: ReadonlyArray<JiraIssueSummary>;
  readonly selectedKey: string | null;
  readonly isPending: boolean;
  readonly error: string | null;
  readonly query: string;
  readonly filtered: boolean;
  readonly onSelect: (key: string) => void;
  readonly onClear: () => void;
  readonly onRefresh: () => void;
}) {
  return (
    <section className="h-full min-h-0 overflow-y-auto p-2">
      {isPending && issues.length === 0 ? (
        <JiraIssueListGhost />
      ) : error && issues.length === 0 ? (
        <JiraUnavailableState
          description={error}
          onRetry={onRefresh}
          title="Could not load issues"
        />
      ) : issues.length === 0 ? (
        <JiraIssueListEmptyState
          filtered={filtered}
          onClear={onClear}
          onRefresh={onRefresh}
          query={query}
          refreshing={isPending}
        />
      ) : (
        <>
          {error ? (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <span className="truncate">Could not refresh: {error}</span>
              <Button onClick={onRefresh} size="xs" variant="ghost">
                Retry
              </Button>
            </div>
          ) : null}
          <div className="space-y-0.5" role="list">
            {issues.map((issue) => (
              <JiraIssueRow
                issue={issue}
                key={issue.key}
                onSelect={onSelect}
                selected={selectedKey === issue.key}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
