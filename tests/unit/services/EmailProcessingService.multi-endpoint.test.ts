/**
 * EmailProcessingService複数エンドポイント処理テスト
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

describe('EmailProcessingService - 複数エンドポイント', () => {
  // テスト前の準備
  beforeEach(() => {
    setupTestEnvironment();
  });

  // テストケース: 複数のエンドポイントに送信する場合
  it('should process email and send to multiple endpoints', async () => {
    // モックリポジトリのセットアップ - 同じメールアドレスに複数のルートを設定
    const routeRepository = new MockRouteRepository([
      new Route({
        emailAddress: 'multi@example.com',
        postEndpoint: 'https://api1.example.com/webhook',
        format: 'json',
      }),
      new Route({
        emailAddress: 'multi@example.com',
        postEndpoint: 'https://api2.example.com/webhook',
        format: 'json',
      }),
    ]);
    const emailRepository = new MockEmailRepository();

    // サービスの作成
    const service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

    // モックのSESイベントレコード
    const record = createMockSESRecord({
      messageId: 'test-multi-123',
      recipient: 'multi@example.com',
      subject: 'Multi Endpoint Test',
    });

    // 処理実行
    const result = await service.processEmail(record);

    // デバッグ用出力
    console.log('result:', result);
    console.log('mockFetch.mock.calls:', mockFetch.mock.calls);

    // 検証
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);

    // fetchが2回呼ばれたことを確認
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // 1つ目のエンドポイント呼び出し検証
    const [url1, options1] = mockFetch.mock.calls[0];
    expect(url1).toBe('https://api1.example.com/webhook');
    expect(options1?.method).toBe('POST');

    // 2つ目のエンドポイント呼び出し検証
    const [url2, options2] = mockFetch.mock.calls[1];
    expect(url2).toBe('https://api2.example.com/webhook');
    expect(options2?.method).toBe('POST');

    // X-Mail-Processing-IDヘッダーが含まれていることを確認
    const headers1 = options1.headers as Record<string, string>;
    const headers2 = options2.headers as Record<string, string>;

    // 2つ目は1つ目と異なるIDを持つことを確認
    expect(headers1['X-Mail-Processing-ID']).toBeDefined();
    expect(headers2['X-Mail-Processing-ID']).toBeDefined();
    expect(headers1['X-Mail-Processing-ID']).not.toEqual(headers2['X-Mail-Processing-ID']);

    // emailRepositoryにメールが保存されたことを確認
    const savedEmails = await emailRepository.findAll();
    expect(savedEmails.length).toBe(1);
    expect(savedEmails[0].subject).toBe('Multi Endpoint Test');
  });

  // テストケース: 一部のエンドポイントが失敗する場合
  it('should handle partial success for multiple endpoints', async () => {
    // モックリポジトリのセットアップ - 同じメールアドレスに複数のルートを設定
    const routeRepository = new MockRouteRepository([
      new Route({
        emailAddress: 'partial-fail@example.com',
        postEndpoint: 'https://success.example.com/webhook',
        format: 'json',
        // テスト高速化のためにリトライ回数を1回、遅延を10msに設定
        retryCount: 1,
        retryDelay: 10,
      }),
      new Route({
        emailAddress: 'partial-fail@example.com',
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

    // 成功と失敗の応答を設定
    mockFetch.mockImplementation(url => {
      if (url.includes('success')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => 'Success',
          json: async () => ({ status: 'success' }),
        } as Response);
      } else {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'Error',
          json: async () => ({ status: 'error' }),
        } as Response);
      }
    });

    // モックのSESイベントレコード
    const record = createMockSESRecord({
      messageId: 'test-partial-fail-123',
      recipient: 'partial-fail@example.com',
      subject: 'Partial Fail Test',
    });

    // 処理実行
    const result = await service.processEmail(record);

    // 検証 - 少なくとも1つが成功していれば全体として成功
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.message).toContain('少なくとも1つのエンドポイントが成功');

    // エンドポイントごとにfetchが呼ばれたことを確認
    const successCalls = mockFetch.mock.calls.filter(call => call[0].includes('success'));
    const failCalls = mockFetch.mock.calls.filter(call => call[0].includes('fail'));

    expect(successCalls.length).toBeGreaterThanOrEqual(1); // 成功エンドポイントへの呼び出し
    expect(failCalls.length).toBeGreaterThanOrEqual(1); // 失敗エンドポイントへの呼び出し (リトライ含む)

    // emailRepositoryにメールが保存されたことを確認
    const savedEmails = await emailRepository.findAll();
    expect(savedEmails.length).toBe(1);
    expect(savedEmails[0].subject).toBe('Partial Fail Test');
  });

  // テストケース: 全てのエンドポイントが失敗する場合
  it('should handle all endpoints failing', async () => {
    // モックリポジトリのセットアップ - 同じメールアドレスに複数のルートを設定
    const routeRepository = new MockRouteRepository([
      new Route({
        emailAddress: 'all-fail@example.com',
        postEndpoint: 'https://fail1.example.com/webhook',
        format: 'json',
        // テスト高速化のためにリトライ回数を1回、遅延を10msに設定
        retryCount: 1,
        retryDelay: 10,
      }),
      new Route({
        emailAddress: 'all-fail@example.com',
        postEndpoint: 'https://fail2.example.com/webhook',
        format: 'json',
        // テスト高速化のためにリトライ回数を1回、遅延を10msに設定
        retryCount: 1,
        retryDelay: 10,
      }),
    ]);
    const emailRepository = new MockEmailRepository();

    // サービスの作成
    const service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

    // 全て失敗の応答を設定
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Error',
      json: async () => ({ status: 'error' }),
    } as Response);

    // モックのSESイベントレコード
    const record = createMockSESRecord({
      messageId: 'test-all-fail-123',
      recipient: 'all-fail@example.com',
      subject: 'All Fail Test',
    });

    // 処理実行
    const result = await service.processEmail(record);

    // 検証 - 全て失敗した場合は全体として失敗
    expect(result.success).toBe(false);
    expect(result.message).toContain('全てのエンドポイントが失敗');

    // 両方のエンドポイントに対して呼び出しがあることを確認
    const fail1Calls = mockFetch.mock.calls.filter(call => call[0].includes('fail1'));
    const fail2Calls = mockFetch.mock.calls.filter(call => call[0].includes('fail2'));

    expect(fail1Calls.length).toBeGreaterThanOrEqual(1); // 1つ目のエンドポイントへの呼び出し
    expect(fail2Calls.length).toBeGreaterThanOrEqual(1); // 2つ目のエンドポイントへの呼び出し

    // emailRepositoryにメールが保存されたことを確認
    const savedEmails = await emailRepository.findAll();
    expect(savedEmails.length).toBe(1);
    expect(savedEmails[0].subject).toBe('All Fail Test');
  });
});
