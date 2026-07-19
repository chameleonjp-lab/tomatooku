# トマトオク 生成器v2 基盤契約

- 対象: 実装計画 第6回「生成器 v2」Slice 1
- generator version: `2.0.0-foundation.1`
- manifest schema: `1`
- 既定seed: `tomatooku-generator-v2-foundation`

## 1. 目的

生成器v2の後続実装で、領域成長、一意解検証、難易度判定、84問以上の新バンクを安全に追加するため、先に変化させない基礎契約を固定する。

このSliceでは現行の`src/stages.js`、公式3問、ランダム練習の選出先を変更しない。

## 2. 正解配置の表現

5×5盤面で、各行に1個、各列に1個の🍅を置く配置を次の列配列で表現する。

```text
columns[row] = col
```

例:

```text
[0, 2, 4, 1, 3]
```

これは次の5座標を表す。

```text
[[0,0], [1,2], [2,4], [3,1], [4,3]]
```

隣り合う行の列差は必ず2以上とし、上下左右・斜めの隣接禁止を満たす。

## 3. 14種類の完全列挙

5列の順列を全探索し、次を満たす配置だけを採用する。

1. 各列を1回だけ使用
2. 隣接行の列差が2以上

結果は14種類である。単体テストは14件の署名をfixtureとして完全一致で固定する。

```text
0,2,4,1,3
0,3,1,4,2
1,3,0,2,4
1,3,0,4,2
1,4,2,0,3
2,0,3,1,4
2,0,4,1,3
2,4,0,3,1
2,4,1,3,0
3,0,2,4,1
3,1,4,0,2
3,1,4,2,0
4,1,3,0,2
4,2,0,3,1
```

## 4. 対称変換

正方形のD4対称群に相当する8変換を扱う。

- 恒等変換
- 90度回転
- 180度回転
- 270度回転
- 左右反転
- 上下反転
- 主対角線反転
- 反対角線反転

各変換後の列署名を辞書順で比較し、最小の署名を`canonicalSignature`とする。

14配置は次の3対称クラスへ集約される。

```text
class size: 8
class size: 4
class size: 2
```

対称形を後続の盤面選抜で同一系統として扱えるようにするが、14配置そのものは失わない。

## 5. ID契約

### patternId

個別の列署名から生成する。

```text
SP-xxxxxxxx
```

- 14配置で一意
- seedや列挙順に依存しない
- 同じ配置は常に同じID

### symmetryClassId

`canonicalSignature`から生成する。

```text
SC-xxxxxxxx
```

- 対称関係にある配置は同じID
- 14配置全体で3種類

ハッシュは32bit FNV-1aを使用し、名前空間文字列を含める。

注意: 実装計画にある「盤面内容からの安定ステージID」は、領域配置が存在する後続Sliceで別途実装する。このSliceのIDは正解配置と対称クラスのIDである。

## 6. seed契約

seedは文字列、整数、bigintを受け付け、32bit整数へ正規化する。

- 同じseedは同じ乱数系列
- 同じseedは同じmanifest順序
- 別seedは配置順を変えられる
- seedが変わっても`patternId`と`symmetryClassId`は変わらない
- 入力配列をshuffleで破壊しない

乱数生成はMulberry32、shuffleはFisher–Yatesを使用する。

## 7. manifest

既定seedの出力を次へ保存する。

```text
generated/solution-patterns-v2.json
```

manifestには次を含む。

- schema version
- generator version
- 元seed
- 正規化seed
- 盤面サイズ
- 配置数
- 対称クラス数
- seed順序
- pattern ID
- symmetry class ID
- 署名
- canonical署名
- orbit size
- columns
- cells

生成物に日時は含めない。同じコードとseedからバイト単位で同じ意味のJSONを再生成できるようにする。

## 8. コマンド

既定seedと既定出力先:

```bash
npm run gen:v2
```

seed指定:

```bash
node scripts/generate_stages_v2.js --seed example-seed
```

標準出力:

```bash
node scripts/generate_stages_v2.js --seed example-seed --stdout
```

出力先指定:

```bash
node scripts/generate_stages_v2.js --out ./tmp/manifest.json
```

テスト:

```bash
npm run test:generator-v2
```

## 9. 自動テスト

次を固定する。

1. 有効配置が14件
2. 14署名の完全一致
3. 全8変換が有効配置を維持
4. canonical化の冪等性
5. 対称クラス分布が8・4・2
6. pattern IDが14件で一意
7. symmetry class IDが3件
8. ID fixture
9. seed乱数の再現性
10. shuffleの非破壊性
11. 同一seed manifestの完全一致
12. 別seedでもID集合が不変
13. commit済みmanifestと再生成結果の一致
14. 不正配置・不正seedの拒否

## 10. このSliceで変更しないもの

- `src/stages.js`
- 公式ステージ`T001 / T011 / T021`
- 現行30問バンク
- ランダム練習の選出先
- スコア式
- ランキング
- Supabase
- UI

## 11. 後続Slice

### Slice 2: 領域生成・独立検証

- 正解5マスを別エリアの種にする
- 4近傍で各エリアを5マスへ成長
- エリア連結検証
- 一意解の全探索
- 盤面内容ベースの安定ステージID
- 対称盤面重複除外
- 生成試行上限

### Slice 3: 難易度・84問バンク

- 人間向け解法指標
- 14配置の分布制御
- 最低84問
- 現行バンクとの切替
- 公式問題へは自動採用しない
