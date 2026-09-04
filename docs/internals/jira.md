# Jira integration

Jira is an environment capability backed by Atlassian CLI (`acli`). The client never invokes ACLI
or stores Atlassian credentials. It calls typed RPC operations on the connected environment, which
runs ACLI with that environment's active Jira Cloud account and site.

The boundary has four layers:

1. `packages/contracts/src/jira.ts` defines normalized issue models, bounded inputs, and typed
   errors. The RPC group exposes connection status, list, detail, comment, and transition methods.
2. `apps/server/src/jira/JiraCli.ts` owns process execution and maps missing-tool, authentication,
   and command failures. `JiraService.ts` owns JQL construction and the supported operations.
3. `apps/server/src/jira/jiraJson.ts` translates ACLI's Jira REST-shaped JSON into the stable T3
   model. ACLI response shapes do not cross the WebSocket.
4. `packages/client-runtime/src/state/jira.ts` provides environment-scoped query and command atoms;
   the web workspace renders those atoms.

The durable issue relationship belongs to orchestration rather than the Jira adapter. A thread
stores a `linkedJiraIssue` reference containing the site, issue key, and browser URL. Thread create
and metadata-update events carry that reference, and the thread projection persists it as JSON.
Draft threads carry the same reference until the atomic first-turn bootstrap creates the server
thread. This attaches the issue to the durable thread, not to a provider session that may restart.

The web client derives the reverse issue-to-threads view from environment thread shells already in
memory. It does not start an ACLI process per thread row. Creating a pull request passes a small
list of work references to the source-control writer; the writer adds the primary key to the title
and missing links to the description without calling Jira.

The Jira workspace reuses the shared right-panel store and tab shell. Each surface carries its
environment id and issue key, which keeps tabs unambiguous across connected environments. The
workspace uses a fixed sentinel panel reference and excludes it from persistence, matching the
Pull Requests workspace: tab state survives navigation during the session but a restart opens a
fresh list.

The same `jira` surface kind opens beside a thread with a linked ticket, offered in the surface
picker and from the header's ticket chip. The issue detail view is shared: the workspace feeds it
from its loaded list, while the thread panel (`JiraIssueSurfacePanel`) is self-contained and derives
transition options from a project-scoped list fetched on demand.

This keeps Jira behavior remote-ready: the CLI and credentials live with the server, while web and
desktop clients use the same authenticated WebSocket from any connection mode. The capability is
optional so newer clients can remain connected to older servers without issuing unsupported RPCs.

ACLI is an adapter choice, not the domain interface. A future Jira Data Center or direct REST
adapter should implement the same normalized service instead of exposing transport-specific fields
to the contracts or UI.

## Scope and safety

- List requests fetch at most 100 issues; the workspace currently requests 50.
- Basic search values are escaped before being placed in JQL. Explicit JQL is intentionally passed
  through and is limited to 2,000 characters by the RPC schema.
- Read methods require the environment read scope. Comment and transition methods require the
  operate scope.
- Mutations are serialized per environment in the shared client runtime.
- The first release supports Jira Cloud and one ACLI-selected site per environment.
