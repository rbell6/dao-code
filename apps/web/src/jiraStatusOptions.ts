import type { JiraIssueSummary } from "@t3tools/contracts";

export function jiraTransitionStatusOptions(
  issues: ReadonlyArray<JiraIssueSummary>,
  selectedIssue: Pick<JiraIssueSummary, "projectKey" | "status">,
): Array<string> {
  const currentStatus = selectedIssue.status.name.trim().toLocaleLowerCase();
  const options = new Map<string, string>();

  for (const issue of issues) {
    if (issue.projectKey !== selectedIssue.projectKey) continue;
    const name = issue.status.name.trim();
    const normalizedName = name.toLocaleLowerCase();
    if (!name || normalizedName === currentStatus || options.has(normalizedName)) continue;
    options.set(normalizedName, name);
  }

  return [...options.values()].sort((left, right) => left.localeCompare(right));
}
