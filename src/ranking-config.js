/**
 * ブラウザ公開可能なランキング設定。
 * Publishable key は公開クライアント用。secret / service_role key は置かない。
 */
export const RANKING_CONFIG = Object.freeze({
  supabaseUrl: "https://mlpnjgezrnhdxsxolyzj.supabase.co",
  supabasePublishableKey: "sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM",
  gameSlug: "tomatoku",
  clientVersion: "tomatooku-web-2.2.0-ranking-live-v1",
  timeoutMs: 8000,
  submitRpc: "submit_score",
  bestRankingRpc: "get_best_score_ranking",
  firstRankingRpc: "get_first_try_ranking",
  // public.games登録・初回/ベストRPC疎通・テストデータ削除を確認済み。
  submissionsEnabled: true,
});
