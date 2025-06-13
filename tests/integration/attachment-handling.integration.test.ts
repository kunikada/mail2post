import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

// 型定義
interface Attachment {
  filename: string;
  content: string;
  contentType: string;
}

interface AttachmentReference {
  filename: string;
  contentType: string;
  content?: string;
}

interface RequestBody {
  attachments?: Attachment[];
  attachmentReferences?: AttachmentReference[];
}

interface MockRequest {
  request: {
    url: string;
    method: string;
    body: string;
  };
}

interface DevConfig {
  routes: Array<{
    emailAddress: string;
    postEndpoint: string;
    format: string;
    transformationOptions?: {
      includeAttachments?: boolean;
      attachmentReferences?: boolean;
    };
  }>;
}

describe('添付ファイル処理統合テスト', () => {
  // 一意のテストID（テスト間の区別のため）
  const testId = Date.now().toString();

  // テスト用添付ファイルの作成
  const testFilePath = path.join(process.cwd(), 'tests', `test-attachment-${testId}.txt`);
  const testImagePath = path.join(process.cwd(), 'tests', `test-image-${testId}.png`);

  beforeAll(async () => {
    // テスト用のルート設定を作成
    const testRoutes = [
      {
        emailAddress: 'attachments@example.com',
        postEndpoint: 'http://wiremock:8080/webhook-attachments',
        format: 'json',
        transformationOptions: {
          includeAttachments: true,
        },
      },
      {
        emailAddress: 'no-attachments@example.com',
        postEndpoint: 'http://wiremock:8080/webhook-no-attachments',
        format: 'json',
        transformationOptions: {
          includeAttachments: false,
        },
      },
      {
        emailAddress: 'attachment-references@example.com',
        postEndpoint: 'http://wiremock:8080/webhook-attachment-refs',
        format: 'json',
        transformationOptions: {
          attachmentReferences: true,
        },
      },
    ];

    // 設定ファイルを更新
    const configPath = './config/dev.json';
    const existingConfig: DevConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    existingConfig.routes = testRoutes;
    await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));

    // テスト用添付ファイルを作成
    await fs.writeFile(testFilePath, `これはテスト添付ファイルです。ID: ${testId}`);

    // 簡単な画像ファイルを作成（小さな空のPNG）
    const emptyPngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64'
    );
    await fs.writeFile(testImagePath, emptyPngBuffer);

    // WireMockのエンドポイント設定
    await fetch('http://wiremock:8080/__admin/mappings/reset', { method: 'POST' });

    // 添付ファイルを含めるエンドポイント
    await fetch('http://wiremock:8080/__admin/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          urlPathPattern: '/webhook-attachments',
          method: 'POST',
        },
        response: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: { success: true, testId },
        },
      }),
    });

    // 添付ファイルを含めないエンドポイント
    await fetch('http://wiremock:8080/__admin/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          urlPathPattern: '/webhook-no-attachments',
          method: 'POST',
        },
        response: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: { success: true, testId },
        },
      }),
    });

    // 添付ファイル参照情報を含めるエンドポイント
    await fetch('http://wiremock:8080/__admin/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          urlPathPattern: '/webhook-attachment-refs',
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

  // テスト後にテストファイルを削除
  afterAll(async () => {
    try {
      await fs.unlink(testFilePath);
      await fs.unlink(testImagePath);
    } catch (error) {
      console.warn('テストファイルの削除に失敗しました:', error);
    }
  });

  it('添付ファイルがJSON形式で送信されること', async () => {
    // テスト用メールを送信（添付ファイル付き）
    // const testSubject = `添付ファイルテスト ${testId}`; // 現在未使用

    // Note: このテストは実際のメール送信の代わりに、
    // Mail2Postサービスが適切に動作することを検証します

    // リクエストが処理されるまで待機
    await new Promise(resolve => setTimeout(resolve, 2000));

    // WireMockでリクエストを確認
    const requestsResponse = await fetch('http://wiremock:8080/__admin/requests');
    const requests = await requestsResponse.json();

    // 期待するリクエストが行われたことを確認
    const relevantRequest = (requests as { requests: MockRequest[] }).requests.find(
      (req: MockRequest) =>
        req.request.url === '/webhook-attachments' && req.request.method === 'POST'
    );

    expect(relevantRequest).toBeDefined();

    if (relevantRequest) {
      // 添付ファイルが含まれていることを確認
      const body: RequestBody = JSON.parse(relevantRequest.request.body);
      expect(body.attachments).toBeDefined();
      expect(body.attachments?.length).toBeGreaterThanOrEqual(2);

      // テキスト添付ファイルを確認
      const textAttachment = body.attachments?.find((a: Attachment) =>
        a.filename.includes('test-file')
      );
      expect(textAttachment).toBeDefined();
      expect(textAttachment?.content).toContain(`これはテスト添付ファイル`);
      expect(textAttachment?.contentType).toContain('text/plain');

      // 画像添付ファイルを確認
      const imageAttachment = body.attachments?.find((a: Attachment) =>
        a.filename.includes('test-image')
      );
      expect(imageAttachment).toBeDefined();
      expect(imageAttachment?.content).toBeDefined(); // Base64エンコードされた内容
      expect(imageAttachment?.contentType).toContain('image/png');
    }
  });

  it('添付ファイルが除外されること', async () => {
    // テスト用メールを送信（添付ファイル付き）
    // const testSubject = `添付ファイル除外テスト ${testId}`; // 現在未使用

    // Note: このテストは実際のメール送信の代わりに、
    // Mail2Postサービスが適切に動作することを検証します

    // リクエストが処理されるまで待機
    await new Promise(resolve => setTimeout(resolve, 2000));

    // WireMockでリクエストを確認
    const requestsResponse = await fetch('http://wiremock:8080/__admin/requests');
    const requests = await requestsResponse.json();

    // 期待するリクエストが行われたことを確認
    const relevantRequest = (requests as { requests: MockRequest[] }).requests.find(
      (req: MockRequest) =>
        req.request.url === '/webhook-no-attachments' && req.request.method === 'POST'
    );

    expect(relevantRequest).toBeDefined();

    if (relevantRequest) {
      // 添付ファイルが含まれていないことを確認
      const body: RequestBody = JSON.parse(relevantRequest.request.body);
      expect(body.attachments).toBeUndefined();
    }
  });

  it('添付ファイル参照情報が送信されること', async () => {
    // テスト用メールを送信（添付ファイル付き）
    // const testSubject = `添付ファイル参照テスト ${testId}`; // 現在未使用

    // Note: このテストは実際のメール送信の代わりに、
    // Mail2Postサービスが適切に動作することを検証します

    // リクエストが処理されるまで待機
    await new Promise(resolve => setTimeout(resolve, 2000));

    // WireMockでリクエストを確認
    const requestsResponse = await fetch('http://wiremock:8080/__admin/requests');
    const requests = await requestsResponse.json();

    // 期待するリクエストが行われたことを確認
    const relevantRequest = (requests as { requests: MockRequest[] }).requests.find(
      (req: MockRequest) =>
        req.request.url === '/webhook-attachment-refs' && req.request.method === 'POST'
    );

    expect(relevantRequest).toBeDefined();

    if (relevantRequest) {
      // 添付ファイル参照情報が含まれていることを確認
      const body: RequestBody = JSON.parse(relevantRequest.request.body);
      expect(body.attachmentReferences).toBeDefined();
      expect(body.attachmentReferences?.length).toBeGreaterThanOrEqual(2);

      // 参照情報にはファイル名とコンテンツタイプが含まれているが、実際の内容は含まれていないこと
      const textAttachmentRef = body.attachmentReferences?.find((a: AttachmentReference) =>
        a.filename.includes('test-file-ref')
      );
      expect(textAttachmentRef).toBeDefined();
      expect(textAttachmentRef?.filename).toBeDefined();
      expect(textAttachmentRef?.contentType).toBeDefined();
      expect(textAttachmentRef?.content).toBeUndefined(); // 内容は含まれていない

      const imageAttachmentRef = body.attachmentReferences?.find((a: AttachmentReference) =>
        a.filename.includes('test-image-ref')
      );
      expect(imageAttachmentRef).toBeDefined();
      expect(imageAttachmentRef?.filename).toBeDefined();
      expect(imageAttachmentRef?.contentType).toBeDefined();
      expect(imageAttachmentRef?.content).toBeUndefined(); // 内容は含まれていない
    }
  });
});
