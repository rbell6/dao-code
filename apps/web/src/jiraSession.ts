import type { JiraIssueDetail } from "@t3tools/contracts";

export function buildJiraStarterPrompt(
  issue: Pick<JiraIssueDetail, "key" | "summary" | "url" | "description">,
): string {
  const lines = [`Implement ${issue.key}: ${issue.summary}`, ""];
  if (issue.url) lines.push(`Jira: ${issue.url}`, "");
  lines.push(
    "Use this Jira ticket as the source of truth. Inspect the repository before making changes.",
  );
  if (issue.description.trim()) lines.push("", "Description:", issue.description.trim());
  return lines.join("\n");
}

export function normalizeJiraSite(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).host;
  } catch {
    return trimmed.replace(/^https?:\/\//, "").split("/")[0] ?? null;
  }
}
