/**
 * トマトオク ランキング連携 (Supabase)
 *
 * 設計方針:
 *   - 公開可能な anon key のみを使用(secret key は絶対に使わない)。
 *   - 依存ライブラリを入れず、Supabase の REST(/rest/v1/rpc/...)へ fetch する。
 *   - 設定が無い/通信失敗でも結果画面は必ず表示できるよう、例外を投げない。
 *   - スコア送信は1プレイにつき1回だけ(二重送信防止)。
 *
 * 想定する Supabase 側 RPC(詳細は docs/SUPABASE_SETUP.md):
 *   submit_score(p_game_slug text, p_player_name text, p_score int)
 *     -> { first_score int, best_score int, rank int }
 *   get_ranking(p_game_slug text, p_limit int)
 *     -> [{ player_name text, best_score int, first_score int, rank int }]
 *
 * 既存 chameleonjp ゲームの RPC 名/引数名が異なる場合は、
 * 下の CONFIG とこのファイル内のパラメータ名のみ合わせれば差し替え可能。
 */

// グローバル設定(index.html の window.TOMATOKU_CONFIG で上書き可能)
const DEFAULTS = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  gameSlug: "tomatoku",
  submitRpc: "submit_score",
  rankingRpc: "get_ranking",
  timeoutMs: 8000,
};

export const CONFIG = Object.assign(
  {},
  DEFAULTS,
  typeof window !== "undefined" && window.TOMATOKU_CONFIG
    ? window.TOMATOKU_CONFIG
    : {}
);

export function isConfigured() {
  return Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
}

// 二重送信防止: 1プレイにつき送信は1回。再呼び出しは同じ結果を返す。
let _submitPromise = null;
let _submitted = false;

/** 送信状態をリセット(新しいプレイ開始時に呼ぶ) */
export function resetSubmission() {
  _submitPromise = null;
  _submitted = false;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function rpc(name, body) {
  const url = `${CONFIG.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`;
  const res = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: CONFIG.supabaseAnonKey,
        Authorization: `Bearer ${CONFIG.supabaseAnonKey}`,
      },
      body: JSON.stringify(body),
    }),
    CONFIG.timeoutMs
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RPC ${name} failed: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * スコアを送信(1プレイ1回)。例外は投げず、状態オブジェクトを返す。
 * 返り値: {
 *   status: "ok" | "skipped" | "error",
 *   firstScore: number|null,
 *   bestScore: number|null,
 *   rank: number|null,
 *   message: string,
 * }
 */
export function submitScore({ playerName, score }) {
  if (_submitted && _submitPromise) {
    return _submitPromise; // 二重送信防止: 既存の結果を返す
  }
  _submitted = true;

  if (!isConfigured()) {
    _submitPromise = Promise.resolve({
      status: "skipped",
      firstScore: null,
      bestScore: null,
      rank: null,
      message: "ランキング未設定(ローカル表示のみ)",
    });
    return _submitPromise;
  }

  _submitPromise = (async () => {
    try {
      const data = await rpc(CONFIG.submitRpc, {
        p_game_slug: CONFIG.gameSlug,
        p_player_name: String(playerName || "").slice(0, 24),
        p_score: Math.max(0, Math.floor(score)),
      });
      // RPC は配列または単一オブジェクトを返し得るので吸収する
      const row = Array.isArray(data) ? data[0] : data;
      return {
        status: "ok",
        firstScore: row && row.first_score != null ? row.first_score : null,
        bestScore: row && row.best_score != null ? row.best_score : score,
        rank: row && row.rank != null ? row.rank : null,
        message: "ランキングに送信しました",
      };
    } catch (err) {
      // 失敗しても結果画面は表示する
      return {
        status: "error",
        firstScore: null,
        bestScore: null,
        rank: null,
        message: "ランキング送信に失敗しました(結果は表示されています)",
      };
    }
  })();

  return _submitPromise;
}

/**
 * ランキング上位を取得。失敗時は空配列を返す(例外は投げない)。
 * 返り値: [{ playerName, bestScore, firstScore, rank }]
 */
export async function fetchRanking(limit = 10) {
  if (!isConfigured()) return [];
  try {
    const data = await rpc(CONFIG.rankingRpc, {
      p_game_slug: CONFIG.gameSlug,
      p_limit: limit,
    });
    const rows = Array.isArray(data) ? data : [];
    return rows.map((row, i) => ({
      playerName: row.player_name != null ? row.player_name : "?",
      bestScore: row.best_score != null ? row.best_score : 0,
      firstScore: row.first_score != null ? row.first_score : null,
      rank: row.rank != null ? row.rank : i + 1,
    }));
  } catch (err) {
    return [];
  }
}
