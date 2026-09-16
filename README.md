# AI matomechatter

AI に関するニュースを、日本語の記事を中心に自動で集めてまとめる静的サイトです。
複数の媒体が同じ話題を報じたものは「いま話題になっていること」としてグループ化し、
残りは日付ごとの一覧で追えるようにしています。

- 掲載するのは **見出し・要約の一部・元記事へのリンク** のみ（本文の転載はしない）
- 収集も公開も GitHub Actions で実行（30 分おき。後述のとおり実際にはもう少し間隔が空きます）
- 依存パッケージなしの Node 20 スクリプトで収集し、`docs/` を配信する
- **お気に入り（★）**、**いま読むならこれ**（未読を優先したランダム表示）、
  **前回からの新着本数と次の更新までの目安**、新着記事の **NEW** 表示

## 使い方

```bash
npm install          # esbuild / sharp（ビルド用のみ）
npm run collect      # 記事を収集して docs/data/news.json を更新
npm run build        # site/ を最小化して docs/ に出力
npm start            # ビルドしてローカルサーバー（http://localhost:3220）
```

## 構成

| パス | 役割 |
| --- | --- |
| `config.json` | 収集元フィード・Google ニュース検索語・AI 判定語・カテゴリ・話題まとめの設定 |
| `scripts/collect.mjs` | 収集 → 絞り込み → 重複除去 → 話題まとめ → `docs/data/news.json` 出力 |
| `scripts/lib/sources.mjs` | RSS/Atom/RDF と Google ニュース検索の取得 |
| `scripts/lib/cluster.mjs` | 固有名詞辞書と語の重なりで同じ話題をまとめる（外部 AI API は使わない） |
| `scripts/build.mjs` | JS/CSS の minify、HTML の圧縮、画像の縮小 |
| `data/state.json` | 前回の収集に載っていた記事の ID。**新着の判定に使うのでコミットする** |
| `site/` | 編集するソース。`docs/` は生成物なので直接触らない |
| `docs/` | 公開ディレクトリ（FTP でアップロードされる） |

## 収集のしくみ

1. `config.json` の RSS フィードと Google ニュース検索（`hl=ja&gl=JP`）から記事を取得する
2. 見出しに日本語が含まれないもの、AI と関係のないもの、古いものを落とす
3. 見出しを正規化したキーで重複を除く（元フィードの直リンクを Google 経由より優先）
4. 固有名詞辞書 + 語の重なりで近い記事をまとめ、2 媒体以上のものを「話題」にする
5. `docs/data/news.json` に書き出し、フロントはこの 1 ファイルだけを読む

調整したいときは `config.json` の以下を触ってください。

- `feeds` / `googleNews.queries` … 収集元を増減する
- `aiKeywords` … AI 記事かどうかの判定語
- `categories` … 絞り込みチップのカテゴリと判定語
- `cluster` … 話題まとめの時間幅・最低媒体数・最大件数
- `entities` … 企業名・製品名の辞書（話題まとめの精度に効く）

## 公開の設定（ロリポップ）

リポジトリの Settings → Secrets and variables → Actions で以下を登録します。
FTP の認証情報は本人が入力してください。

**Secrets**

| 名前 | 内容 |
| --- | --- |
| `LOLIPOP_FTP_SERVER` | FTP サーバー名 |
| `LOLIPOP_FTP_USER` | FTP アカウント |
| `LOLIPOP_FTP_PASSWORD` | FTP パスワード |

**Variables**

| 名前 | 内容 |
| --- | --- |
| `DEPLOY_TARGET` | `lolipop`（この値のときだけアップロードする） |
| `LOLIPOP_SERVER_DIR` | サブドメインの公開ディレクトリ（例: `./aimatome/`。末尾のスラッシュ必須） |

サブドメインを決めたら `config.json` の `site.url` と `site/index.html` の OGP も合わせて更新してください。

## 更新の間隔について（実際はどのくらい空くか）

狙いは **30 分おきの更新**ですが、**cron を 30 分おきに書いてもそうはなりません**。GitHub Actions のスケジュール実行はベストエフォートで、混雑していると遅れるどころか配信されないことがあります。

2026-09-16 の実測では、cron の書き方を変えても**実際に走るのは約 3 時間に 1 回**でした。

| cron | 結果 |
| --- | --- |
| `"0 * * * *"`（毎時 0 分） | 13 回中 4 回だけ実行。間隔は約 2 時間 50 分、定時ちょうどに走った回はゼロ |
| `"13,43 * * * *"`（混雑時刻を避けて 30 分おき） | 変えた直後の回も実行されず |

同じアカウントの trend-video-watcher でも同じ傾向だったので、cron の書き方の問題ではありません。

10 分おきに起動して密度で補おうともしましたが、**9 スロット連続で 1 回も配信されませんでした**（aimatome と trend-video-watcher の両方で同時に確認）。**cron 側でできることはありません。**

一方 `workflow_dispatch` と `repository_dispatch`（どちらも外から叩く経路）は**一度も失敗していません**。そこで、更新の主役は外部トリガーにしています。

### 外部から 30 分おきに叩く（推奨・実質これが本番の更新経路）

ロリポップの cron から、trend-video-watcher リポジトリにある `tools/trigger-collect.php` を実行します。このスクリプトは aimatome と trend-video-watcher の両方に `repository_dispatch` を送るので、**サーバー上に 1 つ置けば両サイトが更新されます**。手順はそちらの README を参照してください。

手元から 1 回だけ叩いて確かめることもできます（`<TOKEN>` は Contents = Read and write の fine-grained token）。

```bash
curl -X POST -H "Accept: application/vnd.github+json" -H "Authorization: Bearer <TOKEN>" \
  https://api.github.com/repos/lumieregiurare-ops/aimatome/dispatches \
  -d '{"event_type":"collect"}'
```

成功すると **204 No Content** が返り、Actions に `repository_dispatch` の実行が現れます。

### cron はフォールバックとして残してある

配信されたときのために 10 分おきの cron も残しています。外部トリガーと二重に走らないよう、**前回の収集から 25 分たっていなければ即座に終了する**ガードを入れてあります（`collect.yml` の「前回からの経過時間を見る」ステップ。前回の時刻は `data/state.json` の `ranAt`）。空振りの回は 15 秒ほどで終わり、Google ニュースへのリクエストも出しません。手動実行（Actions タブの Run workflow）だけは間隔に関係なく必ず収集します。

**この密な cron は公開リポジトリ（Actions の実行時間が無制限）を前提にしています。** 非公開に戻す場合は、1 日 144 回の起動が無料枠 2,000 分を圧迫するので見直してください。

そのため、サイトに出す「次の更新まで約 ○ 分」は cron の設定値から計算せず、**実際に走った間隔の中央値**から出しています（`data/state.json` の `runs` に直近の実行時刻を残し、`collect.mjs` で直近 6 回分の中央値を取って `news.json` の `updateGapMin` / `nextUpdateAt` に書き出す）。目安の時刻を過ぎたら「まもなく更新されます」と言い続けず、「最終更新 ○ 分前」に切り替わります。

**これ以上頻度を上げないでください。** Google ニュースの RSS を 1 回の収集で 12 クエリ叩くため、30 分おき（1 日 576 リクエスト）がおおよその上限です。15 分おきにすると 1 日 1,000 件を超え、拒否されるリスクが上がります。

## ブラウザに保存しているもの

お気に入りなどは **localStorage にだけ**保存しています。サーバーには何も送りません。

| キー | 中身 |
| --- | --- |
| `aimc:favs` | お気に入りの記事。数日で一覧から消えるため、見出し・要約・リンクも一緒に控えている |
| `aimc:read` | 開いた記事の ID（最大 400 件）。「いま読むならこれ」で同じ記事を出さないために使う |
| `aimc:state` | 文字サイズ・絞り込みなどの画面の状態 |

## 権利について

見出し・要約の一部・リンクのみを掲載しています。掲載の取り下げ希望があれば
`config.json` の `site.contactUrl` に記載の窓口から連絡できるようにしてください（未設定）。
