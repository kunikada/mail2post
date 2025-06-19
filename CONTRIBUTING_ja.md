# Mail2Post 開発ガイド

このドキュメントでは、Mail2Postプロジェクトへの貢献方法について説明します。

## プロジェクト概要

このプロジェクトは、Amazon SESでメールを受信し、AWS
Lambdaでメール内容を処理して、指定されたWebサービスにHTTP
POSTリクエストとして転送するシステムを実装します。インフラストラクチャはServerlessフレームワークを使用して管理されます。

## 開発ドキュメント

以下のドキュメントでプロジェクトの詳細を確認できます：

- [要件定義書](docs/requirements.md) - プロジェクトの要件と目標
- [アーキテクチャ概要](docs/architecture.md) - システムアーキテクチャの説明
- [実装計画](docs/implementation-plan.md) - 開発フェーズとタイムライン
- [技術仕様書](docs/technical-specifications.md) - 技術的な詳細と設計
- [テストの実施方針](docs/testing-strategy.md) - ユニットテストと結合テストの実施方針

このガイドでは、特に開発者向けのテスト用API管理やデプロイ手順について詳しく説明します。

## 開発環境のセットアップ

### 前提条件

- Node.js、Serverless Framework等のバージョンは[docs/common-config.md](docs/common-config.md)を参照
- npm 10.x以上
- AWS CLI
- Docker（Devcontainer使用時）
- Visual Studio Code（Devcontainer使用時）

### 環境構築

#### Devcontainerを使用した環境構築（推奨）

Visual Studio CodeとDockerを使用してDevcontainerで開発環境を構築できます：

1. Visual Studio
   Codeに[Remote - Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)拡張機能をインストール
2. リポジトリをクローン：
   ```bash
   git clone https://github.com/your-organization/mail2post.git
   cd mail2post
   ```
3. Visual Studio Codeでフォルダを開く
4. コマンドパレット（F1キー）を開き、`Remote-Containers: Reopen in Container`を選択
5. Devcontainerのビルドが完了すると、必要な依存関係がすべてインストールされた環境が準備されます

#### 手動セットアップ

Devcontainerを使用しない場合は、以下の手順で手動セットアップします：

```bash
# リポジトリのクローン
git clone https://github.com/your-organization/mail2post.git
cd mail2post

# 依存関係のインストール
npm install

# TypeScriptの型定義ファイルの生成
npm run build:types
```

### AWS認証情報の設定

AWSの認証情報を設定します：

```bash
aws configure
```

環境固有の設定は`config/{stage}.json`ファイルで管理されます：

```bash
# 開発環境用設定ファイルの確認
cat config/dev.json

# 本番環境用設定ファイルの確認  
cat config/prod.json
```

## 開発ワークフロー

### ローカル開発

```bash
# TypeScriptのコンパイル（ウォッチモード、esbuildを使用）
npm run watch

# または個別コマンド
npm run build        # 通常ビルド
npm run build:dev    # 開発用ビルド（ソースマップあり）
npm run build:prod   # 本番用ビルド（最小化）
npm run build:watch  # 監視モード

# 型定義ファイルの生成のみ
npm run build:types

# 単体テストの実行
npm test

# 単体テスト（ウォッチモード）
npm run test:watch

# 結合テストの実行
npm run test:integration
```

### テスト用API

結合テストでは、専用のテスト用Webhook APIを使用してMail2Postからのリクエストを受信・検証します。

#### テスト用APIの構成

- **API Gateway**: Webhookエンドポイント提供
- **Lambda関数**: リクエスト受信・レスポンス返却
- **設定ファイル**: `config/test-api.json`（自動生成）

#### テスト用API管理コマンド

```bash
# テスト用APIのデプロイとセットアップ
npm run test:setup:api

# テスト用APIの状態確認
npm run test:status

# テスト用APIのログ確認
npm run test:logs

# テスト用APIのクリーンアップ
npm run test:cleanup:api
```

#### テスト用APIの使用フロー

1. **セットアップ**: `npm run test:setup:api`でテスト用APIをデプロイ
   - API Gateway + Lambdaが自動作成される
   - 設定ファイル`config/test-api.json`が自動生成される
   - エンドポイントURLとリソース情報が表示される

2. **テスト実行**: 結合テストでテスト用APIが使用される
   - Mail2Postからテスト用APIにHTTPリクエストが送信される
   - Lambda関数がリクエスト内容をレスポンスに含めて返却する
   - Mail2PostからのHTTPリクエストにはX-Mail-Processing-IDヘッダーが追加されて一意のリクエストを追跡可能
   - 保存されたデータは`GET /webhook`で取得可能（以下の方法で指定）：
     - ヘッダー: `X-Mail-Processing-ID: <処理ID>`
     - クエリパラメータ: `?mailProcessingId=<処理ID>`

3. **状態確認**: `npm run test:status`で現在の状態を確認
   - API Gateway、Lambdaの状態
   - 最近のリクエストログ
   - エンドポイントの接続テスト

4. **クリーンアップ**: `npm run test:cleanup:api`でリソースを削除
   - CloudFormationスタックの削除
   - 設定ファイルの削除

#### 設定ファイル（自動生成）

`config/test-api.json`の例：

```json
{
  "webhook": {
    "url": "https://example-api-gateway.execute-api.us-west-2.amazonaws.com/test/webhook",
    "apiId": "example123",
    "headers": {
      "Content-Type": "application/json"
    }
  },
  "aws": {
    "region": "us-west-2"
  },
  "test": {
    "timeout": 30000,
    "retryCount": 3,
    "cleanupAfterTest": true
  }
}
```

### コードスタイルのチェックと修正

```bash
# コードスタイルのチェックと修正
npm run lint         # ESLintでのチェック
npm run lint:fix     # ESLintでの自動修正
npm run format       # Prettierでのフォーマット（srcディレクトリ）
npm run format:all   # Prettierでのフォーマット（全ファイル）
npm run format:check # Prettierでのチェックのみ
npm run lint:all     # ESLintとPrettierの両方でチェック
npm run fix:all      # ESLintとPrettierの両方で修正
```

### デプロイ
npm run lint         # ESLintでのチェック
npm run lint:fix     # ESLintでの自動修正
npm run format       # Prettierでのフォーマット（srcディレクトリ）
npm run format:all   # Prettierでのフォーマット（全ファイル）
npm run format:check # Prettierでのチェックのみ
npm run lint:all     # ESLintとPrettierの両方でチェック
npm run fix:all      # ESLintとPrettierの両方で修正
```

### デプロイ

```bash
# 開発環境へのデプロイ
npm run deploy:dev

# ステージング環境へのデプロイ
npm run deploy:staging

# 本番環境へのデプロイ
npm run deploy:prod
```

## プロジェクト構造

```
mail2post/
├── .devcontainer/         # Devcontainer設定
│   ├── devcontainer.json  # VS Code Devcontainer設定
│   ├── Dockerfile         # 開発環境用Dockerコンテナ定義
│   └── docker-compose.yml # Docker Compose設定
├── src/                   # ソースコード
│   ├── index.ts           # メインエントリーポイント
│   ├── handlers/          # Lambda関数ハンドラー
│   ├── services/          # ビジネスロジック
│   ├── domain/            # ドメインモデルとリポジトリ
│   │   ├── models/        # ドメインモデル
│   │   └── repositories/  # リポジトリパターン実装
│   ├── test-api/          # テスト用Webhook API
│   └── types/             # TypeScript型定義
├── tests/                 # テストコード
│   ├── unit/              # 単体テスト
│   └── integration/       # 統合テスト
├── scripts/               # 管理スクリプト
│   ├── setup-test-api.cjs # テスト用API セットアップ
│   ├── cleanup-test-api.cjs # テスト用API クリーンアップ
│   ├── test-api-status.cjs # テスト用API 状態確認
│   └── cleanup-resources.cjs # リソースクリーンアップ
├── config/                # 設定ファイル
│   ├── dev.json           # 開発環境設定
│   ├── prod.json          # 本番環境設定
│   ├── sendgrid.json      # SendGrid設定
│   └── test-api.json      # テスト用API設定（自動生成）
├── docs/                  # ドキュメント
│   ├── architecture.md    # アーキテクチャ概要
│   ├── common-config.md   # 共通設定
│   ├── implementation-plan.md # 実装計画
│   ├── requirements.md    # 要件定義
│   ├── ses-setup-guide.md # SESセットアップガイド
│   ├── technical-specifications.md # 技術仕様書
│   └── testing-strategy.md # テスト戦略
├── serverless.yml         # メインアプリのServerless設定
├── serverless-test-api.yml # テスト用APIのServerless設定
├── serverless.config.cjs  # Serverless設定（共通）
├── tsconfig.json          # TypeScript設定
├── vitest.config.ts       # Vitestユニットテスト設定
├── vitest.integration.config.ts # Vitest統合テスト設定
├── esbuild.config.js      # ESBuildビルド設定
├── eslint.config.js       # ESLint設定
├── package.json           # npm設定
├── CONTRIBUTING.md        # 開発ガイド
└── README.md              # プロジェクト概要
```

## コーディング規約

- TypeScriptの型定義を適切に使用する
- ESLintとPrettierのルールに従う
  - コードフォーマットはPrettierで自動整形
  - コード品質はESLintでチェック
  - コミット前に`npm run fix:all`を実行することを推奨
- 関数とクラスにはJSDocコメントを追加する
- テスト駆動開発（TDD）の原則に従う
- コミットメッセージは[Conventional Commits](https://www.conventionalcommits.org/)のフォーマットに従う

## プルリクエスト手順

1. 新しい機能やバグ修正には新しいブランチを作成する
2. コードを変更し、適切なテストを追加する
3. すべてのテストが通ることを確認する
4. 変更内容を説明するプルリクエストを作成する
5. コードレビューを受け、必要な修正を行う

## リリースプロセス

1. `develop`ブランチですべての機能をテスト
2. `staging`ブランチにマージしてステージング環境でテスト
3. `main`ブランチにマージして本番リリース
4. リリースタグを付ける（セマンティックバージョニングに従う）

## トラブルシューティング

一般的な問題と解決方法：

### 開発環境関連
- **デプロイエラー**: AWS認証情報が正しく設定されているか確認
- **TypeScriptエラー**: `npm run build:clean`を実行して再ビルド
- **SES設定エラー**: AWSコンソールでSES受信ルールを確認
- **Devcontainerのビルドエラー**:
  Dockerが起動していることを確認し、`docker info`コマンドでDocker状態を確認
- **Devcontainer内の依存関係エラー**: コンテナ内で`npm install`を再実行

### テスト用API関連
- **テスト用APIセットアップエラー**: 
  - AWS認証情報とリージョン設定を確認
  - 必要なIAM権限（CloudFormation、API Gateway、Lambda）があるか確認
  - `npm run test:cleanup:api`でリソースをクリーンアップ後に再実行

- **テスト用API状態確認エラー**:
  - `npm run test:setup:api`が正常に完了しているか確認
  - `config/test-api.json`ファイルが存在するか確認
  - AWSコンソールでスタック「mail2post-test-api-test」の状態を確認

- **結合テスト失敗**:
  - テスト用APIが正常に動作しているか`npm run test:status`で確認
  - テスト用APIのログを`npm run test:logs`で確認
  - Lambda関数のレスポンス内容を確認

- **テスト用API削除エラー**:
  - AWSコンソールでCloudFormationスタックを手動削除
  - API Gatewayのテスト用APIを手動削除

より詳細な情報やサポートが必要な場合は、イシューを作成してください。
