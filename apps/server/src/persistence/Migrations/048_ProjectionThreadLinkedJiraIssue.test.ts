import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("048_ProjectionThreadLinkedJiraIssue", (it) => {
  it.effect("adds the nullable linked Jira issue JSON to thread projections", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 47 });
      yield* runMigrations({ toMigrationInclusive: 48 });

      const columns = yield* sql<{ readonly name: string; readonly notnull: number }>`
        PRAGMA table_info(projection_threads)
      `;
      const linkedJiraIssue = columns.find((column) => column.name === "linked_jira_issue_json");

      assert.equal(linkedJiraIssue?.name, "linked_jira_issue_json");
      assert.equal(linkedJiraIssue?.notnull, 0);
    }),
  );
});
