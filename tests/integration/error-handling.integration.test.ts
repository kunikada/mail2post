import { beforeAll, describe, expect, it } from 'vitest';
import { SES, SESClientConfig, SendRawEmailCommandOutput } from '@aws-sdk/client-ses';
import fs from 'fs/promises';

// Route型の定義
interface Route {
  emailAddress: string;
  postEndpoint: string;
  format: string;
  retryCount?: number;
  retryDelay?: number;
  timeout?: number;
}

describe('エラーハンドリング統合テスト', () => {
  // 実AWS環境での統合テスト用設定
  // AWS認証情報は環境変数またはIAMロールから取得される
  const sesConfig: SESClientConfig = {
    region: process.env.AWS_REGION || 'ap-northeast-1',
  };
  const sesClient = new SES(sesConfig);

  // 一意のテストID（テスト間の区別のため）
  const testId = Date.now().toString();

  beforeAll(async () => {
    // テスト用のルート設定を作成
    const testRoutes = [
      {
        emailAddress: 'retry@example.com',
        postEndpoint: 'http://wiremock:8080/webhook-error',
        format: 'json',
        retryCount: 3,
        retryDelay: 500,
      },
      {
        emailAddress: 'timeout@example.com',
        postEndpoint: 'http://wiremock:8080/webhook-timeout',
        format: 'json',
        timeout: 1000,
        retryCount: 2,
        retryDelay: 500,
      },
      {
        emailAddress: 'malformed@example.com',
        postEndpoint: 'http://wiremock:8080/webhook-malformed',
        format: 'json',
      },
    ];

    // 設定ファイルを更新
    const configPath = './config/dev.json';
    const existingConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    existingConfig.routes = testRoutes;
    await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));

    // WireMockリセット
    await fetch('http://wiremock:8080/__admin/mappings/reset', { method: 'POST' });

    // 失敗後に成功するエンドポイント
    await fetch('http://wiremock:8080/__admin/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioName: 'retry-scenario',
        newScenarioState: 'Started',
        request: {
          urlPathPattern: '/webhook-error',
          method: 'POST',
        },
        response: {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: { error: 'Internal Server Error' },
        },
      }),
    });

    await fetch('http://wiremock:8080/__admin/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioName: 'retry-scenario',
        requiredScenarioState: 'Started',
        newScenarioState: 'Second Attempt',
        request: {
          urlPathPattern: '/webhook-error',
          method: 'POST',
        },
        response: {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: { error: 'Internal Server Error' },
        },
      }),
    });

    await fetch('http://wiremock:8080/__admin/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioName: 'retry-scenario',
        requiredScenarioState: 'Second Attempt',
        newScenarioState: 'Success',
        request: {
          urlPathPattern: '/webhook-error',
          method: 'POST',
        },
        response: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: { success: true, testId },
        },
      }),
    });

    // タイムアウトエンドポイント
    await fetch('http://wiremock:8080/__admin/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          urlPathPattern: '/webhook-timeout',
          method: 'POST',
        },
        response: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          fixedDelayMilliseconds: 2000, // タイムアウトを発生させるために2秒待機
          jsonBody: { success: true, testId },
        },
      }),
    });

    // 不正なレスポンスを返すエンドポイント
    await fetch('http://wiremock:8080/__admin/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          urlPathPattern: '/webhook-malformed',
          method: 'POST',
        },
        response: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: '{"invalid json structure',
        },
      }),
    });

    // WireMockのリクエスト記録をリセット
    await fetch('http://wiremock:8080/__admin/requests/reset', { method: 'POST' });
  });

  // SES RawEmailヘルパー関数
  const createRawEmail = (to: string, subject: string, text: string): string => {
    return [
      'From: test@example.com',
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      text,
      `テストID: ${testId}`,
    ].join('\r\n');
  };

  // メール送信ヘルパー関数
  const sendTestEmail = async (
    to: string,
    subject: string,
    text: string
  ): Promise<SendRawEmailCommandOutput> => {
    try {
      const rawEmail = createRawEmail(to, subject, text);

      // SESのパラメータを簡略化（Source, Destinationsを削除）
      const sendRawEmailParams = {
        RawMessage: { Data: Buffer.from(rawEmail) },
      };

      console.log(
        'SESパラメータ:',
        JSON.stringify(
          {
            ...sendRawEmailParams,
            RawMessage: { DataSize: rawEmail.length }, // 実際のデータの代わりにサイズだけログに出力
          },
          null,
          2
        )
      );

      const result = await sesClient.sendRawEmail(sendRawEmailParams);
      console.log(`SESでメールを送信しました: ${result.MessageId}`);
      return result;
    } catch (error) {
      console.error('SESメール送信エラー:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error('エラースタック:', error.stack);
      }
      throw error;
    }
  };

  it('設定された回数リトライしてから成功すること', async () => {
    // テスト用メールを送信
    const testSubject = `リトライテスト ${testId}`;

    // dev.jsonを修正して、info@example.comをリトライ用URLにマッピング
    const configPath = './config/dev.json';
    const existingConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));

    // info@example.comを追加
    const infoRoute = existingConfig.routes.find(
      (r: Route) => r.emailAddress === 'retry@example.com'
    );
    if (infoRoute) {
      existingConfig.routes.push({
        ...infoRoute,
        emailAddress: 'info@example.com',
      });
      await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));
    }

    // sendTestEmail関数を使用してメールを送信
    try {
      const mailResult = await sendTestEmail(
        'info@example.com',
        testSubject,
        'これはリトライ処理のテストメールです。'
      );
      expect(mailResult.MessageId).toBeDefined();
      console.log(`SESでメールを送信しました: ${mailResult.MessageId}`);
    } catch (error) {
      console.error(
        'テストメール送信エラー:',
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    // WireMockでリクエストを確認
    const requestsResponse = await fetch('http://wiremock:8080/__admin/requests');
    const requests = (await requestsResponse.json()) as {
      requests: Array<{ request: { url: string; method: string } }>;
    };

    // リトライが行われたことを確認（同じエンドポイントに複数回リクエストがあること）
    const retryRequests = requests.requests.filter(
      req => req.request.url === '/webhook-error' && req.request.method === 'POST'
    );

    // 最初の失敗 + リトライ1回 + 最終成功 = 3回のリクエスト
    expect(retryRequests.length).toBeGreaterThanOrEqual(3);
    console.log(`リトライリクエスト数: ${retryRequests.length}`);
  });

  it('タイムアウトエンドポイントが適切に処理されること', async () => {
    // テスト用メールを送信
    const testSubject = `タイムアウトテスト ${testId}`;

    // dev.jsonを修正して、timeout@example.comと同じ設定をinfo2@example.comに適用
    const configPath = './config/dev.json';
    const existingConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));

    // info2@example.comを追加
    const timeoutRoute = existingConfig.routes.find(
      (r: Route) => r.emailAddress === 'timeout@example.com'
    );
    if (timeoutRoute) {
      existingConfig.routes.push({
        ...timeoutRoute,
        emailAddress: 'info2@example.com',
      });
      await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));
    }

    // sendTestEmail関数を使用してメールを送信
    try {
      const mailResult = await sendTestEmail(
        'info2@example.com',
        testSubject,
        'これはタイムアウト処理のテストメールです。'
      );
      expect(mailResult.MessageId).toBeDefined();
      console.log(`SESでメールを送信しました: ${mailResult.MessageId}`);
    } catch (error) {
      console.error(
        'テストメール送信エラー:',
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }

    await new Promise(resolve => setTimeout(resolve, 6000));

    // WireMockでリクエストを確認
    const requestsResponse = await fetch('http://wiremock:8080/__admin/requests');
    const requests = (await requestsResponse.json()) as {
      requests: Array<{ request: { url: string; method: string } }>;
    };

    // タイムアウトリクエストが行われたことを確認
    const timeoutRequests = requests.requests.filter(
      req => req.request.url === '/webhook-timeout' && req.request.method === 'POST'
    );

    // 最初の試み + リトライ = 少なくとも2回のリクエスト
    expect(timeoutRequests.length).toBeGreaterThanOrEqual(2);
    console.log(`タイムアウトリクエスト数: ${timeoutRequests.length}`);
  });

  it('不正なレスポンスが適切に処理されること', async () => {
    // テスト用メールを送信
    const testSubject = `不正レスポンステスト ${testId}`;

    // dev.jsonを修正して、malformed@example.comと同じ設定をinfo3@example.comに適用
    const configPath = './config/dev.json';
    const existingConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));

    // info3@example.comを追加
    const malformedRoute = existingConfig.routes.find(
      (r: Route) => r.emailAddress === 'malformed@example.com'
    );
    if (malformedRoute) {
      existingConfig.routes.push({
        ...malformedRoute,
        emailAddress: 'info3@example.com',
      });
      await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));
    }

    // sendTestEmail関数を使用してメールを送信
    try {
      const mailResult = await sendTestEmail(
        'info3@example.com',
        testSubject,
        'これは不正レスポンス処理のテストメールです。'
      );
      expect(mailResult.MessageId).toBeDefined();
      console.log(`SESでメールを送信しました: ${mailResult.MessageId}`);
    } catch (error) {
      console.error(
        'テストメール送信エラー:',
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }

    await new Promise(resolve => setTimeout(resolve, 4000));

    // WireMockでリクエストを確認
    const requestsResponse = await fetch('http://wiremock:8080/__admin/requests');
    const requests = (await requestsResponse.json()) as {
      requests: Array<{ request: { url: string; method: string } }>;
    };

    // リクエストが行われたことを確認
    const malformedRequests = requests.requests.filter(
      req => req.request.url === '/webhook-malformed' && req.request.method === 'POST'
    );

    // リクエストは送信されるが、エラーはログに記録されるはず
    expect(malformedRequests.length).toBeGreaterThanOrEqual(1);
    console.log(`不正レスポンスリクエスト数: ${malformedRequests.length}`);
  });
});
