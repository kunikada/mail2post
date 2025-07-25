/**
 * EmailProcessingServiceフォーマット処理テスト
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

describe('EmailProcessingService - フォーマット処理', () => {
  // テスト前の準備
  beforeEach(() => {
    setupTestEnvironment();
  });

  describe('raw format tests', () => {
    it('should send raw text with contentSelection "full"', async () => {
      const routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api.example.com/webhook',
          format: 'raw',
          contentSelection: 'full',
        }),
      ]);
      const emailRepository = new MockEmailRepository();

      // モックS3EmailServiceを作成し、本文データを設定
      const mockS3EmailService = new MockS3EmailService();
      mockS3EmailService.setEmailData('test-raw-full', {
        text: 'This is the full email body content.',
        html: undefined,
        subject: 'Raw Format Test',
      });

      const service = new EmailProcessingService(
        routeRepository,
        emailRepository,
        mockFetch,
        new MockSESEmailExtractor(mockS3EmailService)
      );

      const record = createMockSESRecord({
        messageId: 'test-raw-full',
        recipient: 'test@example.com',
        subject: 'Raw Format Test',
        from: 'sender@example.com',
      });

      const result = await service.processEmail(record);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [, options] = mockFetch.mock.calls[0];

      const headers = options?.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('text/plain');

      // rawフォーマットの内容を確認
      const body = options?.body as string;
      expect(body).toContain('From: Sender <sender@example.com>');
      expect(body).toContain('To: test@example.com');
      expect(body).toContain('Subject: Raw Format Test');
      expect(body).toContain('This is the full email body content.');
    });

    it('should send raw text with contentSelection "subject"', async () => {
      const routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api.example.com/webhook',
          format: 'raw',
          contentSelection: 'subject',
        }),
      ]);
      const emailRepository = new MockEmailRepository();

      const service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

      const record = createMockSESRecord({
        messageId: 'test-raw-subject',
        recipient: 'test@example.com',
        subject: 'Raw Subject Test',
      });

      const result = await service.processEmail(record);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [, options] = mockFetch.mock.calls[0];
      const headers = options?.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('text/plain');

      // 件名のみが送信されることを確認
      const body = options?.body as string;
      expect(body).toBe('Raw Subject Test');
    });

    it('should send raw text with contentSelection "body"', async () => {
      const routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api.example.com/webhook',
          format: 'raw',
          contentSelection: 'body',
        }),
      ]);
      const emailRepository = new MockEmailRepository();

      // モックS3EmailServiceを作成し、本文データを設定
      const mockS3EmailService = new MockS3EmailService();
      mockS3EmailService.setEmailData('test-raw-body', {
        text: 'This is the raw body content.',
        html: undefined,
        subject: 'Raw Body Test',
      });

      const service = new EmailProcessingService(
        routeRepository,
        emailRepository,
        mockFetch,
        new MockSESEmailExtractor(mockS3EmailService)
      );

      const record = createMockSESRecord({
        messageId: 'test-raw-body',
        recipient: 'test@example.com',
        subject: 'Raw Body Test',
      });

      const result = await service.processEmail(record);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [, options] = mockFetch.mock.calls[0];
      const headers = options?.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('text/plain');

      // 本文のみが送信されることを確認
      const body = options?.body as string;
      expect(body).toBe('This is the raw body content.');
    });
  });

  describe('htmlMode feature', () => {
    it('should handle htmlMode "text" correctly', async () => {
      const routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api.example.com/webhook',
          format: 'json',
          contentSelection: 'body',
          htmlMode: 'text',
        }),
      ]);
      const emailRepository = new MockEmailRepository();

      // モックS3EmailServiceを作成し、HTMLコンテンツを設定
      const mockS3EmailService = new MockS3EmailService();
      mockS3EmailService.setEmailData('test-html-text', {
        text: 'This is plain text content.',
        html: '<p>This is <strong>HTML</strong> content.</p>',
        subject: 'HTML Text Mode Test',
      });

      const service = new EmailProcessingService(
        routeRepository,
        emailRepository,
        mockFetch,
        new MockSESEmailExtractor(mockS3EmailService)
      );

      // HTMLコンテンツを含むメールのモックレコードを作成
      const record = createMockSESRecord({
        messageId: 'test-html-text',
        recipient: 'test@example.com',
        subject: 'HTML Text Mode Test',
      });

      const result = await service.processEmail(record);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [, options] = mockFetch.mock.calls[0];
      const bodyData = JSON.parse(options.body);

      // textモードの場合、テキストのみが返される
      expect(bodyData).toHaveProperty('body', 'This is plain text content.');
    });

    it('should handle htmlMode "html" correctly', async () => {
      const routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api.example.com/webhook',
          format: 'json',
          contentSelection: 'body',
          htmlMode: 'html',
        }),
      ]);
      const emailRepository = new MockEmailRepository();

      // モックS3EmailServiceを作成し、HTMLコンテンツを設定
      const mockS3EmailService = new MockS3EmailService();
      mockS3EmailService.setEmailData('test-html-html', {
        text: 'This is plain text content.',
        html: '<p>This is <strong>HTML</strong> content.</p>',
        subject: 'HTML HTML Mode Test',
      });

      const service = new EmailProcessingService(
        routeRepository,
        emailRepository,
        mockFetch,
        new MockSESEmailExtractor(mockS3EmailService)
      );

      const record = createMockSESRecord({
        messageId: 'test-html-html',
        recipient: 'test@example.com',
        subject: 'HTML HTML Mode Test',
      });

      const result = await service.processEmail(record);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [, options] = mockFetch.mock.calls[0];
      const bodyData = JSON.parse(options.body);

      // htmlモードの場合、HTMLコンテンツが返される
      expect(bodyData).toHaveProperty('body', '<p>This is <strong>HTML</strong> content.</p>');
    });

    it('should handle htmlMode "both" correctly with actual HTML content', async () => {
      const routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api.example.com/webhook',
          format: 'json',
          contentSelection: 'body',
          htmlMode: 'both',
        }),
      ]);
      const emailRepository = new MockEmailRepository();

      // モックS3EmailServiceを作成し、HTMLコンテンツを設定
      const mockS3EmailService = new MockS3EmailService();
      mockS3EmailService.setEmailData('test-html-both-actual', {
        text: 'This is plain text content.',
        html: '<p>This is <strong>HTML</strong> content.</p>',
        subject: 'HTML Both Mode Test with Content',
      });

      const service = new EmailProcessingService(
        routeRepository,
        emailRepository,
        mockFetch,
        new MockSESEmailExtractor(mockS3EmailService)
      );

      const record = createMockSESRecord({
        messageId: 'test-html-both-actual',
        recipient: 'test@example.com',
        subject: 'HTML Both Mode Test with Content',
      });

      const result = await service.processEmail(record);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [, options] = mockFetch.mock.calls[0];
      const bodyData = JSON.parse(options.body);

      // bothモードの場合、body.textとbody.htmlの両方が含まれる
      expect(bodyData).toHaveProperty('body');
      expect(typeof bodyData.body).toBe('object');
      expect(bodyData.body).toHaveProperty('text', 'This is plain text content.');
      expect(bodyData.body).toHaveProperty('html', '<p>This is <strong>HTML</strong> content.</p>');
    });

    it('should handle htmlMode "html" correctly when no HTML content exists', async () => {
      const routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api.example.com/webhook',
          format: 'json',
          contentSelection: 'body',
          htmlMode: 'html',
        }),
      ]);
      const emailRepository = new MockEmailRepository();

      // モックS3EmailServiceを作成し、HTMLコンテンツなし（テキストのみ）の設定
      const mockS3EmailService = new MockS3EmailService();
      mockS3EmailService.setEmailData('test-html-html-nohtml', {
        text: 'This is plain text content only.',
        html: undefined,
        subject: 'HTML HTML Mode Test without HTML',
      });

      const service = new EmailProcessingService(
        routeRepository,
        emailRepository,
        mockFetch,
        new MockSESEmailExtractor(mockS3EmailService)
      );

      const record = createMockSESRecord({
        messageId: 'test-html-html-nohtml',
        recipient: 'test@example.com',
        subject: 'HTML HTML Mode Test without HTML',
      });

      const result = await service.processEmail(record);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [, options] = mockFetch.mock.calls[0];
      const bodyData = JSON.parse(options.body);

      // htmlモードでHTMLが存在しない場合、テキストが返される
      expect(bodyData).toHaveProperty('body', 'This is plain text content only.');
    });
  });
});
