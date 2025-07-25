/**
 * EmailProcessingService基本機能テスト
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { EmailProcessingService } from '@services/EmailProcessingService';
import { Route } from '@domain/models/Route';
import {
  MockEmailRepository,
  MockRouteRepository,
  createMockSESRecord,
  mockFetch,
  setupTestEnvironment,
} from './EmailProcessingService.test-utils';

describe('EmailProcessingService - 基本機能', () => {
  // テスト前の準備
  beforeEach(() => {
    setupTestEnvironment();
  });

  // テストケース: 正しいルートが見つかり、POSTが成功する場合
  it('should process email and send to endpoint successfully', async () => {
    // モックリポジトリのセットアップ
    const routeRepository = new MockRouteRepository([
      new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://api.example.com/webhook',
        format: 'json',
      }),
    ]);
    const emailRepository = new MockEmailRepository();

    // サービスの作成
    const service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

    // モックのSESイベントレコード
    const record = createMockSESRecord({
      messageId: 'test123',
      recipient: 'test@example.com',
      subject: 'Test Email',
    });

    // 処理実行
    const result = await service.processEmail(record);

    // デバッグ用出力
    console.log('result:', result);
    console.log('mockFetch.mock.calls:', mockFetch.mock.calls);

    // 検証
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);

    // fetchが正しく呼ばれたことを確認
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/webhook');
    expect(options?.method).toBe('POST');

    // X-Mail-Processing-IDヘッダーが正しく設定されていることを確認
    const headers = options?.headers as Record<string, string>;
    expect(headers['X-Mail-Processing-ID']).toContain('-1'); // 通し番号が付与されていること

    // emailRepositoryにメールが保存されたことを確認
    const savedEmails = await emailRepository.findAll();
    expect(savedEmails.length).toBe(1);
    expect(savedEmails[0].subject).toBe('Test Email');
  });

  // テストケース: ルートが見つからない場合
  it('should return error when no route is found', async () => {
    // 空のリポジトリでセットアップ
    const routeRepository = new MockRouteRepository();
    const emailRepository = new MockEmailRepository();

    const service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

    // モックのSESイベントレコード
    const record = createMockSESRecord({
      messageId: 'test456',
      recipient: 'unknown@example.com',
      subject: 'No Route Email',
    });

    // 処理実行
    const result = await service.processEmail(record);

    // 検証
    expect(result.success).toBe(false);
    expect(result.message).toContain('ルート設定が見つかりません');

    // fetchが呼ばれていないことを確認
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // テストケース: エンドポイントが失敗する場合
  it('should handle endpoint failure with retry', async () => {
    // モックリポジトリのセットアップ
    const routeRepository = new MockRouteRepository([
      new Route({
        emailAddress: 'fail@example.com',
        postEndpoint: 'https://fail.example.com/webhook',
        format: 'json',
        // テスト高速化のためにリトライ回数を1回、遅延を10msに設定
        retryCount: 1,
        retryDelay: 10,
      }),
    ]);
    const emailRepository = new MockEmailRepository();

    // サービスの作成
    const service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

    // 失敗レスポンスを設定
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Error',
      json: async () => ({ status: 'error' }),
    } as Response);

    // モックのSESイベントレコード
    const record = createMockSESRecord({
      messageId: 'test-fail-123',
      recipient: 'fail@example.com',
      subject: 'Fail Test',
    });

    // 処理実行
    const result = await service.processEmail(record);

    // 検証 - 失敗することを確認
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(500);

    // リトライが実行されることを確認（初回 + リトライ1回 = 2回）
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // emailRepositoryにメールが保存されたことを確認
    const savedEmails = await emailRepository.findAll();
    expect(savedEmails.length).toBe(1);
    expect(savedEmails[0].subject).toBe('Fail Test');
  });
});
