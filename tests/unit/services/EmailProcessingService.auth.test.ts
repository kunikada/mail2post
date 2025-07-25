/**
 * EmailProcessingService認証機能テスト
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { EmailProcessingService } from '@services/EmailProcessingService';
import { Route } from '@domain/models/Route';
import { SESEventRecord } from 'aws-lambda';
import {
  MockEmailRepository,
  MockRouteRepository,
  createMockSESRecord,
  mockFetch,
  setupTestEnvironment,
} from './EmailProcessingService.test-utils';

describe('EmailProcessingService - 認証機能', () => {
  // テスト前の準備
  beforeEach(() => {
    setupTestEnvironment();
  });

  // APIキー認証のテスト
  it('should set x-api-key header for apikey auth type', async () => {
    // モックリポジトリのセットアップ（APIキー認証）
    const routeRepository = new MockRouteRepository([
      new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://api.example.com/webhook',
        format: 'json',
        authType: 'apikey',
        authToken: 'test-api-key-123',
      }),
    ]);
    const emailRepository = new MockEmailRepository();

    // サービスの作成
    const service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

    // テスト用のSESイベントレコード
    const record: SESEventRecord = createMockSESRecord({
      messageId: 'test-message-id',
      recipient: 'test@example.com',
      subject: 'API Key Test',
    });

    // 処理実行
    const result = await service.processEmail(record);

    // 検証 - 処理が成功することを確認
    expect(result.success).toBe(true);

    // fetchが呼ばれたことを確認
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // fetchの引数を確認
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/webhook');

    const headers = options?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-api-key-123');
    expect(headers['Content-Type']).toBe('application/json');
  });

  // Bearer token認証のテスト
  it('should set Authorization header for bearer auth type', async () => {
    // モックリポジトリのセットアップ（Bearer認証）
    const routeRepository = new MockRouteRepository([
      new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://api.example.com/webhook',
        format: 'json',
        authType: 'bearer',
        authToken: 'test-bearer-token-123',
      }),
    ]);
    const emailRepository = new MockEmailRepository();

    // サービスの作成
    const service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

    // テスト用のSESイベントレコード
    const record: SESEventRecord = createMockSESRecord({
      messageId: 'test-message-id',
      recipient: 'test@example.com',
      subject: 'Bearer Token Test',
    });

    // 処理実行
    const result = await service.processEmail(record);

    // 検証 - 処理が成功することを確認
    expect(result.success).toBe(true);

    // fetchが呼ばれたことを確認
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // fetchの引数を確認
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/webhook');

    const headers = options?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-bearer-token-123');
    expect(headers['Content-Type']).toBe('application/json');
  });

  // 認証なしのテスト
  it('should not set auth headers when no auth is configured', async () => {
    // モックリポジトリのセットアップ（認証なし）
    const routeRepository = new MockRouteRepository([
      new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://api.example.com/webhook',
        format: 'json',
        // authType, authTokenを設定しない
      }),
    ]);
    const emailRepository = new MockEmailRepository();

    // サービスの作成
    const service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

    // テスト用のSESイベントレコード
    const record: SESEventRecord = createMockSESRecord({
      messageId: 'test-message-id',
      recipient: 'test@example.com',
      subject: 'No Auth Test',
    });

    // 処理実行
    const result = await service.processEmail(record);

    // 検証 - 処理が成功することを確認
    expect(result.success).toBe(true);

    // fetchが呼ばれたことを確認
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // fetchの引数を確認
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/webhook');

    const headers = options?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBeUndefined();
    expect(headers['Authorization']).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
  });
});
