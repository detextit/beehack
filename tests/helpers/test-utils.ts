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
  connect?: (...args: unknown[]) => Promise<unknown>;
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

  const mockQuery = async (...args: unknown[]) => {
    const call = toQueryCall(args);
    calls.push(call);

    const result = await handler(call);
    const rows = result.rows ?? [];

    return {
      rows,
      rowCount: result.rowCount ?? rows.length,
    };
  };

  const tracker = mock.method(pool, "query", mockQuery);

  // Also mock pool.connect() to return a fake client that uses the same handler.
  // This supports routes that use transactions (pool.connect() + client.query).
  const connectTracker = mock.method(
    pool as Required<QueryablePool>,
    "connect",
    async () => ({
      query: mockQuery,
      release: () => { },
    })
  );

  t.after(() => {
    tracker.mock.restore();
    connectTracker.mock.restore();
  });

  return calls;
}
