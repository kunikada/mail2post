/**
 * EmailProcessingServiceコンテンツ選択機能テスト
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { EmailProcessingService } from '@services/EmailProcessingService';
import { Route } from '@domain/models/Route';
import {
  MockEmailRepository,
  MockRouteRepository,
  MockS3EmailService,
  MockSESEmailExtractor,
  createMockSESRecord,
  mockFetch,
  setupTestEnvironment,
} from './EmailProcessingService.test-utils';

describe('EmailProcessingService - contentSelection', () => {
  let routeRepository: MockRouteRepository;
  let emailRepository: MockEmailRepository;
  let service: EmailProcessingService;

  beforeEach(() => {
    setupTestEnvironment();
    emailRepository = new MockEmailRepository();
  });

  it('contentSelection: full - 全ての情報を送信', async () => {
    // フル情報送信のルート設定
    routeRepository = new MockRouteRepository([
      new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://api.example.com/webhook',
        format: 'json',
        contentSelection: 'full',
      }),
    ]);

    service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

    const record = createMockSESRecord({
      messageId: 'test123',
      recipient: 'test@example.com',
      subject: 'Test Subject',
      from: 'sender@example.com',
    });

    // 実行
    await service.processEmail(record);

    // 検証
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/webhook');

    const bodyData = JSON.parse(options.body);
    expect(bodyData).toHaveProperty('id');
    expect(bodyData).toHaveProperty('subject', 'Test Subject');
    expect(bodyData).toHaveProperty('from', 'Sender <sender@example.com>');
    expect(bodyData).toHaveProperty('body.text');
    expect(bodyData).toHaveProperty('headers');
  });

  it('contentSelection: subject - 件名のみを送信', async () => {
    // 件名のみ送信のルート設定
    routeRepository = new MockRouteRepository([
      new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://api.example.com/webhook',
        format: 'json',
        contentSelection: 'subject',
      }),
    ]);

    service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

    const record = createMockSESRecord({
      messageId: 'test123',
      recipient: 'test@example.com',
      subject: 'Test Subject',
      from: 'sender@example.com',
    });

    // 実行
    await service.processEmail(record);

    // 検証
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/webhook');

    const bodyData = JSON.parse(options.body);
    expect(bodyData).toHaveProperty('subject', 'Test Subject');
    // 件名のみなので他の情報は含まれない
    expect(bodyData).not.toHaveProperty('messageId');
    expect(bodyData).not.toHaveProperty('from');
    expect(bodyData).not.toHaveProperty('recipient');
    expect(bodyData).not.toHaveProperty('body');
    expect(bodyData).not.toHaveProperty('to');
    expect(bodyData).not.toHaveProperty('cc');
  });

  it('contentSelection: body - 本文のみを送信', async () => {
    // 本文のみ送信のルート設定
    routeRepository = new MockRouteRepository([
      new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://api.example.com/webhook',
        format: 'json',
        contentSelection: 'body',
      }),
    ]);

    // モックS3EmailServiceを作成し、本文データを設定
    const mockS3EmailService = new MockS3EmailService();
    mockS3EmailService.setEmailData('test123', {
      text: 'This is the email body content.',
      html: undefined,
      subject: 'Test Subject',
    });

    service = new EmailProcessingService(
      routeRepository,
      emailRepository,
      mockFetch,
      new MockSESEmailExtractor(mockS3EmailService)
    );

    const record = createMockSESRecord({
      messageId: 'test123',
      recipient: 'test@example.com',
      subject: 'Test Subject',
      from: 'sender@example.com',
    });

    // 実行
    await service.processEmail(record);

    // 検証
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/webhook');

    const bodyData = JSON.parse(options.body);
    expect(bodyData).toHaveProperty('body', 'This is the email body content.');
    // 本文のみなので他の情報は含まれない
    expect(bodyData).not.toHaveProperty('messageId');
    expect(bodyData).not.toHaveProperty('from');
    expect(bodyData).not.toHaveProperty('recipient');
    expect(bodyData).not.toHaveProperty('subject');
    expect(bodyData).not.toHaveProperty('to');
    expect(bodyData).not.toHaveProperty('cc');
  });

  it('contentSelection: raw形式でsubjectを送信', async () => {
    // RAW形式での件名送信
    routeRepository = new MockRouteRepository([
      new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://api.example.com/webhook',
        format: 'raw',
        contentSelection: 'subject',
      }),
    ]);

    service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

    const record = createMockSESRecord({
      messageId: 'test123',
      recipient: 'test@example.com',
      subject: 'Test Subject',
      from: 'sender@example.com',
    });

    // 実行
    await service.processEmail(record);

    // 検証
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/webhook');
    expect(options.body).toBe('Test Subject');
  });

  it('contentSelection: form形式でbodyを送信', async () => {
    // フォーム形式での本文送信
    routeRepository = new MockRouteRepository([
      new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://api.example.com/webhook',
        format: 'form',
        contentSelection: 'body',
      }),
    ]);

    // モックS3EmailServiceを作成し、本文データを設定
    const mockS3EmailService = new MockS3EmailService();
    mockS3EmailService.setEmailData('test123', {
      text: 'This is the form email body.',
      html: undefined,
      subject: 'Test Subject',
    });

    service = new EmailProcessingService(
      routeRepository,
      emailRepository,
      mockFetch,
      new MockSESEmailExtractor(mockS3EmailService)
    );

    const record = createMockSESRecord({
      messageId: 'test123',
      recipient: 'test@example.com',
      subject: 'Test Subject',
      from: 'sender@example.com',
    });

    // 実行
    await service.processEmail(record);

    // 検証
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/webhook');

    // フォームデータの検証
    const formData = new URLSearchParams(options.body);
    expect(formData.get('body')).toBe('This is the form email body.');
    // 本文のみなので他の情報は含まれない
    expect(formData.has('messageId')).toBe(false);
    expect(formData.has('from')).toBe(false);
    expect(formData.has('recipient')).toBe(false);
    expect(formData.has('subject')).toBe(false);
  });

  // S3からのメール取得失敗時のテスト
  it('should handle S3 email retrieval failure gracefully', async () => {
    const routeRepository = new MockRouteRepository([
      new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://api.example.com/webhook',
        format: 'json',
        contentSelection: 'body',
      }),
    ]);
    const emailRepository = new MockEmailRepository();

    // S3からの取得に失敗するモックサービス（データを設定しない）
    const mockS3EmailService = new MockS3EmailService();
    // データを設定しないため、getEmailFromS3は「Email not found in mock S3」エラーを投げる

    const service = new EmailProcessingService(
      routeRepository,
      emailRepository,
      mockFetch,
      new MockSESEmailExtractor(mockS3EmailService)
    );

    const record = createMockSESRecord({
      messageId: 'test-s3-failure',
      recipient: 'test@example.com',
      subject: 'S3 Failure Test',
      from: 'sender@example.com',
    });

    // 実行
    const result = await service.processEmail(record);

    // S3からの取得に失敗してもフォールバックが動作して成功すること
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/webhook');

    const bodyData = JSON.parse(options.body);
    expect(bodyData).toHaveProperty('body', '(メール本文の取得に失敗しました)');
  });
});
