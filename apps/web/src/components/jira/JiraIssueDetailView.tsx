import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  type EnvironmentId,
  type JiraIssueDetail,
  type ProjectId,
  type ThreadLinkedJiraIssue,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  LoaderIcon,
  MessageSquareIcon,
  PlayIcon,
  UnlinkIcon,
} from "lucide-react";
import { useState } from "react";

import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { buildJiraStarterPrompt } from "../../jiraSession";
import { jiraEnvironment } from "../../state/jira";
import type { useProjects, useThreadShells } from "../../state/entities";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { formatJiraRelativeDate, JiraStatusIcon } from "./JiraIssuePresentation";
import { JiraIssueDetailGhost, JiraUnavailableState } from "./JiraWorkspaceStates";

const CHOOSE_STATUS_VALUE = "__choose_status__";

/**
 * Full issue detail with its actions (start session, transition, comment,
 * unlink). Rendered beside the Jira workspace list and, via
 * JiraIssueSurfacePanel, in a thread's right panel.
 */
export function JiraIssueDetailView({
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
            No Dao sessions are linked to this ticket.
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
            Choose the project Dao should work in. You can review the prompt before sending it.
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
