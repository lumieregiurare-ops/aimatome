# AI matomechatter

AI に関するニュースを、日本語の記事を中心に自動で集めてまとめる静的サイトです。
複数の媒体が同じ話題を報じたものは「いま話題になっていること」としてグループ化し、
残りは日付ごとの一覧で追えるようにしています。

- 掲載するのは **見出し・要約の一部・元記事へのリンク** のみ（本文の転載はしない）
- 収集も公開も GitHub Actions で自動実行（1 時間おき）
- 依存パッケージなしの Node 20 スクリプトで収集し、`docs/` を配信する

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

## 権利について

見出し・要約の一部・リンクのみを掲載しています。掲載の取り下げ希望があれば
`config.json` の `site.contactUrl` に記載の窓口から連絡できるようにしてください（未設定）。
