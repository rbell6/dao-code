import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "./runtime.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";

export function createJiraEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const scheduler = createAtomCommandScheduler();
  const serialPerEnvironment = {
    mode: "serial",
    key: ({ environmentId }: { readonly environmentId: string }) => environmentId,
  } as const;
  return {
    connectionStatus: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:jira:connection-status",
      tag: WS_METHODS.jiraConnectionStatus,
      staleTimeMs: 30_000,
    }),
    list: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:jira:list",
      tag: WS_METHODS.jiraList,
      staleTimeMs: 30_000,
    }),
    detail: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:jira:detail",
      tag: WS_METHODS.jiraDetail,
      staleTimeMs: 15_000,
    }),
    comment: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:jira:comment",
      tag: WS_METHODS.jiraComment,
      scheduler,
      concurrency: serialPerEnvironment,
    }),
    transition: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:jira:transition",
      tag: WS_METHODS.jiraTransition,
      scheduler,
      concurrency: serialPerEnvironment,
    }),
  };
}
