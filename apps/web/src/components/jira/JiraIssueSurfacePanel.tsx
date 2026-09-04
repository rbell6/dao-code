import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo } from "react";

import { normalizeJiraSite } from "../../jiraSession";
import { jiraTransitionStatusOptions } from "../../jiraStatusOptions";
import { useProjects, useThreadShells } from "../../state/entities";
import { jiraEnvironment } from "../../state/jira";
import { useEnvironmentQuery } from "../../state/query";
import { JiraIssueDetailView } from "./JiraIssueDetailView";

/**
 * Self-contained issue detail for a "jira" right-panel surface beside a
 * thread. Unlike the Jira workspace, there is no issue list in scope here, so
 * transition options come from a project-scoped list fetched on demand.
 */
export function JiraIssueSurfacePanel({
  environmentId,
  issueKey,
}: {
  readonly environmentId: EnvironmentId;
  readonly issueKey: string;
}) {
  const connection = useEnvironmentQuery(
    jiraEnvironment.connectionStatus({ environmentId, input: {} }),
  );
  const detail = useEnvironmentQuery(
    jiraEnvironment.detail({ environmentId, input: { key: issueKey } }),
  );
  const projectKey = detail.data?.projectKey ?? null;
  const siblingIssues = useEnvironmentQuery(
    projectKey === null
      ? null
      : jiraEnvironment.list({
          environmentId,
          input: { view: "all", projectKeys: [projectKey], limit: 50 },
        }),
  );
  const site = normalizeJiraSite(connection.data?.site ?? detail.data?.url ?? null);
  const projects = useProjects();
  const threadShells = useThreadShells();
  const environmentProjects = useMemo(
    () => projects.filter((candidate) => candidate.environmentId === environmentId),
    [environmentId, projects],
  );
  const linkedThreads = useMemo(
    () =>
      site === null
        ? []
        : threadShells.filter(
            (thread) =>
              thread.environmentId === environmentId &&
              thread.linkedJiraIssue?.site.toLowerCase() === site.toLowerCase() &&
              thread.linkedJiraIssue.key.toLowerCase() === issueKey.toLowerCase(),
          ),
    [environmentId, issueKey, site, threadShells],
  );
  const statusOptions = useMemo(
    () =>
      detail.data === null
        ? []
        : jiraTransitionStatusOptions(siblingIssues.data?.issues ?? [], detail.data),
    [detail.data, siblingIssues.data?.issues],
  );

  return (
    <JiraIssueDetailView
      detail={detail.data}
      environmentId={environmentId}
      error={detail.error}
      isPending={detail.isPending}
      key={`${environmentId}:${issueKey}`}
      linkedThreads={linkedThreads}
      onChanged={() => {
        detail.refresh();
        siblingIssues.refresh();
      }}
      projects={environmentProjects}
      site={site}
      statusOptions={statusOptions}
    />
  );
}
