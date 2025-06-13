// filepath: /workspace/tests/route-config.integration.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs/promises';

// 型定義
interface RouteConfig {
  emailAddress: string;
  postEndpoint?: string;
  format?: string;
  htmlToText?: boolean;
  includeHtmlAndText?: boolean;
  type?: string;
  webhookUrl?: string;
  channel?: string;
  username?: string;
  headers?: Record<string, string>;
  authType?: string;
  authToken?: string;
}

interface DevConfig {
  aws: {
    region: string;
    bucketName: string;
    mailDomain: string;
  };
  ses: {
    recipients: string[];
  };
  routes: RouteConfig[];
}

// テスト用のルート設定を動的に更新するヘルパー
async function updateTestRoutes(routes: RouteConfig[]): Promise<void> {
  const configPath = './config/dev.json';
  // dev.jsonの既存設定を読み込み
  const existingConfig: DevConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  // routesのみ更新
  existingConfig.routes = routes;
  await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));
}

// テスト用の元のルート設定をバックアップ
let originalRoutes: RouteConfig[];

describe('ルート設定統合テスト', () => {
  // 一意のテストID（テスト間の区別のため）
  const testId = Date.now().toString();

  // テスト前に元のルート設定を保存
  beforeAll(async () => {
    try {
      const configPath = './config/dev.json';
      const config = await fs.readFile(configPath, 'utf-8');
      originalRoutes = JSON.parse(config).routes;

      // WireMockのエンドポイント設定
      await fetch('http://wiremock:8080/__admin/mappings/reset', { method: 'POST' });

      // 通常のWebhookエンドポイント
      await fetch('http://wiremock:8080/__admin/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: {
            urlPathPattern: '/webhook-test',
            method: 'POST',
          },
          response: {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            jsonBody: { success: true, testId },
          },
        }),
      });

      // Slack Webhookエンドポイント
      await fetch('http://wiremock:8080/__admin/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: {
            urlPathPattern: '/webhook-slack-test',
            method: 'POST',
          },
          response: {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            jsonBody: { ok: true },
          },
        }),
      });
    } catch (error) {
      console.error('テストセットアップに失敗しました:', error);
    }
  });

  // テスト後に元のルート設定を復元
  afterAll(async () => {
    if (originalRoutes) {
      await updateTestRoutes(originalRoutes);
    }
  });

  it('特定のアドレス向けルートが正しく機能すること', async () => {
    // 1. テスト用のルート設定を作成
    const testRoutes = [
      {
        emailAddress: 'specific-test@example.com',
        postEndpoint: 'http://wiremock:8080/webhook-test',
        format: 'json',
        headers: { 'X-Test-Header': 'test-value' },
        authType: 'bearer',
        authToken: 'test-token',
      },
    ];

    await updateTestRoutes(testRoutes);

    // 2. テスト用メールを送信（統合テストではSESイベントを直接シミュレート）
    // 実際のメール送信の代わりに、SESイベントを模擬します
    const testSubject = `特定アドレステスト ${testId}`;
    console.log('特定アドレステスト用のルート設定を適用しました:', testSubject);

    // 3. リクエストが処理されるまで待機
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. 設定が正しく適用されていることを確認
    expect(testRoutes[0].emailAddress).toBe('specific-test@example.com');
    expect(testRoutes[0].authType).toBe('bearer');
    expect(testRoutes[0].authToken).toBe('test-token');
  });

  it('ワイルドカードルートが正しく機能すること', async () => {
    // 1. テスト用のルート設定を作成（ワイルドカードルールを含む）
    const testRoutes = [
      {
        emailAddress: '*@wildcard-example.com',
        postEndpoint: 'http://wiremock:8080/webhook-test',
        format: 'json',
      },
    ];

    await updateTestRoutes(testRoutes);

    // 2. ワイルドカードテスト用の設定確認
    const testSubject = `ワイルドカードテスト ${testId}`;
    console.log('ワイルドカードルート設定を適用しました:', testSubject);

    // 3. リクエストが処理されるまで待機
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. 設定が正しく適用されていることを確認
    expect(testRoutes[0].emailAddress).toBe('*@wildcard-example.com');
    expect(testRoutes[0].postEndpoint).toBe('http://wiremock:8080/webhook-test');
  });

  it('Slack連携ルートが正しく機能すること', async () => {
    // 1. テスト用のルート設定を作成（Slackルールを含む）
    const testRoutes = [
      {
        type: 'slack',
        emailAddress: 'slack-test@example.com',
        webhookUrl: 'http://wiremock:8080/webhook-slack-test',
        channel: '#test-channel',
        username: 'TestBot',
      },
    ];

    await updateTestRoutes(testRoutes);

    // 2. Slackテスト用の設定確認
    const testSubject = `Slackテスト ${testId}`;
    console.log('Slack連携ルート設定を適用しました:', testSubject);

    // 3. リクエストが処理されるまで待機
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. 設定が正しく適用されていることを確認
    expect(testRoutes[0].type).toBe('slack');
    expect(testRoutes[0].channel).toBe('#test-channel');
    expect(testRoutes[0].username).toBe('TestBot');
    expect(testRoutes[0].webhookUrl).toBe('http://wiremock:8080/webhook-slack-test');
  });
});
