import type { JiraIssueSummary } from "@t3tools/contracts";

export function jiraIssueFacets(issues: ReadonlyArray<JiraIssueSummary>): {
  readonly projects: ReadonlyArray<{ readonly key: string; readonly name: string }>;
  readonly issueTypes: ReadonlyArray<string>;
} {
  const projects = new Map<string, string>();
  const issueTypes = new Map<string, string>();

  for (const issue of issues) {
    projects.set(issue.projectKey, issue.projectName);
    const normalizedType = issue.issueType.name.trim().toLocaleLowerCase();
    if (normalizedType && !issueTypes.has(normalizedType)) {
      issueTypes.set(normalizedType, issue.issueType.name.trim());
    }
  }

  return {
    projects: [...projects.entries()]
      .map(([key, name]) => ({ key, name }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    issueTypes: [...issueTypes.values()].sort((left, right) => left.localeCompare(right)),
  };
}
