import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
const blockNetwork = () => { throw new Error("network forbidden in ranking tests"); };
globalThis.fetch = blockNetwork;
for (const transport of [http, https]) { transport.request = blockNetwork; transport.get = blockNetwork; }
net.connect = net.createConnection = tls.connect = blockNetwork;
const {
  createRankingClient,
  isConfigured,
  isRankingEnabled,
  isSubmissionEnabled,
  normalizeDisplayName,
} = await import("../src/ranking.js");

const CONFIG = {
  supabaseUrl: "https://ranking.invalid",
  supabasePublishableKey: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
  gameSlug: "tomatoku_competition_v1",
  clientVersion: "tomatooku-test",
  timeoutMs: 20,
  competitionFunction: "tomatoku-competition",
  bestRankingRpc: "get_best_score_ranking",
  firstRankingRpc: "get_first_try_ranking",
  rankingsEnabled: true,
  submissionsEnabled: true,
};
const TRANSCRIPT = Array.from({ length: 15 }, (_, index) => ({
  type: "tap",
  stageIndex: Math.floor(index / 5),
  row: index % 5,
  col: index % 5,
  atMs: (index + 1) * 100,
}));

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return data;
    },
  };
}

const ACK = { accepted: true, score: 4835, under_review: false,
  result_first_score: 5000, result_best_score: 4800, result_play_count: 2,
  is_first_play: false, is_new_best: true };
const ARGS = { playId: "receipt", mode: "official", runToken: "frozen-run",
  transcript: TRANSCRIPT, elapsedMs: 1500 };
let pass = 0;
async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

await test("設定判定と送信ゲートを区別", () => {
  assert.equal(isConfigured(CONFIG), true);
  assert.equal(isRankingEnabled(CONFIG), true);
  assert.equal(isSubmissionEnabled(CONFIG), true);
  assert.equal(isRankingEnabled({ ...CONFIG, rankingsEnabled: false }), false);
  assert.equal(
    isSubmissionEnabled({ ...CONFIG, rankingsEnabled: false }),
    false
  );
  assert.equal(isSubmissionEnabled({ ...CONFIG, submissionsEnabled: false }), false);
  assert.equal(isConfigured({ ...CONFIG, supabaseUrl: "" }), false);
});

await test("表示名をNFKC正規化し20文字以内にする", () => {
  assert.equal(normalizeDisplayName("  Ｔｅｓｔ\u0000   太郎  "), "Test 太郎");
  assert.equal(normalizeDisplayName("123456789012345678901234").length, 20);
});

await test("練習モードは通信しない", async () => {
  let calls = 0;
  const client = createRankingClient(CONFIG, {
    fetch: async () => {
      calls++;
      return jsonResponse([]);
    },
  });
  const result = await client.submitScore({
    playId: "p1",
    mode: "practice",
    runToken: "unused",
    transcript: TRANSCRIPT,
    elapsedMs: 1500,
  });
  assert.equal(result.status, "skipped");
  assert.equal(calls, 0);
});

await test("送信ゲートOFFの公式は通信しない", async () => {
  let calls = 0;
  const client = createRankingClient(
    { ...CONFIG, submissionsEnabled: false },
    {
      fetch: async () => {
        calls++;
        return jsonResponse([]);
      },
    }
  );
  const result = await client.submitScore({
    playId: "p2",
    mode: "official",
    runToken: "run-2",
    transcript: TRANSCRIPT,
    elapsedMs: 1500,
  });
  assert.equal(result.status, "skipped");
  assert.equal(calls, 0);
});

await test("ランキング停止中は取得も通信しない", async () => {
  let calls = 0;
  const client = createRankingClient(
    { ...CONFIG, rankingsEnabled: false, submissionsEnabled: false },
    {
      fetch: async () => {
        calls++;
        return jsonResponse([]);
      },
    }
  );
  const result = await client.fetchBestRanking(10);
  assert.equal(result.status, "disabled");
  assert.equal(calls, 0);
});

await test("公式の準備・開始は検証用Edge Functionとapikeyだけを使う", async () => {
  const requests = [];
  const client = createRankingClient(CONFIG, {
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, options, body });
      if (body.action === "prepare") {
        return jsonResponse({
          accepted: true,
          runToken: "server-run",
        });
      }
      return jsonResponse({
        accepted: true,
        stageIds: ["STG-0001", "STG-0029", "STG-0057"],
      });
    },
  });
  const prepared = await client.prepareOfficialRun({ playerName: "  テスト  " });
  assert.equal(prepared.status, "ok");
  assert.deepEqual(prepared.stageIds, []);
  assert.deepEqual(
    await client.beginOfficialRun({ runToken: prepared.runToken }),
    {
      status: "ok",
      stageIds: ["STG-0001", "STG-0029", "STG-0057"],
    }
  );
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => /functions\/v1\/tomatoku-competition$/.test(request.url)));
  assert.ok(requests.every((request) => request.options.headers.apikey === CONFIG.supabasePublishableKey));
  assert.ok(requests.every((request) => !("Authorization" in request.options.headers)));
  assert.deepEqual(requests[0].body, {
    action: "prepare",
    clientVersion: "tomatooku-test",
    playerName: "テスト",
  });
  assert.deepEqual(requests[1].body, {
    action: "begin",
    clientVersion: "tomatooku-test",
    runToken: "server-run",
  });
});

await test("公式送信はスコアを自己申告せず操作記録だけを送る", async () => {
  let request;
  const client = createRankingClient(CONFIG, {
    fetch: async (url, options) => {
      request = { url, options };
      return jsonResponse({
        accepted: true,
        under_review: false,
        score: 4835,
        result_first_score: 5000,
        result_best_score: 4800,
        result_play_count: 2,
        is_first_play: false,
        is_new_best: true,
      });
    },
  });
  const result = await client.submitScore({
    playId: "play-1",
    mode: "official",
    runToken: "server-run",
    transcript: TRANSCRIPT,
    elapsedMs: 1835.9,
  });
  assert.match(request.url, /functions\/v1\/tomatoku-competition$/);
  assert.equal(request.options.headers.apikey, CONFIG.supabasePublishableKey);
  assert.equal("Authorization" in request.options.headers, false);
  assert.deepEqual(JSON.parse(request.options.body), {
    action: "finish",
    clientVersion: "tomatooku-test",
    runToken: "server-run",
    transcript: TRANSCRIPT,
    elapsedMs: 1835,
  });
  assert.equal("score" in JSON.parse(request.options.body), false);
  assert.equal(result.status, "ok");
  assert.equal(result.bestScore, 4800);
});

await test("同じplayIdは同一Promise・通信1回", async () => {
  let calls = 0;
  const client = createRankingClient(CONFIG, {
    fetch: async () => {
      calls++;
      return jsonResponse(ACK);
    },
  });
  const args = {
    playId: "same",
    mode: "official",
    runToken: "same-run",
    transcript: TRANSCRIPT,
    elapsedMs: 1000,
  };
  const first = client.submitScore(args);
  const second = client.submitScore(args);
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.equal(calls, 1);
});

await test("ベストランキングを正規化", async () => {
  let body;
  const client = createRankingClient(CONFIG, {
    fetch: async (_url, options) => {
      body = JSON.parse(options.body);
      return jsonResponse([
        {
          rank_no: 1,
          display_name: "A",
          first_score: 6000,
          best_score: 5000,
          play_count: 3,
        },
      ]);
    },
  });
  const result = await client.fetchBestRanking(3);
  assert.deepEqual(body, { p_game_slug: "tomatoku_competition_v1", p_limit: 3 });
  assert.equal(result.status, "ok");
  assert.equal(result.rows[0].bestScore, 5000);
});

await test("初回ランキングは専用RPC", async () => {
  let url;
  const client = createRankingClient(CONFIG, {
    fetch: async (value) => {
      url = value;
      return jsonResponse([]);
    },
  });
  const result = await client.fetchFirstRanking(10);
  assert.match(url, /get_first_try_ranking$/);
  assert.equal(result.status, "empty");
});

await test("未設定・HTTPエラー・形式不正を状態で返す", async () => {
  const unconfigured = createRankingClient({ ...CONFIG, supabaseUrl: "" });
  assert.equal((await unconfigured.fetchBestRanking()).status, "not_configured");

  const httpError = createRankingClient(CONFIG, {
    fetch: async () => jsonResponse({}, 500),
  });
  assert.equal((await httpError.fetchBestRanking()).status, "error");

  const malformed = createRankingClient(CONFIG, {
    fetch: async () => jsonResponse({ rows: [] }),
  });
  assert.equal((await malformed.fetchBestRanking()).status, "error");
});

await test("タイムアウト時はAbortControllerで中止", async () => {
  let aborted = false;
  const client = createRankingClient(
    { ...CONFIG, timeoutMs: 5 },
    {
      fetch: async (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            aborted = true;
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    }
  );
  assert.equal((await client.fetchBestRanking()).status, "error");
  assert.equal(aborted, true);
});

await test("incomplete / malformed Edge receipts never succeed", async () => {
  const invalid = [{ accepted: true }, [], null];
  for (const key of Object.keys(ACK)) { const row = { ...ACK }; delete row[key]; invalid.push(row); }
  for (const [key, values] of Object.entries({
    score: [null, "4835", -1, 2147483648, NaN, 1.5],
    result_first_score: [null, "0", 2147483648, -2147483649],
    result_best_score: [null, 2147483648, -2147483649, 4836],
    result_play_count: [null, "2", 0, 2147483648],
    under_review: [null, "false"], is_first_play: [null, 1], is_new_best: [null, "true"],
  })) for (const value of values) invalid.push({ ...ACK, [key]: value });
  invalid.push({ ...ACK, under_review: true });
  for (const receipt of invalid) {
    const client = createRankingClient(CONFIG, { fetch: async () => jsonResponse(receipt) });
    assert.equal((await client.submitScore(ARGS)).status, "error", JSON.stringify(receipt));
  }
});
await test("review-pending null aggregates and signed historical first remain legal", async () => {
  for (const receipt of [
    { ...ACK, under_review: true, result_first_score: null, result_best_score: null,
      result_play_count: null, is_first_play: false, is_new_best: false },
    { ...ACK, result_first_score: 0 },
    { ...ACK, result_first_score: -2147483648, result_play_count: 2147483647 },
  ]) {
    const client = createRankingClient(CONFIG, { fetch: async () => jsonResponse(receipt) });
    assert.equal((await client.submitScore(ARGS)).status, "ok");
  }
});
await test("failed finish retries only identical snapshot, coalesces in-flight and caches success", async () => {
  for (const failure of ["network", "http", "malformed"]) {
    const bodies = []; let release;
    const client = createRankingClient(CONFIG, { fetch: async (_url, options) => {
      bodies.push(options.body);
      if (bodies.length === 1) {
        if (failure === "network") throw new Error("offline");
        return jsonResponse(failure === "malformed" ? { accepted: true } : {}, failure === "http" ? 500 : 200);
      }
      await new Promise(resolve => { release = resolve; });
      return jsonResponse(ACK);
    }});
    const args = { ...ARGS, transcript: TRANSCRIPT.map(action => ({ ...action })) };
    assert.equal((await client.submitScore(args)).status, "error");
    for (const changed of [{ runToken: "other-run" }, { elapsedMs: 1501 },
      { transcript: TRANSCRIPT.map((a, i) => i === 0 ? { ...a, row: 4 } : a) }]) {
      assert.equal((await client.submitScore({ ...args, ...changed })).status, "error");
    }
    assert.equal(bodies.length, 1);
    const retry = client.submitScore(args);
    assert.equal(client.submitScore(args), retry);
    args.transcript[0].row = 4; // mutation after send must not alter the frozen payload
    assert.equal(bodies.length, 2, "failed attempt must perform a new request");
    release();
    assert.equal((await retry).status, "ok");
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0], bodies[1]);
    assert.equal(client.submitScore(ARGS), retry);
    assert.equal(bodies.length, 2);
  }
});

console.log(`\n==== RANKING TEST RESULT: PASS=${pass} FAIL=0 ====`);
