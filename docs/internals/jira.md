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
