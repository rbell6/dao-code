# Jira

The Jira workspace keeps Jira Cloud issues beside your coding threads. Open **Jira** from the
sidebar to search work, run JQL, inspect an issue, add a comment, or move it to another status.

## Set up Jira

Jira commands run on the machine hosting your T3 Code environment. Install Atlassian CLI there by
following the [ACLI installation guide](https://developer.atlassian.com/cloud/acli/guides/install-acli/),
then sign in:

```bash
acli jira auth login --web
```

Reconnect the environment after installing the CLI. The Jira workspace reports whether ACLI is
missing, signed out, or ready, and shows the active Jira Cloud site when ACLI provides it.

Open **Settings → Integrations → Jira** to inspect each environment's CLI status, active site,
account, and authentication type. The settings row can refresh the status, open the Jira workspace,
or provide the appropriate setup action when ACLI is missing or signed out.

## Find work

The default **My work** view includes issues you are assigned, reported, or watching. Use the other
views to narrow that relationship, search by issue key or text, and filter by project, status
category, or issue type.

Select **Search** to switch the input to **JQL**. JQL is sent as written, so it can express saved
queries that the standard controls cannot. Results are limited to 50 issues and sorted by recent
updates unless the JQL supplies its own order.

## Current limits

- Jira Cloud is supported through Atlassian CLI. Jira Data Center is not yet supported.
- Each T3 Code environment uses the account and active site selected in ACLI on that environment.
- The Jira workspace is available in the web app and desktop app. Mobile does not yet have a Jira
  workspace.
- Status changes use the destination status name. Jira validates whether that transition is
  available for the selected issue.
