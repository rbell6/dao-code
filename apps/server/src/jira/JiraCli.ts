import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import type { VcsError } from "@t3tools/contracts";

import * as ServerConfig from "../config.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";

const DEFAULT_TIMEOUT_MS = 30_000;

export class JiraCliError extends Schema.TaggedErrorClass<JiraCliError>()("JiraCliError", {
  operation: Schema.String,
  reason: Schema.Literals(["missing-tool", "unauthenticated", "failed"]),
  detail: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

export interface JiraCliOutput {
  readonly stdout: string;
  readonly stderr: string;
}

export class JiraCli extends Context.Service<
  JiraCli,
  {
    readonly execute: (
      operation: string,
      args: ReadonlyArray<string>,
      options?: { readonly timeoutMs?: number },
    ) => Effect.Effect<JiraCliOutput, JiraCliError>;
  }
>()("t3/jira/JiraCli") {}

function processFailure(operation: string, cause: VcsError): JiraCliError {
  return new JiraCliError({
    operation,
    reason: cause._tag === "VcsProcessSpawnError" ? "missing-tool" : "failed",
    detail:
      cause._tag === "VcsProcessSpawnError"
        ? "Atlassian CLI (`acli`) is not installed."
        : "Atlassian CLI could not complete the request.",
    cause,
  });
}

function commandFailure(operation: string, stdout: string, stderr: string): JiraCliError {
  const output = `${stdout}\n${stderr}`.toLowerCase();
  const reportedError = stderr
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    ?.replace(/^✗\s*/u, "")
    .slice(0, 500);
  const unauthenticated =
    output.includes("auth login") ||
    output.includes("not authenticated") ||
    output.includes("not logged in") ||
    output.includes("unauthorized") ||
    output.includes("authorize this app");
  return new JiraCliError({
    operation,
    reason: unauthenticated ? "unauthenticated" : "failed",
    detail: unauthenticated
      ? "Run `acli jira auth login --web` on this environment."
      : (reportedError ?? "Atlassian CLI could not complete the request."),
  });
}

export const make = Effect.gen(function* () {
  const process = yield* VcsProcess.VcsProcess;
  const config = yield* ServerConfig.ServerConfig;

  const execute: JiraCli["Service"]["execute"] = (operation, args, options) =>
    process
      .run({
        operation: `JiraCli.${operation}`,
        command: "acli",
        args,
        cwd: config.cwd,
        timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        allowNonZeroExit: true,
      })
      .pipe(
        Effect.mapError((cause) => processFailure(operation, cause)),
        Effect.flatMap((result) =>
          result.exitCode === 0
            ? Effect.succeed({ stdout: result.stdout, stderr: result.stderr })
            : Effect.fail(commandFailure(operation, result.stdout, result.stderr)),
        ),
      );

  return JiraCli.of({ execute });
});

export const layer = Layer.effect(JiraCli, make);
