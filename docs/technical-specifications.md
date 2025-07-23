<!-- filepath: /workspace/docs/technical-specifications.md -->

# Mail2Post 技術仕様書

## 1. 技術スタック

### バックエンド

- **言語**: TypeScript
- **ランタイム**: Node.js
- **主要ライブラリ**: aws-sdk, mailparser, fetch
- **テスト**: Vitest
- **ビルド**: esbuild

### AWS サービス

- **Amazon SES**: メール受信
- **AWS Lambda**: コード実行環境
- **Amazon S3**: メール保存・設定ファイル管理
- **Amazon CloudWatch**: ログ管理

## 2. システムアーキテクチャ

### メール処理フロー

1. SESでメール受信
2. Lambda関数でメール内容を解析
3. 設定に基づいてルーティング
4. 指定されたWebhookエンドポイントにPOST送信

### コンポーネント構成

**Lambda関数**:

- `processEmail`: メイン処理関数
- SESイベントをトリガーとして実行

**設定管理**:

- `config/{stage}.json`: 環境別設定
- ルーティング設定とエンドポイント情報

## 3. データ形式

### ルーティング設定

```json
{
  "routes": [
    {
      "emailAddress": "example@domain.com",
      "postEndpoint": "https://api.example.com/webhook",
      "format": "json",
      "headers": { "Authorization": "Bearer token" }
    }
  ]
}
```

### POST送信データ

```json
{
  "from": "sender@example.com",
  "to": "recipient@domain.com",
  "subject": "メール件名",
  "text": "メール本文",
  "html": "HTMLメール本文",
  "attachments": []
}
```

## 4. セキュリティ

### 認証・認可

- AWS IAMによる権限管理
- Lambda実行ロールの最小権限設定
- SES受信ルールによるアクセス制御

### データ保護

- メールデータの一時的な処理のみ
- 機密情報のログ出力回避
- 設定ファイルでの認証情報管理

## 5. エラー処理

### エラーハンドリング

- 無効なメール形式の処理
- ネットワークエラーでのリトライ機能
- 設定エラーでの適切なログ出力

### ログ管理

- CloudWatchによる実行ログ
- エラー発生時の詳細情報記録
- 処理状況の追跡可能性

## 6. デプロイとテスト

### デプロイ方式

- Serverless Frameworkによるインフラ管理
- 環境別設定による段階的デプロイ
- CloudFormationスタックによるリソース管理

### テスト戦略

- ユニットテスト: Vitest
- 結合テスト: 実AWS環境
- テスト用Webhook API: API Gateway + Lambda

詳細な実装手順は[CONTRIBUTING_ja.md](../CONTRIBUTING_ja.md)を参照してください。
