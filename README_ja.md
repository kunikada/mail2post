# Mail2Post プロジェクト

Mail2Post は、メールを受信して指定のURLにPOSTリクエストを送信するAWSサーバーレスアプリケーションです。

## 主な機能

- Amazon SESによるメール受信
- Lambda関数によるメール処理
- 設定可能なPOSTリクエスト形式
- 複数エンドポイントへの並行送信
- Slackチャンネルへの通知連携
- エラー処理とリトライメカニズム
- 監視とロギング

## 技術スタック

- **AWS サービス**: SES, Lambda, S3, CloudWatch
- **開発言語**: TypeScript
- **ランタイム・インフラ等のバージョン**: [common-config.md](docs/common-config.md)を参照

## 使い方（Usage）

### 前提条件

- AWSアカウントおよびSESの受信設定が完了していること
  - **重要**: SESの受信設定には、ドメイン検証、DNS設定、受信ルール設定が含まれます
  - 詳細な手順は[SES受信設定ガイド](docs/ses-setup-guide.md)を参照してください
- [common-config.md](docs/common-config.md)に記載のバージョン要件を満たしたNode.js/Serverless環境
- AWS CLIの認証情報が設定済み

### セットアップ手順

1. リポジトリをクローン
   ```bash
   git clone <このリポジトリのURL>
   cd mail2post
   ```
2. 依存パッケージをインストール
   ```bash
   npm install
   ```
3. 環境別設定ファイルを編集
   ```bash
   # 開発環境の設定を編集
   vi config/dev.json
   # 本番環境の設定を編集
   vi config/prod.json
   ```
4. デプロイ
   ```bash
   # 開発環境にデプロイ
   npm run deploy:dev
   # 本番環境にデプロイ
   npm run deploy:prod
   ```

### 設定・オプション

設定は環境別のJSONファイル（`config/dev.json`、`config/staging.json`、`config/prod.json`）で管理されます。

設定ファイルの詳細な構造や動的読み込みについては[アーキテクチャドキュメント](docs/architecture.md)を参照してください。

以下のような設定が可能です。

#### ルーティング設定（必須）

ルーティング設定は、受信メールのアドレス（完全なメールアドレス）とPOST先の組み合わせを定義します。少なくとも1つのルートを設定する必要があります。受信可能なメールアドレスは`ses.recipients`セクションで管理します。

**設定ファイルの主要セクション:**

| セクション | 説明                                                     |
| ---------- | -------------------------------------------------------- |
| `aws`      | AWSリージョン、S3バケット名など                          |
| `ses`      | SES受信設定、受信可能メールアドレス一覧                  |
| `routes`   | メールアドレスごとのルーティング設定                     |
| `defaults` | 全ルートに適用されるデフォルト設定                       |
| `system`   | システム全体の設定（ログレベル、Lambdaメモリサイズなど） |

設定例（`config/dev.json`）：

```json
{
  "aws": {
    "region": "ap-northeast-1",
    "bucketName": "mail2post-dev"
  },
  "ses": {
    "recipients": ["info@mail2post.com", "support@mail2post.com", "notifications@mail2post.com"]
  },
  "routes": [
    {
      "emailAddress": "info@mail2post.com",
      "postEndpoint": "https://api.example.com/endpoint1",
      "format": "json",
      "headers": { "Authorization": "Bearer token1" }
    },
    {
      "emailAddress": "support@mail2post.com",
      "postEndpoint": "https://api.example.com/endpoint2",
      "format": "form"
    },
    {
      "emailAddress": "alerts@mail2post.com",
      "postEndpoint": "https://api.example.com/alerts",
      "format": "json",
      "transformationOptions": {
        "contentSelection": "subject"
      }
    },
    {
      "type": "slack",
      "emailAddress": "notifications@mail2post.com",
      "webhookUrl": "https://hooks.slack.com/services/XXX/YYY/ZZZ",
      "channel": "#mail-notifications"
    }
  ],
  "defaults": {
    "format": "json",
    "retryCount": 3,
    "retryDelay": 1000,
    "transformationOptions": {
      "htmlMode": "text",
      "inlineImages": "ignore",
      "maxSize": 10485760,
      "attachmentStore": false,
      "contentSelection": "full"
    }
  },
  "system": {
    "logLevel": "info",
    "lambdaMemorySize": 128,
    "lambdaTimeout": 30
  }
}
```

#### メール処理設定（オプション）

これらの設定は、設定ファイルの`defaults.transformationOptions`で設定できます。

| 設定名             | 説明                                          | デフォルト値       |
| ------------------ | --------------------------------------------- | ------------------ |
| `htmlMode`         | HTMLメールの処理方式（`text`/`html`/`both`）  | `text`             |
| `inlineImages`     | インライン画像処理（`ignore`/`base64`/`url`） | `ignore`           |
| `maxSize`          | 処理対象の最大メールサイズ（バイト）          | `10485760`（10MB） |
| `attachmentStore`  | 添付ファイルの保存（`true`/`false`）          | `false`            |
| `allowedSenders`   | 許可する送信元の配列（空配列なら全て許可）    | `[]`               |
| `contentSelection` | POST送信する内容（`full`/`subject`/`body`）   | `full`             |

**contentSelectionオプション詳細:**

- `full`: メールの全ての情報（件名、本文、送信者、受信者、ヘッダーなど）
- `subject`: 件名のみ
- `body`: 本文のみ

#### POSTリクエスト共通設定（オプション）

これらの設定は、設定ファイルの`defaults`およびルート単位の設定で指定できます。

| 設定名       | 説明                                            | デフォルト値 |
| ------------ | ----------------------------------------------- | ------------ |
| `format`     | POSTデータの形式（`json`/`form`/`multipart`）   | `json`       |
| `headers`    | 追加HTTPヘッダー（オブジェクト形式）            | `{}`         |
| `auth.type`  | 認証方式（`none`/`bearer`/`basic`/`apikey`）    | `none`       |
| `auth.token` | 認証トークン（auth.typeがnone以外の場合に必要） | `""`         |
| `retryCount` | 失敗時の最大リトライ回数                        | `3`          |
| `retryDelay` | リトライ間隔（ミリ秒）                          | `1000`       |

#### システム設定

これらの設定は、設定ファイルの`system`セクションで指定できます。

| 設定名               | 説明                                        | デフォルト値 |
| -------------------- | ------------------------------------------- | ------------ |
| `logLevel`           | ログレベル（`debug`/`info`/`warn`/`error`） | `info`       |
| `notificationEmail`  | エラー通知先メールアドレス                  | `""`         |
| `lambdaMemorySize`   | Lambda関数のメモリサイズ（MB）              | `128`        |
| `lambdaTimeout`      | Lambda関数のタイムアウト（秒）              | `30`         |
| `routesConfigSource` | ルート設定の取得元（通常は`file`）          | `file`       |

### メール受信からPOSTまでの流れ

1. **SES受信設定**:
   [SES受信設定ガイド](docs/ses-setup-guide.md)に従ってドメイン検証、DNS設定、受信ルールを設定
2. **メール送信**: 指定したメールアドレス（SESで設定）にメールを送信
3. **SES処理**: SESがメールを受信し、設定された受信ルールに基づいてLambda関数をトリガー
4. **Lambda実行**:
   Lambda関数がメールの宛先アドレスに基づいて、環境別設定ファイルから適切なルートを特定
5. **POST送信**: 特定されたルートの設定に従って、メール内容を解析しHTTP
   POSTリクエストを送信、またはSlack通知を実行
6. **ログ確認**: 処理結果はCloudWatch Logsで確認可能

## テスト

### テスト環境

Mail2Postでは、以下の2種類のテストを実行できます：

- **ユニットテスト**: Devcontainer環境でVitestを使用
- **結合テスト**: AWS開発環境で実際のサービスを使用

詳細なテスト戦略とテスト用APIの設定については[開発ガイド](CONTRIBUTING_ja.md)を参照してください。

```bash
# ユニットテストの実行
npm test

# 結合テストの実行
npm run test:integration
```

### 注意事項

- AWSリソースの作成・削除には課金が発生します。利用前に[Amazon SESの料金](https://aws.amazon.com/jp/ses/pricing/)もご確認ください。
- 詳細な開発・運用手順は[開発ガイド](CONTRIBUTING.md)を参照してください。

## ライセンス

[MIT License](LICENSE)
