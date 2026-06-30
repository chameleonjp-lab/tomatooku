# トマトオク Supabase セットアップ (SUPABASE_SETUP)

ランキングは Supabase で連携する。クライアントは **公開 anon key のみ** を使う。
**secret key(service_role key)は絶対にコードへ入れないこと。**

> 注意: chameleonjp-lab に既存ランキング基盤がある場合、本書は「トマトオク側で
> 想定する RPC インターフェース」を示すもの。既存の関数名・引数名・テーブルが
> 異なる場合は、本 SQL を流す代わりに `src/ranking.js` の `CONFIG`
> (`submitRpc` / `rankingRpc`、および `submitScore` / `fetchRanking` 内の
> `p_*` キー)を既存仕様に合わせること。ゲーム本体の改修は不要。

## 1. クライアント設定

`index.html` の `window.TOMATOKU_CONFIG` に公開値を設定:

```html
<script>
  window.TOMATOKU_CONFIG = {
    supabaseUrl: "https://xxxxxxxx.supabase.co",
    supabaseAnonKey: "eyJhbGciOi...(公開 anon key)",
    gameSlug: "tomatoku",
  };
</script>
```

未設定でもゲームは動作し、ランキングのみ「未設定」表示になる。

## 2. ゲーム登録メタデータ

| key | value |
| --- | --- |
| game_slug | `tomatoku` |
| title | トマトオク |
| top_ranking_type | best |
| score_order | desc |
| score_unit | pt |
| score_scale | 1 |
| score_decimals | 0 |
| score_label | スコア |
| first_score_label | 初回スコア |
| best_score_label | 最高スコア |

### 実験場(ゲーム一覧)への登録行

**重要:** `game_slug` は **`tomatoku`**(据え置き)、`game_url` は **`tomatooku`**
(リポジトリ改名後)で**混在する**。ここを取り違えるとランキングが別ゲーム扱いに
なるため、登録時は必ず下記のとおり固定すること。

```csv
game_slug,title,game_url,description,is_active,release_date,top_ranking_type,score_order,score_unit,score_scale,score_decimals,score_label,first_score_label,best_score_label
tomatoku,トマトオク,https://chameleonjp.codeberg.page/tomatooku/,5×5の畑に🍅を置く3ステージ・タイムパズル,true,2026-06-30,best,desc,pt,1,0,スコア,初回スコア,最高スコア
```

- 公開先が GitHub Pages の場合は `game_url` を
  `https://chameleonjp-lab.github.io/tomatooku/` に置き換える(`game_slug` は変えない)。
- `index.html` の `window.TOMATOKU_CONFIG.gameSlug` も **`tomatoku`** のまま
  (上の登録行と一致させる)。

## 3. スキーマ(新規に作る場合の参考 SQL)

既存基盤が無い場合、最小構成は以下。**初回スコア**と**最高スコア**を
プレイヤー単位で保持し、最高スコア降順でランキングする。

```sql
-- ゲームマスタ
create table if not exists public.games (
  slug text primary key,
  title text not null,
  top_ranking_type text not null default 'best',
  score_order text not null default 'desc',
  score_unit text not null default 'pt',
  score_scale int not null default 1,
  score_decimals int not null default 0,
  score_label text not null default 'スコア',
  first_score_label text not null default '初回スコア',
  best_score_label text not null default '最高スコア',
  created_at timestamptz not null default now()
);

insert into public.games (slug, title) values ('tomatoku', 'トマトオク')
on conflict (slug) do nothing;

-- プレイヤー別スコア(初回・最高を保持)
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  game_slug text not null references public.games(slug),
  player_name text not null,
  first_score int not null,
  best_score int not null,
  play_count int not null default 1,
  updated_at timestamptz not null default now(),
  unique (game_slug, player_name)
);

create index if not exists scores_rank_idx
  on public.scores (game_slug, best_score desc);
```

## 4. RPC: スコア送信 `submit_score`

初回は first/best とも登録、2回目以降は best を更新(高い方を保持)、first は据え置き。

```sql
create or replace function public.submit_score(
  p_game_slug text,
  p_player_name text,
  p_score int
) returns table (first_score int, best_score int, rank int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first int;
  v_best int;
begin
  -- 0〜180000(理論上の満点 BASE_SCORE)に必ず丸める。
  -- ブラウザから直接 RPC を叩かれてもありえない点数を登録させない。
  p_score := least(180000, greatest(0, coalesce(p_score, 0)));
  p_player_name := left(coalesce(p_player_name, ''), 24);

  insert into public.scores (game_slug, player_name, first_score, best_score, play_count)
  values (p_game_slug, p_player_name, p_score, p_score, 1)
  on conflict (game_slug, player_name) do update
    set best_score = greatest(public.scores.best_score, excluded.best_score),
        play_count = public.scores.play_count + 1,
        updated_at = now();

  select s.first_score, s.best_score into v_first, v_best
  from public.scores s
  where s.game_slug = p_game_slug and s.player_name = p_player_name;

  return query
  select v_first, v_best,
    (select count(*)::int + 1 from public.scores s2
       where s2.game_slug = p_game_slug and s2.best_score > v_best);
end;
$$;
```

### (任意・より安全)サーバー側で再計算する強化版

クライアントの `p_score` を信用せず、`elapsed_ms` / `mistake_count` / `hint_count`
を受け取ってサーバーで再計算すれば、点数の改ざんをさらに防げる。採用する場合は
RPC のシグネチャを変えるため、`src/ranking.js` の `submitScore` の送信 body にも
同じキー(`p_elapsed_ms` / `p_mistake_count` / `p_hint_count`)を追加すること。

```sql
create or replace function public.submit_score(
  p_game_slug text,
  p_player_name text,
  p_elapsed_ms bigint,
  p_mistake_count int,
  p_hint_count int
) returns table (first_score int, best_score int, rank int)
language plpgsql security definer set search_path = public
as $$
declare
  v_score int;
begin
  -- スコア式はクライアントと一致させる(BASE 180000 / 誤タップ3000 / ヒント30000)
  v_score := 180000
    - floor(greatest(0, coalesce(p_elapsed_ms, 0)))
    - greatest(0, coalesce(p_mistake_count, 0)) * 3000
    - greatest(0, coalesce(p_hint_count, 0)) * 30000;
  v_score := least(180000, greatest(0, v_score));
  -- 以降は基本版と同じ upsert / ランキング算出(p_score を v_score に置換)
  -- ...(基本版の本体を参照)...
end;
$$;
```

> 既存ランキング基盤が 3 引数版 `submit_score(p_game_slug, p_player_name, p_score)` で
> 固定なら、まずは基本版(0〜180000 clamp 済み)で運用すればよい。トマトオク側の
> クライアントは現状 3 引数版に合わせて送信し、`p_score` を 0〜180000 に丸めている。

## 5. RPC: ランキング取得 `get_ranking`

```sql
create or replace function public.get_ranking(
  p_game_slug text,
  p_limit int default 10
) returns table (player_name text, best_score int, first_score int, rank int)
language sql
stable
set search_path = public
as $$
  select s.player_name, s.best_score, s.first_score,
         (rank() over (order by s.best_score desc))::int as rank
  from public.scores s
  where s.game_slug = p_game_slug
  order by s.best_score desc
  limit greatest(1, coalesce(p_limit, 10));
$$;
```

## 6. 権限 / RLS

anon ロールから RPC のみ実行可能にする(テーブル直接書き込みは許可しない)。

```sql
alter table public.scores enable row level security;
alter table public.games  enable row level security;

-- ランキング表示用に読み取りのみ許可(任意。RPC 経由なら不要)
create policy "scores_read" on public.scores for select to anon using (true);
create policy "games_read"  on public.games  for select to anon using (true);

-- RPC 実行権限
grant execute on function public.submit_score(text, text, int) to anon;
grant execute on function public.get_ranking(text, int) to anon;
```

`security definer` 関数なので、anon は RPC を通じてのみ書き込み可能。
直接の INSERT/UPDATE は RLS で拒否される。

## 7. 動作確認(curl)

```bash
SUPA_URL=https://xxxx.supabase.co
ANON=eyJ...   # 公開 anon key

# 送信
curl -s "$SUPA_URL/rest/v1/rpc/submit_score" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" \
  -d '{"p_game_slug":"tomatoku","p_player_name":"テスト","p_score":123456}'

# 取得
curl -s "$SUPA_URL/rest/v1/rpc/get_ranking" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" \
  -d '{"p_game_slug":"tomatoku","p_limit":10}'
```
