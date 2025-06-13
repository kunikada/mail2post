import { beforeAll, describe, expect, it } from 'vitest';
import { SES, SESClientConfig } from '@aws-sdk/client-ses';
import fs from 'fs/promises';

describe('HTMLメール処理統合テスト', () => {
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
        emailAddress: 'html-plain@example.com',
        postEndpoint: 'http://wiremock:8080/webhook-html-plain',
        format: 'json',
        htmlToText: true, // HTMLをテキストに変換
      },
      {
        emailAddress: 'html-keep@example.com',
        postEndpoint: 'http://wiremock:8080/webhook-html-keep',
        format: 'json',
        htmlToText: false, // HTMLをそのまま保持
      },
      {
        emailAddress: 'html-both@example.com',
        postEndpoint: 'http://wiremock:8080/webhook-html-both',
        format: 'json',
        includeHtmlAndText: true, // HTMLとテキスト両方を含める
      },
    ];

    // 設定ファイルを更新
    const configPath = './config/dev.json';
    const existingConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    existingConfig.routes = testRoutes;
    await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));

    // WireMockリセット
    await fetch('http://wiremock:8080/__admin/mappings/reset', { method: 'POST' });

    // HTMLをテキストに変換するエンドポイント
    await fetch('http://wiremock:8080/__admin/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          urlPathPattern: '/webhook-html-plain',
          method: 'POST',
        },
        response: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: { success: true, testId },
        },
      }),
    });

    // HTMLをそのまま保持するエンドポイント
    await fetch('http://wiremock:8080/__admin/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          urlPathPattern: '/webhook-html-keep',
          method: 'POST',
        },
        response: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: { success: true, testId },
        },
      }),
    });

    // HTMLとテキスト両方を含めるエンドポイント
    await fetch('http://wiremock:8080/__admin/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          urlPathPattern: '/webhook-html-both',
          method: 'POST',
        },
        response: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: { success: true, testId },
        },
      }),
    });
  });

  /**
   * SESを使用してHTMLメールを送信する
   */
  async function sendHtmlEmail(options: {
    to: string;
    subject: string;
    htmlContent: string;
  }): Promise<string> {
    const { to, subject, htmlContent } = options;

    // メールヘッダーの構築
    const rawEmail = [
      'From: test@example.com',
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      htmlContent,
    ].join('\r\n');

    const sendRawEmailParams = {
      RawMessage: { Data: Buffer.from(rawEmail) },
      Source: 'test@example.com',
      Destinations: [to],
    };

    const result = await sesClient.sendRawEmail(sendRawEmailParams);

    console.log(`SESでメールを送信しました: ${result.MessageId}`);

    return result.MessageId || '';
  }

  it('HTMLメールがテキストに変換されること', async () => {
    // テスト用HTMLメールを送信
    const testSubject = `HTMLテキスト変換テスト ${testId}`;
    const htmlContent = `
      <html>
        <body>
          <h1>テストメール</h1>
          <p>これはHTMLメールをテキストに変換するテストです。</p>
          <ul>
            <li>項目1</li>
            <li>項目2</li>
          </ul>
        </body>
      </html>
    `;

    await sendHtmlEmail({
      to: 'html-plain@example.com',
      subject: testSubject,
      htmlContent,
    });

    // リクエストが処理されるまで待機（SESとLambdaの処理に時間がかかるため長めに設定）

    console.log('メール処理の完了を待機中...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // WireMockでリクエストを確認
    const requestsResponse = await fetch('http://wiremock:8080/__admin/requests');
    const requests = (await requestsResponse.json()) as {
      requests: Array<{ request: { url: string; method: string; body: string } }>;
    };

    // 期待するリクエストが行われたことを確認
    const relevantRequest = requests.requests.find(
      req => req.request.url === '/webhook-html-plain' && req.request.method === 'POST'
    );

    expect(relevantRequest).toBeDefined();

    if (relevantRequest) {
      // HTMLがテキストに変換されていることを確認
      const body = JSON.parse(relevantRequest.request.body);

      // HTMLタグが含まれていないこと
      expect(body.body).not.toContain('<h1>');
      expect(body.body).not.toContain('<p>');

      // テキスト内容が含まれていること
      expect(body.body).toContain('テストメール');
      expect(body.body).toContain('これはHTMLメールをテキストに変換するテストです。');
      expect(body.body).toContain('項目1');
      expect(body.body).toContain('項目2');
    }
  });

  it('HTMLメールがそのまま保持されること', async () => {
    // テスト用HTMLメールを送信
    const testSubject = `HTML保持テスト ${testId}`;
    const htmlContent = `
      <html>
        <body>
                    <h1>テストメール</h1>
          <p>これはHTMLメールをそのまま保持するテストです。</p>
        </body>
      </html>
    `;

    await sendHtmlEmail({
      to: 'html-keep@example.com',
      subject: testSubject,
      htmlContent,
    });

    // リクエストが処理されるまで待機

    console.log('メール処理の完了を待機中...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // WireMockでリクエストを確認
    const requestsResponse = await fetch('http://wiremock:8080/__admin/requests');
    const requests = (await requestsResponse.json()) as {
      requests: Array<{ request: { url: string; method: string; body: string } }>;
    };

    // 期待するリクエストが行われたことを確認
    const relevantRequest = requests.requests.find(
      req => req.request.url === '/webhook-html-keep' && req.request.method === 'POST'
    );

    expect(relevantRequest).toBeDefined();

    if (relevantRequest) {
      // HTMLがそのまま保持されていることを確認
      const body = JSON.parse(relevantRequest.request.body);

      // HTMLタグが含まれていること
      expect(body.body).toContain('<h1>');
      expect(body.body).toContain('<p>');

      // テキスト内容も含まれていること
      expect(body.body).toContain('テストメール');
      expect(body.body).toContain('これはHTMLメールをそのまま保持するテストです。');
    }
  });

  it('HTMLとテキストの両方が含まれること', async () => {
    // テスト用HTMLメールを送信
    const testSubject = `HTML両方テスト ${testId}`;
    const htmlContent = `
      <html>
        <body>
          <h1>テストメール</h1>
          <p>これはHTMLとテキスト両方を含めるテストです。</p>
        </body>
      </html>
    `;

    await sendHtmlEmail({
      to: 'html-both@example.com',
      subject: testSubject,
      htmlContent,
    });

    // リクエストが処理されるまで待機

    console.log('メール処理の完了を待機中...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // WireMockでリクエストを確認
    const requestsResponse = await fetch('http://wiremock:8080/__admin/requests');
    const requests = (await requestsResponse.json()) as {
      requests: Array<{ request: { url: string; method: string; body: string } }>;
    };

    // 期待するリクエストが行われたことを確認
    const relevantRequest = requests.requests.find(
      req => req.request.url === '/webhook-html-both' && req.request.method === 'POST'
    );

    expect(relevantRequest).toBeDefined();

    if (relevantRequest) {
      // HTMLとテキスト両方が含まれていることを確認
      const body = JSON.parse(relevantRequest.request.body);

      // htmlプロパティがあり、HTMLタグが含まれていること
      expect(body.html).toBeDefined();
      expect(body.html).toContain('<h1>');
      expect(body.html).toContain('<p>');

      // bodyプロパティがあり、テキスト内容が含まれていること
      expect(body.body).toBeDefined();
      expect(body.body).toContain('テストメール');
      expect(body.body).toContain('これはHTMLとテキスト両方を含めるテストです。');

      // HTMLタグが含まれていないこと（bodyはテキスト版）
      expect(body.body).not.toContain('<h1>');
      expect(body.body).not.toContain('<p>');
    }
  });
});
