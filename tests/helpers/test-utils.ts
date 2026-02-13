import { mock, type TestContext } from "node:test";

process.env.DATABASE_URL ??=
  "postgres://beehack:beehack@localhost:5432/beehack_test";

export type QueryCall = {
  sql: string;
  params: unknown[];
};

type QueryResult = {
  rows?: unknown[];
  rowCount?: number;
};

type QueryHandler = (call: QueryCall) => QueryResult | Promise<QueryResult>;

type QueryablePool = {
  query: (...args: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function toQueryCall(args: unknown[]): QueryCall {
  const first = args[0] as
    | string
    | {
        text?: unknown;
        values?: unknown;
      }
    | undefined;

  const sql =
    typeof first === "string"
      ? first
      : typeof first?.text === "string"
        ? first.text
        : "";

  const paramsFromArg =
    args.length > 1 && Array.isArray(args[1]) ? (args[1] as unknown[]) : null;
  const paramsFromConfig =
    first && typeof first === "object" && Array.isArray(first.values)
      ? first.values
      : null;

  return {
    sql,
    params: paramsFromArg ?? paramsFromConfig ?? [],
  };
}

export async function loadDefaultModuleFrom<T>(
  metaUrl: string,
  relativePath: string
): Promise<T> {
  const moduleUrl = new URL(relativePath, metaUrl).href;
  const mod = (await import(moduleUrl)) as { default?: T };
  return (mod.default ?? (mod as unknown as T)) as T;
}

export async function loadPool(metaUrl: string): Promise<QueryablePool> {
  const db = await loadDefaultModuleFrom<{ pool: QueryablePool }>(
    metaUrl,
    "../../lib/db.ts"
  );
  return db.pool;
}

export function installQueryMock(
  t: TestContext,
  pool: QueryablePool,
  handler: QueryHandler
) {
  const calls: QueryCall[] = [];

  const tracker = mock.method(pool, "query", async (...args: unknown[]) => {
    const call = toQueryCall(args);
    calls.push(call);

    const result = await handler(call);
    const rows = result.rows ?? [];

    return {
      rows,
      rowCount: result.rowCount ?? rows.length,
    };
  });

  t.after(() => {
    tracker.mock.restore();
  });

  return calls;
}
