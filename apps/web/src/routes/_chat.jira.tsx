import type {
  EnvironmentId,
  JiraIssueDetail,
  JiraIssueListInput,
  JiraIssueStatusCategory,
  JiraIssueSummary,
  JiraIssueView,
  ProjectId,
  ThreadLinkedJiraIssue,
} from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  CircleIcon,
  LoaderIcon,
  MessageSquareIcon,
  PlayIcon,
  RefreshCwIcon,
  SearchIcon,
  SquareCheckBigIcon,
  UnlinkIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { Badge } from "../components/ui/badge";
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
import { Input } from "../components/ui/input";
import { SidebarInset } from "../components/ui/sidebar";
import { Textarea } from "../components/ui/textarea";
import { toastManager } from "../components/ui/toast";
import { useDebouncedValue } from "../state/queries";
import { useEnvironments } from "../state/environments";
import { useProjects, useThreadShells } from "../state/entities";
import { jiraEnvironment } from "../state/jira";
import { threadEnvironment } from "../state/threads";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { buildJiraStarterPrompt, normalizeJiraSite } from "../jiraSession";
import { jiraTransitionStatusOptions } from "../jiraStatusOptions";
import { cn } from "~/lib/utils";

export interface JiraSearch {
  readonly environmentId?: EnvironmentId;
  readonly key?: string;
  readonly q?: string;
  readonly mode?: "search" | "jql";
  readonly view?: JiraIssueView;
}

const VIEWS = [
  ["my-work", "My work"],
  ["assigned", "Assigned"],
  ["reported", "Reported"],
  ["watching", "Watching"],
  ["all", "All"],
] as const satisfies ReadonlyArray<readonly [JiraIssueView, string]>;

export const Route = createFileRoute("/_chat/jira")({
  validateSearch: (raw: Record<string, unknown>): JiraSearch => ({
    ...(typeof raw.environmentId === "string" && raw.environmentId
      ? { environmentId: raw.environmentId as EnvironmentId }
      : {}),
    ...(typeof raw.key === "string" && raw.key ? { key: raw.key.slice(0, 100) } : {}),
    ...(typeof raw.q === "string" && raw.q ? { q: raw.q.slice(0, 2_000) } : {}),
    ...(raw.mode === "jql" ? { mode: "jql" as const } : {}),
    ...(VIEWS.some(([value]) => value === raw.view) ? { view: raw.view as JiraIssueView } : {}),
  }),
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
  const [query, setQuery] = useState(search.q ?? "");
  const [project, setProject] = useState("");
  const [status, setStatus] = useState<JiraIssueStatusCategory | "">("");
  const [issueType, setIssueType] = useState("");
  const projects = useProjects();
  const threadShells = useThreadShells();
  const debouncedQuery = useDebouncedValue(query, 250);

  const connection = useEnvironmentQuery(
    environmentId === null ? null : jiraEnvironment.connectionStatus({ environmentId, input: {} }),
  );
  const listInput = useMemo(
    (): JiraIssueListInput => ({
      view,
      ...(mode === "jql"
        ? { jql: debouncedQuery || undefined }
        : { query: debouncedQuery || undefined }),
      ...(project.trim() ? { projectKeys: [project.trim().toUpperCase()] } : {}),
      ...(status ? { statusCategories: [status] } : {}),
      ...(issueType.trim() ? { issueTypes: [issueType.trim()] } : {}),
      limit: 50,
    }),
    [debouncedQuery, issueType, mode, project, status, view],
  );
  const issues = useEnvironmentQuery(
    environmentId === null || connection.data?.state !== "ready"
      ? null
      : jiraEnvironment.list({ environmentId, input: listInput }),
  );
  const selectedKey = search.key ?? issues.data?.issues[0]?.key ?? null;
  const detail = useEnvironmentQuery(
    environmentId === null || selectedKey === null || connection.data?.state !== "ready"
      ? null
      : jiraEnvironment.detail({ environmentId, input: { key: selectedKey } }),
  );
  const selectedSite = normalizeJiraSite(connection.data?.site ?? detail.data?.url ?? null);
  const environmentProjects = useMemo(
    () => projects.filter((candidate) => candidate.environmentId === environmentId),
    [environmentId, projects],
  );
  const linkedThreads = useMemo(
    () =>
      selectedKey === null || selectedSite === null
        ? []
        : threadShells.filter(
            (thread) =>
              thread.environmentId === environmentId &&
              thread.linkedJiraIssue?.site.toLowerCase() === selectedSite.toLowerCase() &&
              thread.linkedJiraIssue.key.toLowerCase() === selectedKey.toLowerCase(),
          ),
    [environmentId, selectedKey, selectedSite, threadShells],
  );
  const transitionStatusOptions = useMemo(
    () =>
      detail.data === null
        ? []
        : jiraTransitionStatusOptions(issues.data?.issues ?? [], detail.data),
    [detail.data, issues.data?.issues],
  );

  function updateSearch(patch: {
    readonly [Key in keyof JiraSearch]?: JiraSearch[Key] | undefined;
  }) {
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
  }

  if (isReady && capableEnvironments.length === 0) {
    return <JiraUnavailable />;
  }

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden">
      <WorkspacePageHeader className="border-b">
        <SquareCheckBigIcon className="size-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold">Jira</h1>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {capableEnvironments.length > 1 ? (
            <select
              aria-label="Jira environment"
              className="h-8 max-w-44 rounded-md border border-input bg-background px-2 text-sm"
              onChange={(event) =>
                updateSearch({ environmentId: event.target.value as EnvironmentId, key: undefined })
              }
              value={environmentId ?? ""}
            >
              {capableEnvironments.map((environment) => (
                <option key={environment.environmentId} value={environment.environmentId}>
                  {environment.label}
                </option>
              ))}
            </select>
          ) : null}
          <Button
            aria-label="Refresh Jira"
            disabled={issues.isPending}
            onClick={() => {
              connection.refresh();
              issues.refresh();
              detail.refresh();
            }}
            size="icon"
            variant="ghost"
          >
            <RefreshCwIcon className={cn("size-4", issues.isPending && "animate-spin")} />
          </Button>
        </div>
      </WorkspacePageHeader>

      {connection.data?.state && connection.data.state !== "ready" ? (
        <JiraSetupState state={connection.data.state} detail={connection.data.detail} />
      ) : (
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col gap-3 border-b p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-1">
              {mode === "search" ? (
                VIEWS.map(([value, label]) => (
                  <Button
                    key={value}
                    onClick={() => updateSearch({ view: value, key: undefined })}
                    size="sm"
                    variant={view === value ? "secondary" : "ghost"}
                  >
                    {label}
                  </Button>
                ))
              ) : (
                <span className="px-2 text-sm font-medium">JQL query</span>
              )}
              {connection.data?.site ? (
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {connection.data.site}
                </span>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 lg:flex-row">
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label={mode === "jql" ? "JQL query" : "Search Jira issues"}
                  className="pl-9"
                  onBlur={() => updateSearch({ q: query || undefined })}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={
                    mode === "jql" ? "project = APP ORDER BY updated DESC" : "Search key or text"
                  }
                  value={query}
                />
              </div>
              <Button
                onClick={() => updateSearch({ mode: mode === "jql" ? "search" : "jql" })}
                size="sm"
                variant="outline"
              >
                {mode === "jql" ? "JQL" : "Search"}
              </Button>
              {mode === "search" ? (
                <>
                  <Input
                    aria-label="Filter by project key"
                    className="lg:w-32"
                    onChange={(event) => setProject(event.target.value)}
                    placeholder="Project"
                    value={project}
                  />
                  <select
                    aria-label="Filter by status"
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    onChange={(event) =>
                      setStatus(event.target.value as JiraIssueStatusCategory | "")
                    }
                    value={status}
                  >
                    <option value="">Any status</option>
                    <option value="todo">To do</option>
                    <option value="in-progress">In progress</option>
                    <option value="done">Done</option>
                  </select>
                  <Input
                    aria-label="Filter by issue type"
                    className="lg:w-36"
                    onChange={(event) => setIssueType(event.target.value)}
                    placeholder="Issue type"
                    value={issueType}
                  />
                </>
              ) : null}
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-rows-[minmax(16rem,2fr)_minmax(20rem,3fr)] md:grid-cols-[minmax(18rem,2fr)_minmax(24rem,3fr)] md:grid-rows-1">
            <IssueList
              error={issues.error}
              isPending={issues.isPending}
              issues={issues.data?.issues ?? []}
              onSelect={(key) => updateSearch({ key })}
              selectedKey={selectedKey}
            />
            <IssueDetail
              detail={detail.data}
              environmentId={environmentId}
              error={detail.error}
              isPending={detail.isPending}
              key={selectedKey ?? "empty"}
              linkedThreads={linkedThreads}
              onChanged={() => {
                issues.refresh();
                detail.refresh();
              }}
              projects={environmentProjects}
              site={selectedSite}
              statusOptions={transitionStatusOptions}
            />
          </div>
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
      <div className="grid flex-1 place-items-center p-6 text-center">
        <div className="max-w-md space-y-2">
          <h2 className="font-semibold">Jira is not available on a connected environment</h2>
          <p className="text-sm text-muted-foreground">
            Update and reconnect the environment that should run Atlassian CLI.
          </p>
        </div>
      </div>
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
  onSelect,
}: {
  readonly issues: ReadonlyArray<JiraIssueSummary>;
  readonly selectedKey: string | null;
  readonly isPending: boolean;
  readonly error: string | null;
  readonly onSelect: (key: string) => void;
}) {
  return (
    <section className="min-h-0 overflow-y-auto border-b md:border-r md:border-b-0">
      {isPending && issues.length === 0 ? (
        <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
          <LoaderIcon className="size-4 animate-spin" /> Loading issues
        </div>
      ) : error ? (
        <p className="p-6 text-sm text-destructive">{error}</p>
      ) : issues.length === 0 ? (
        <p className="p-10 text-center text-sm text-muted-foreground">No issues match this view.</p>
      ) : (
        <div role="list">
          {issues.map((issue) => (
            <button
              className={cn(
                "flex w-full gap-3 border-b p-4 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                selectedKey === issue.key && "bg-muted/60",
              )}
              key={issue.key}
              onClick={() => onSelect(issue.key)}
              type="button"
            >
              <StatusIcon category={issue.status.category} className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{issue.key}</span>
                  <span className="truncate">{issue.projectName}</span>
                  <span className="ml-auto shrink-0">{relativeDate(issue.updatedAt)}</span>
                </span>
                <span className="mt-1 block text-sm font-medium">{issue.summary}</span>
                <span className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge size="sm" variant="secondary">
                    {issue.status.name}
                  </Badge>
                  <span className="truncate">{issue.assignee?.displayName ?? "Unassigned"}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
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

  if (isPending && detail === null) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <LoaderIcon className="size-4 animate-spin" /> Loading issue
      </div>
    );
  }
  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (detail === null || environmentId === null) {
    return <p className="p-10 text-center text-sm text-muted-foreground">Select an issue.</p>;
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
    const result = await transition({
      environmentId: targetEnvironmentId,
      input: { key: issue.key, status: nextStatus.trim() },
    });
    setIsTransitioning(false);
    if (result._tag === "Success") {
      setNextStatus("");
      onChanged();
      toastManager.add({ type: "success", title: `${issue.key} moved to ${nextStatus.trim()}` });
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
          <div className="mt-2 space-y-2">
            {linkedThreads.map((thread) => (
              <div
                className="flex items-start rounded-lg border hover:bg-muted/40"
                key={`${thread.environmentId}:${thread.id}`}
              >
                <button
                  className="flex min-w-0 flex-1 items-start gap-3 p-3 text-left"
                  onClick={() =>
                    void navigate({
                      to: "/$environmentId/$threadId",
                      params: { environmentId: thread.environmentId, threadId: thread.id },
                    })
                  }
                  type="button"
                >
                  <StatusIcon
                    category={thread.latestTurn?.state === "running" ? "in-progress" : "todo"}
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{thread.title}</span>
                    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{thread.latestTurn?.state === "running" ? "Running" : "Session"}</span>
                      {thread.branch ? <span>{thread.branch}</span> : null}
                      {thread.linkedPullRequest ? (
                        <span>PR #{thread.linkedPullRequest.number}</span>
                      ) : null}
                    </span>
                  </span>
                </button>
                <Button
                  aria-label={`Unlink ${thread.title} from ${issue.key}`}
                  className="m-2 shrink-0"
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
          <select
            aria-label="Destination Jira status"
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            onChange={(event) => setNextStatus(event.target.value)}
            value={nextStatus}
          >
            <option value="">Choose a status</option>
            {statusOptions.map((statusOption) => (
              <option key={statusOption} value={statusOption}>
                {statusOption}
              </option>
            ))}
          </select>
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
                <span>{relativeDate(entry.createdAt)}</span>
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
      return;
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
            <select
              aria-label="Project for Jira session"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) => setProjectId(event.target.value as ProjectId)}
              value={projectId}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
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

function StatusIcon({
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

function relativeDate(value: string | null): string {
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
