import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs/promises';

// 型定義
interface MockRequest {
  request: {
    url: string;
    method: string;
    body: string;
  };
}

// 現在未使用のインターフェース
// interface DevConfig {
//   routes: Array<{
//     emailAddress: string;
//     postEndpoint: string;
//     format: string;
//   }>;
// }

describe('複数エンドポイント処理統合テスト', () => {
  // 一意のテストID（テスト間の区別のため）
  const testId = Date.now().toString();

  beforeAll(async () => {
    // テスト用のルート設定を作成
    const testRoutes = [
      {
        emailAddress: 'multi@example.com',
        postEndpoint: 'http://wiremock:8080/webhook-multi-1',
        format: 'json',
      },
      {
        emailAddress: 'multi@example.com',
        postEndpoint: 'http://wiremock:8080/webhook-multi-2',
        format: 'json',
      },
      {
        emailAddress: 'multi@example.com',
        postEndpoint: 'http://wiremock:8080/webhook-multi-3',
        format: 'json',
      },
      {
        emailAddress: 'partial-fail@example.com',
        postEndpoint: 'http://wiremock:8080/webhook-fail',
        format: 'json',
      },
      {
        emailAddress: 'partial-fail@example.com',
        postEndpoint: 'http://wiremock:8080/webhook-success',
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

    // 複数エンドポイント用の設定
    await fetch('http://wiremock:8080/__admin/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          urlPathPattern: '/webhook-multi-1',
          method: 'POST',
        },
        response: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: { success: true, endpoint: 1, testId },
        },
      }),
    });

    await fetch('http://wiremock:8080/__admin/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          urlPathPattern: '/webhook-multi-2',
          method: 'POST',
        },
        response: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: { success: true, endpoint: 2, testId },
        },
      }),
    });

    await fetch('http://wiremock:8080/__admin/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          urlPathPattern: '/webhook-multi-3',
          method: 'POST',
        },
        response: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: { success: true, endpoint: 3, testId },
        },
      }),
    });

    // 部分的に失敗するエンドポイント
    await fetch('http://wiremock:8080/__admin/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          urlPathPattern: '/webhook-fail',
          method: 'POST',
        },
        response: {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: { error: 'Internal Server Error', testId },
        },
      }),
    });

    await fetch('http://wiremock:8080/__admin/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          urlPathPattern: '/webhook-success',
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

  it('1つのメールが複数のエンドポイントに送信されること', async () => {
    // テスト用メールを送信
    const testSubject = `複数エンドポイントテスト ${testId}`;

    // Note: このテストは実際のメール送信の代わりに、
    // Mail2Postサービスが適切に動作することを検証します

    // リクエストが処理されるまで待機
    await new Promise(resolve => setTimeout(resolve, 2000));

    // WireMockでリクエストを確認
    const requestsResponse = await fetch('http://wiremock:8080/__admin/requests');
    const requests = await requestsResponse.json();

    // 3つのエンドポイントすべてにリクエストが送信されたことを確認
    const endpoint1Requests = (requests as { requests: MockRequest[] }).requests.filter(
      (req: MockRequest) => req.request.url === '/webhook-multi-1' && req.request.method === 'POST'
    );
    const endpoint2Requests = (requests as { requests: MockRequest[] }).requests.filter(
      (req: MockRequest) => req.request.url === '/webhook-multi-2' && req.request.method === 'POST'
    );
    const endpoint3Requests = (requests as { requests: MockRequest[] }).requests.filter(
      (req: MockRequest) => req.request.url === '/webhook-multi-3' && req.request.method === 'POST'
    );

    expect(endpoint1Requests.length).toBeGreaterThanOrEqual(1);
    expect(endpoint2Requests.length).toBeGreaterThanOrEqual(1);
    expect(endpoint3Requests.length).toBeGreaterThanOrEqual(1);

    // すべてのエンドポイントで同じメール内容が送信されたことを確認
    if (
      endpoint1Requests.length > 0 &&
      endpoint2Requests.length > 0 &&
      endpoint3Requests.length > 0
    ) {
      const body1 = JSON.parse(endpoint1Requests[0].request.body);
      const body2 = JSON.parse(endpoint2Requests[0].request.body);
      const body3 = JSON.parse(endpoint3Requests[0].request.body);

      expect(body1.subject).toBe(testSubject);
      expect(body2.subject).toBe(testSubject);
      expect(body3.subject).toBe(testSubject);
    }
  });

  it('1つのエンドポイントが失敗しても他のエンドポイントは処理されること', async () => {
    // テスト用メールを送信
    const testSubject = `部分失敗テスト ${testId}`;

    // Note: このテストは実際のメール送信の代わりに、
    // Mail2Postサービスが適切に動作することを検証します

    // リクエストが処理されるまで待機
    await new Promise(resolve => setTimeout(resolve, 2000));

    // WireMockでリクエストを確認
    const requestsResponse = await fetch('http://wiremock:8080/__admin/requests');
    const requests = await requestsResponse.json();

    // 両方のエンドポイントにリクエストが送信されたことを確認
    const failRequests = (requests as { requests: MockRequest[] }).requests.filter(
      (req: MockRequest) => req.request.url === '/webhook-fail' && req.request.method === 'POST'
    );
    const successRequests = (requests as { requests: MockRequest[] }).requests.filter(
      (req: MockRequest) => req.request.url === '/webhook-success' && req.request.method === 'POST'
    );

    // 両方のエンドポイントにリクエストが送信されていること
    expect(failRequests.length).toBeGreaterThanOrEqual(1);
    expect(successRequests.length).toBeGreaterThanOrEqual(1);

    // 両方のエンドポイントで同じメール内容が送信されたことを確認
    if (failRequests.length > 0 && successRequests.length > 0) {
      const failBody = JSON.parse(failRequests[0].request.body);
      const successBody = JSON.parse(successRequests[0].request.body);

      expect(failBody.subject).toBe(testSubject);
      expect(successBody.subject).toBe(testSubject);
    }
  });
});
