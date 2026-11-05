import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { setupTestDb } from "./helpers/db.ts";
import * as opsRoute from "../app/api/ops/e273f28d52523a8d/route.ts";
import { setDbForTesting } from "../db/index.ts";

const TOKEN = "t".repeat(48);
let testDb: Awaited<ReturnType<typeof setupTestDb>>;
before(async () => {
  testDb = await setupTestDb();
  process.env.OPS_MONITOR_TOKEN = TOKEN;
});
after(async () => {
  delete process.env.OPS_MONITOR_TOKEN;
  await testDb.close();
});

function call(headers: Record<string, string> = {}) {
  return opsRoute.GET(new Request("http://localhost/api/ops/x", { headers }));
}

describe("provozní endpoint pro monitoring", () => {
  test("bez tokenu / se špatným tokenem / token v URL: 404 a DB se nekontroluje", async () => {
    let touched = false;
    setDbForTesting(new Proxy({}, { get: () => { touched = true; throw new Error("DB"); } }) as never);
    for (const headers of [{}, { authorization: "Bearer spatny" }, { authorization: TOKEN }, { authorization: `Basic ${TOKEN}` }]) {
      const response = await call(headers);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    }
    const inUrl = await opsRoute.GET(new Request(`http://localhost/api/ops/x?token=${TOKEN}`));
    assert.equal(inUrl.status, 404);
    assert.equal(touched, false);
    setDbForTesting(testDb.db as never);
  });

  test("bez nastaveného tokenu na serveru je zavřeno (404)", async () => {
    delete process.env.OPS_MONITOR_TOKEN;
    assert.equal((await call({ authorization: "Bearer " })).status, 404);
    process.env.OPS_MONITOR_TOKEN = TOKEN;
  });

  test("s tokenem a dostupnou DB: 200 {status: ok}, necachuje se", async () => {
    const response = await call({ authorization: `Bearer ${TOKEN}` });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  });

  test("s tokenem a nefunkční DB: 503 bez podrobností chyby", async () => {
    setDbForTesting({ execute: () => Promise.reject(new Error("connection refused: tajny-host:5432")) } as never);
    const response = await call({ authorization: `Bearer ${TOKEN}` });
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.equal(text, JSON.stringify({ status: "error" }));
    setDbForTesting(testDb.db as never);
  });

  test("s tokenem a zaseklou DB: 503 po timeoutu", async () => {
    setDbForTesting({ execute: () => new Promise(() => {}) } as never);
    const started = Date.now();
    const response = await call({ authorization: `Bearer ${TOKEN}` });
    assert.equal(response.status, 503);
    assert.ok(Date.now() - started < 5000);
    setDbForTesting(testDb.db as never);
  });
});
