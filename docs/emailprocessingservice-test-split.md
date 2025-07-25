# EmailProcessingServiceテスト分割サマリー

## 分割結果

元々1,247行の巨大なテストファイル `EmailProcessingService.test.ts` を以下のように機能別に分割しました：

### 1. テスト共通ユーティリティ
**ファイル**: `EmailProcessingService.test-utils.ts`
- 共通のモッククラス（MockRouteRepository, MockEmailRepository, MockS3EmailService, MockSESEmailExtractor）
- テストヘルパー関数（createMockSESRecord, setupTestEnvironment）
- 共通のモック設定（fetch, config）

### 2. 基本機能テスト
**ファイル**: `EmailProcessingService.basic.test.ts`
- 正常な処理フロー
- ルートが見つからない場合のエラーハンドリング
- エンドポイント失敗時のリトライ処理

### 3. コンテンツ選択機能テスト
**ファイル**: `EmailProcessingService.content-selection.test.ts`
- contentSelection: 'full' - 全情報送信
- contentSelection: 'subject' - 件名のみ送信
- contentSelection: 'body' - 本文のみ送信
- 各種フォーマット（json, raw, form）でのコンテンツ選択
- S3からのメール取得失敗時のフォールバック処理

### 4. 複数エンドポイント処理テスト
**ファイル**: `EmailProcessingService.multi-endpoint.test.ts`
- 複数エンドポイントへの並行送信
- 一部エンドポイント失敗時の部分成功処理
- 全エンドポイント失敗時のエラーハンドリング
- X-Mail-Processing-IDヘッダーの一意性検証

### 5. フォーマット処理テスト
**ファイル**: `EmailProcessingService.format.test.ts`
- raw形式でのデータ送信（full, subject, body）
- HTMLモード処理（text, html, both）
- HTMLコンテンツが存在しない場合のフォールバック

### 6. 認証機能テスト
**ファイル**: `EmailProcessingService.auth.test.ts`
- APIキー認証（x-api-keyヘッダー）
- Bearer認証（Authorizationヘッダー）
- 認証なし設定
- 認証タイプ未指定時のデフォルト動作

### 7. 統合エントリーポイント
**ファイル**: `EmailProcessingService.test.ts`
- 分割されたテストファイルをインポートするエントリーポイント
- テスト実行時に全ての分割テストが実行される

## 利点

1. **保守性の向上**: 機能別に分割されているため、特定の機能のテスト修正が容易
2. **可読性の向上**: 各ファイルが特定の関心事に焦点を当てている
3. **並行開発**: 異なる機能のテストを異なる開発者が並行して作業可能
4. **テスト実行の効率化**: 特定の機能のテストのみを実行することが可能
5. **再利用性**: 共通ユーティリティを他のテストでも利用可能

## テスト実行方法

```bash
# 全テスト実行
npm test tests/unit/services/EmailProcessingService.test.ts

# 特定機能のテストのみ実行
npm test tests/unit/services/EmailProcessingService.basic.test.ts
npm test tests/unit/services/EmailProcessingService.auth.test.ts
# 等々...
```

## 共通ユーティリティの活用

他のサービステストでも `EmailProcessingService.test-utils.ts` の共通クラスとヘルパー関数を再利用することで、テストコードの重複を削減できます。

```typescript
import {
  MockRouteRepository,
  MockEmailRepository,
  createMockSESRecord,
  setupTestEnvironment,
} from './EmailProcessingService.test-utils';
```
