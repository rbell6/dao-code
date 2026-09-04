import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  type EnvironmentId,
  JiraIssueDetail,
  JiraIssueListInput,
  JiraIssueStatusCategory,
  JiraIssueSummary,
  JiraIssueView,
  ProjectId,
  type ThreadLinkedJiraIssue,
  ThreadId,
} from "@t3tools/contracts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  LoaderIcon,
  MessageSquareIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareCheckBigIcon,
  UnlinkIcon,
} from "lucide-react";
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { useAtomValue } from "@effect/atom-react";

import { RightPanelTabs } from "../components/RightPanelTabs";
import { WorkspacePageContainer } from "../components/WorkspacePageContainer";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { WorkspaceSearchInput } from "../components/WorkspaceSearchInput";
import { formatJiraRelativeDate, JiraStatusIcon } from "../components/jira/JiraIssuePresentation";
import { JiraIssueRow } from "../components/jira/JiraIssueRow";
import { JiraWorkspaceFilters, JIRA_VIEWS } from "../components/jira/JiraWorkspaceFilters";
import {
  JiraIssueDetailGhost,
  JiraIssueListEmptyState,
  JiraIssueListGhost,
  JiraUnavailableState,
} from "../components/jira/JiraWorkspaceStates";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { SidebarInset } from "../components/ui/sidebar";
import { Textarea } from "../components/ui/textarea";
import { toastManager } from "../components/ui/toast";
import { Toggle, ToggleGroup } from "../components/ui/toggle-group";
import { isCommandPaletteOpen } from "../commandPaletteBus";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { resolveShortcutCommand } from "../keybindings";
import { isTerminalFocused } from "../lib/terminalFocus";
import { buildJiraStarterPrompt, normalizeJiraSite } from "../jiraSession";
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
import { useAtomCommand } from "../state/use-atom-command";
import { threadEnvironment } from "../state/threads";
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
const CHOOSE_STATUS_VALUE = "__choose_status__";
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
              pendingSurfaceIds={EMPTY_PENDING_SURFACES}
              previewSessions={EMPTY_PREVIEW_SESSIONS}
              pullRequestAvailable={false}
              surfaces={rightPanelState.surfaces}
              terminalAvailable={false}
              terminalLabelsById={EMPTY_TERMINAL_LABELS}
              widthStorageKey="t3code:jira-panel-width"
            >
              <IssueDetail
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

function IssueDetail({
  detail,
  environmentId,
  isPending,
  error,
  linkedThreads,
  onChanged,
  projects,
  site,
  statusOptions,
}: {
  readonly detail: JiraIssueDetail | null;
  readonly environmentId: EnvironmentId | null;
  readonly isPending: boolean;
  readonly error: string | null;
  readonly linkedThreads: ReturnType<typeof useThreadShells>;
  readonly onChanged: () => void;
  readonly projects: ReturnType<typeof useProjects>;
  readonly site: string | null;
  readonly statusOptions: ReadonlyArray<string>;
}) {
  const navigate = useNavigate();
  const comment = useAtomCommand(jiraEnvironment.comment, { reportFailure: false });
  const transition = useAtomCommand(jiraEnvironment.transition, { reportFailure: false });
  const updateThreadMetadata = useAtomCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const [commentBody, setCommentBody] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [startSessionOpen, setStartSessionOpen] = useState(false);

  if (isPending && detail === null) return <JiraIssueDetailGhost />;
  if (error && detail === null) {
    return <JiraUnavailableState description={error} title="Could not load this issue" />;
  }
  if (detail === null || environmentId === null) {
    return (
      <JiraUnavailableState
        description="Choose an issue from the list to see its description, activity, and actions."
        title="Select an issue"
      />
    );
  }
  const issue = detail;
  const targetEnvironmentId = environmentId;

  async function postComment() {
    if (!commentBody.trim()) return;
    setIsPosting(true);
    const result = await comment({
      environmentId: targetEnvironmentId,
      input: { key: issue.key, body: commentBody.trim() },
    });
    setIsPosting(false);
    if (result._tag === "Success") {
      setCommentBody("");
      onChanged();
      toastManager.add({ type: "success", title: `Comment added to ${issue.key}` });
    } else {
      toastManager.add({ type: "error", title: `Could not comment on ${issue.key}` });
    }
  }

  async function changeStatus() {
    if (!nextStatus.trim()) return;
    setIsTransitioning(true);
    const targetStatus = nextStatus.trim();
    const result = await transition({
      environmentId: targetEnvironmentId,
      input: { key: issue.key, status: targetStatus },
    });
    setIsTransitioning(false);
    if (result._tag === "Success") {
      setNextStatus("");
      onChanged();
      toastManager.add({ type: "success", title: `${issue.key} moved to ${targetStatus}` });
    } else {
      toastManager.add({ type: "error", title: `Could not transition ${issue.key}` });
    }
  }

  async function unlinkSession(threadId: (typeof linkedThreads)[number]["id"]) {
    const result = await updateThreadMetadata({
      environmentId: targetEnvironmentId,
      input: { threadId, linkedJiraIssue: null },
    });
    toastManager.add(
      result._tag === "Success"
        ? { type: "success", title: `Session unlinked from ${issue.key}` }
        : { type: "error", title: `Could not unlink the session from ${issue.key}` },
    );
  }

  return (
    <article className="min-h-0 overflow-y-auto p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{detail.key}</span>
            <span>{detail.issueType.name}</span>
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">{detail.summary}</h2>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            disabled={projects.length === 0 || site === null}
            onClick={() => setStartSessionOpen(true)}
            size="sm"
          >
            <PlayIcon /> {linkedThreads.length > 0 ? "Start another" : "Start session"}
          </Button>
          {detail.url ? (
            <Button
              render={<a href={detail.url} rel="noreferrer" target="_blank" />}
              size="sm"
              variant="outline"
            >
              Open <ArrowUpRightIcon />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 rounded-lg border bg-muted/20 p-4 text-sm sm:grid-cols-2">
        <DetailField label="Status" value={detail.status.name} />
        <DetailField label="Assignee" value={detail.assignee?.displayName ?? "Unassigned"} />
        <DetailField label="Reporter" value={detail.reporter?.displayName ?? "Unknown"} />
        <DetailField label="Priority" value={detail.priority?.name ?? "None"} />
      </div>

      <section className="mt-6">
        <h3 className="text-sm font-semibold">Work</h3>
        {linkedThreads.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No T3 Code sessions are linked to this ticket.
          </p>
        ) : (
          <div className="mt-2 space-y-1">
            {linkedThreads.map((thread) => (
              <div
                className="group flex items-center rounded-lg border border-transparent transition-colors hover:bg-accent/60"
                key={`${thread.environmentId}:${thread.id}`}
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={() =>
                    void navigate({
                      to: "/$environmentId/$threadId",
                      params: { environmentId: thread.environmentId, threadId: thread.id },
                    })
                  }
                  type="button"
                >
                  <JiraStatusIcon
                    category={thread.latestTurn?.state === "running" ? "in-progress" : "todo"}
                    className="size-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{thread.title}</span>
                    <span className="mt-0.5 flex min-w-0 gap-2 text-xs text-muted-foreground">
                      <span className="shrink-0">
                        {thread.latestTurn?.state === "running" ? "Running" : "Session"}
                      </span>
                      {thread.branch ? <span className="truncate">{thread.branch}</span> : null}
                      {thread.linkedPullRequest ? (
                        <span className="shrink-0">PR #{thread.linkedPullRequest.number}</span>
                      ) : null}
                    </span>
                  </span>
                </button>
                <Button
                  aria-label={`Unlink ${thread.title} from ${issue.key}`}
                  className="mr-2 shrink-0 opacity-70 group-hover:opacity-100"
                  onClick={() => void unlinkSession(thread.id)}
                  size="icon-xs"
                  variant="ghost"
                >
                  <UnlinkIcon />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h3 className="text-sm font-semibold">Transition</h3>
        <div className="mt-2 flex gap-2">
          <Select
            value={nextStatus || CHOOSE_STATUS_VALUE}
            onValueChange={(value) =>
              setNextStatus(value === CHOOSE_STATUS_VALUE ? "" : (value ?? ""))
            }
          >
            <SelectTrigger aria-label="Destination Jira status" className="min-w-0 flex-1">
              <SelectValue>
                {nextStatus ||
                  (statusOptions.length === 0 ? "No other statuses loaded" : "Choose a status")}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value={CHOOSE_STATUS_VALUE}>Choose a status</SelectItem>
              {statusOptions.map((statusOption) => (
                <SelectItem key={statusOption} value={statusOption}>
                  {statusOption}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <Button
            disabled={isTransitioning || !nextStatus.trim()}
            onClick={() => void changeStatus()}
          >
            {isTransitioning ? <LoaderIcon className="animate-spin" /> : null} Move
          </Button>
        </div>
      </section>

      <section className="mt-7">
        <h3 className="text-sm font-semibold">Description</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
          {detail.description || "No description."}
        </p>
      </section>

      <section className="mt-7">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquareIcon className="size-4" /> Comments ({detail.comments.length})
        </h3>
        <div className="mt-3 space-y-3">
          {detail.comments.map((entry) => (
            <div className="rounded-lg border p-3" key={entry.id}>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {entry.author?.displayName ?? "Unknown"}
                </span>
                <span>{formatJiraRelativeDate(entry.createdAt)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{entry.body}</p>
            </div>
          ))}
          {detail.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          ) : null}
        </div>
        <Textarea
          aria-label="Jira comment"
          className="mt-4"
          onChange={(event) => setCommentBody(event.target.value)}
          placeholder="Add a comment"
          value={commentBody}
        />
        <Button
          className="mt-2"
          disabled={isPosting || !commentBody.trim()}
          onClick={() => void postComment()}
          size="sm"
        >
          {isPosting ? <LoaderIcon className="animate-spin" /> : null} Comment
        </Button>
      </section>

      <StartJiraSessionDialog
        environmentId={targetEnvironmentId}
        issue={issue}
        key={`${issue.key}:${startSessionOpen ? "open" : "closed"}`}
        onOpenChange={setStartSessionOpen}
        open={startSessionOpen}
        projects={projects}
        site={site}
      />
    </article>
  );
}

function StartJiraSessionDialog({
  environmentId,
  issue,
  onOpenChange,
  open,
  projects,
  site,
}: {
  readonly environmentId: EnvironmentId;
  readonly issue: JiraIssueDetail;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly projects: ReturnType<typeof useProjects>;
  readonly site: string | null;
}) {
  const newThread = useNewThreadHandler();
  const [projectId, setProjectId] = useState<ProjectId | "">(projects[0]?.id ?? "");
  const [prompt, setPrompt] = useState(() => buildJiraStarterPrompt(issue));
  const [isStarting, setIsStarting] = useState(false);

  async function startSession() {
    const url = issue.url ?? (site ? `https://${site}/browse/${issue.key}` : null);
    if (!projectId || site === null || url === null || !prompt.trim()) return;
    const linkedJiraIssue: ThreadLinkedJiraIssue = { site, key: issue.key, url };
    setIsStarting(true);
    const result = await newThread(scopeProjectRef(environmentId, projectId), {
      linkedJiraIssue,
      starterPrompt: prompt.trim(),
    });
    if (result === null) {
      setIsStarting(false);
      toastManager.add({ type: "error", title: `Could not start a session for ${issue.key}` });
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Start a session for {issue.key}</DialogTitle>
          <DialogDescription>
            Choose the project T3 Code should work in. You can review the prompt before sending it.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Project</span>
            <Select
              value={projectId || undefined}
              onValueChange={(value) => value && setProjectId(value as ProjectId)}
            >
              <SelectTrigger aria-label="Project for Jira session">
                <SelectValue placeholder="Choose a project" />
              </SelectTrigger>
              <SelectPopup>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.title}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Starter prompt</span>
            <Textarea
              aria-label="Jira session starter prompt"
              className="min-h-48"
              onChange={(event) => setPrompt(event.target.value)}
              value={prompt}
            />
          </label>
        </DialogPanel>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} size="sm" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={isStarting || !projectId || site === null || !prompt.trim()}
            onClick={() => void startSession()}
            size="sm"
          >
            {isStarting ? <LoaderIcon className="animate-spin" /> : <PlayIcon />}
            Continue to session
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function DetailField({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}
