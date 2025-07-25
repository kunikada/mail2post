/**
 * EmailProcessingService の maxSize と allowedSenders 機能のテスト
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailProcessingService } from '@services/EmailProcessingService';
import { EmailValidator } from '@services/email/EmailValidator';
import { Email } from '@domain/models/Email';
import { Route } from '@domain/models/Route';
import { Attachment } from '@domain/models/Attachment';
import { InMemoryEmailRepository } from '@domain/repositories/InMemoryEmailRepository';
import type { SESEventRecord } from 'aws-lambda';

/**
 * テスト用のモックRouteRepository実装
 */
class MockRouteRepository {
  constructor(private routes: Route[] = []) {}

  async findAllByEmailAddress(emailAddress: string): Promise<Route[]> {
    return this.routes.filter(route => route.emailAddress === emailAddress);
  }

  async findDefault(): Promise<Route | null> {
    return this.routes.find(route => route.isDefault) || null;
  }

  async findAll(): Promise<Route[]> {
    return [...this.routes];
  }

  async findById(id: string): Promise<Route | null> {
    return this.routes.find(route => route.emailAddress === id) || null;
  }

  async save(route: Route): Promise<Route> {
    this.routes.push(route);
    return route;
  }

  async delete(id: string): Promise<boolean> {
    const initialLength = this.routes.length;
    this.routes = this.routes.filter(route => route.emailAddress !== id);
    return this.routes.length !== initialLength;
  }

  async findByEmailAddress(emailAddress: string): Promise<Route | null> {
    return this.routes.find(route => route.emailAddress === emailAddress) || null;
  }

  async reload(): Promise<void> {
    // Mock implementation - do nothing
  }
}

/**
 * SESイベントレコードのモックデータを作成
 */
function createMockSESRecord(options: {
  messageId?: string;
  recipient?: string;
  subject?: string;
  from?: string;
  to?: string[];
}): SESEventRecord {
  const fromEmail = options.from || 'sender@example.com';
  const fromHeader = fromEmail.includes('<') ? fromEmail : `Sender <${fromEmail}>`;
  const recipient = options.recipient || 'test@example.com';

  return {
    ses: {
      mail: {
        messageId: options.messageId || 'test-message-id',
        timestamp: new Date().toISOString(),
        source: fromEmail,
        destination: [recipient],
        commonHeaders: {
          subject: options.subject || 'Test Subject',
          from: [fromHeader],
          to: options.to || [recipient],
        },
        headers: [
          { name: 'Subject', value: options.subject || 'Test Subject' },
          { name: 'From', value: fromHeader },
          { name: 'To', value: recipient },
        ],
      },
      receipt: {
        timestamp: new Date().toISOString(),
        recipients: [recipient],
        action: {
          type: 'Lambda',
          functionArn: 'arn:aws:lambda:test:function:test-function',
        },
      },
    },
  } as SESEventRecord;
}

describe('EmailProcessingService - maxSize と allowedSenders 機能', () => {
  let routeRepository: MockRouteRepository;
  let emailRepository: InMemoryEmailRepository;
  let service: EmailProcessingService;
  let mockFetch: ReturnType<typeof vi.fn>;
  let emailValidator: EmailValidator;

  beforeEach(() => {
    routeRepository = new MockRouteRepository();
    emailRepository = new InMemoryEmailRepository();
    mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
    });
    service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);
    emailValidator = new EmailValidator();
    vi.clearAllMocks();
  });

  // EmailValidator 単体テスト（検証ロジックが正しく動作することを確認）
  describe('EmailValidator単体テスト', () => {
    it('メールサイズ制限チェックが正しく動作する', () => {
      const route = new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://api.example.com/webhook',
        maxSize: 100, // 100バイト制限
      });

      const smallEmail = new Email({
        id: 'test',
        timestamp: new Date(),
        subject: 'Test',
        from: 'test@example.com',
        to: ['recipient@example.com'],
        recipient: 'recipient@example.com',
        textBody: 'Small',
        attachments: [],
        headers: {},
      });

      const largeEmail = new Email({
        id: 'test',
        timestamp: new Date(),
        subject: 'Test',
        from: 'test@example.com',
        to: ['recipient@example.com'],
        recipient: 'recipient@example.com',
        textBody:
          'Very long text content that exceeds the 100 byte limit significantly to trigger validation error',
        attachments: [],
        headers: {},
      });

      // 小さなメールは検証を通る
      expect(() => emailValidator.validateSize(smallEmail, route)).not.toThrow();

      // 大きなメールは検証エラーが発生
      expect(() => emailValidator.validateSize(largeEmail, route)).toThrow(
        'メールサイズが制限を超えています'
      );
    });

    it('送信者制限チェックが正しく動作する', () => {
      const route = new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://api.example.com/webhook',
        allowedSenders: ['allowed@example.com', '@trusted.com'],
      });

      const allowedEmail = new Email({
        id: 'test',
        timestamp: new Date(),
        subject: 'Test',
        from: 'allowed@example.com',
        to: ['recipient@example.com'],
        recipient: 'recipient@example.com',
        textBody: 'Test',
        attachments: [],
        headers: {},
      });

      const domainAllowedEmail = new Email({
        id: 'test',
        timestamp: new Date(),
        subject: 'Test',
        from: 'user@trusted.com',
        to: ['recipient@example.com'],
        recipient: 'recipient@example.com',
        textBody: 'Test',
        attachments: [],
        headers: {},
      });

      const forbiddenEmail = new Email({
        id: 'test',
        timestamp: new Date(),
        subject: 'Test',
        from: 'forbidden@hacker.com',
        to: ['recipient@example.com'],
        recipient: 'recipient@example.com',
        textBody: 'Test',
        attachments: [],
        headers: {},
      });

      // 許可された送信者は検証を通る
      expect(() => emailValidator.validateSender(allowedEmail, route)).not.toThrow();

      // ドメイン許可された送信者も検証を通る
      expect(() => emailValidator.validateSender(domainAllowedEmail, route)).not.toThrow();

      // 許可されていない送信者は検証エラーが発生
      expect(() => emailValidator.validateSender(forbiddenEmail, route)).toThrow(
        '送信者が許可されていません'
      );
    });
  });

  describe('maxSize validation', () => {
    it('メールサイズが制限以下の場合は正常に処理される', async () => {
      // 準備 - 1MB制限のルート
      routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api.example.com/webhook',
          format: 'json',
          maxSize: 1048576, // 1MB
        }),
      ]);

      service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

      const record = createMockSESRecord({
        messageId: 'test123',
        recipient: 'test@example.com',
        subject: '短い件名',
        from: 'sender@example.com',
      });

      // Mock EmailExtractorを小さなメールを返すように設定
      const mockExtractor = {
        extractFromSESRecord: vi.fn().mockResolvedValue(
          new Email({
            id: 'test123',
            timestamp: new Date(),
            subject: '短い件名',
            from: 'sender@example.com',
            to: ['test@example.com'],
            recipient: 'test@example.com',
            textBody: '短いメール本文',
            attachments: [],
            headers: {},
          })
        ),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).emailExtractor = mockExtractor;

      // 実行
      const result = await service.processEmail(record);

      // 検証
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('メールサイズが制限を超える場合はエラーになる', async () => {
      // 準備 - 500バイト制限のルート（非常に小さな制限）
      routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api.example.com/webhook',
          format: 'json',
          maxSize: 500, // 500バイト制限
        }),
      ]);

      service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

      const record = createMockSESRecord({
        messageId: 'test123',
        recipient: 'test@example.com',
        subject: '長い件名'.repeat(50), // 長い件名
        from: 'sender@example.com',
      });

      // Mock EmailExtractorを大きなメールを返すように設定
      const longText = 'この文章を繰り返して大きなサイズにします。'.repeat(50);
      const mockExtractor = {
        extractFromSESRecord: vi.fn().mockResolvedValue(
          new Email({
            id: 'test123',
            timestamp: new Date(),
            subject: '長い件名'.repeat(50),
            from: 'sender@example.com',
            to: ['test@example.com'],
            recipient: 'test@example.com',
            textBody: longText,
            attachments: [],
            headers: {},
          })
        ),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).emailExtractor = mockExtractor;

      // 実行
      const result = await service.processEmail(record);

      // 検証 - サイズ制限エラーが発生し、統一メッセージが返される
      expect(result.success).toBe(false);
      expect(result.message).toBe('全てのエンドポイントが失敗');
      expect(result.statusCode).toBe(400); // バリデーションエラーのステータスコード
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('添付ファイルのサイズも含めて制限チェックされる', async () => {
      // 準備 - 1KB制限のルート
      routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api.example.com/webhook',
          format: 'json',
          maxSize: 1024, // 1KB制限
        }),
      ]);

      service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

      const record = createMockSESRecord({
        messageId: 'test123',
        recipient: 'test@example.com',
        subject: 'Test',
        from: 'sender@example.com',
      });

      // Mock EmailExtractorを大きな添付ファイル付きメールを返すように設定
      const largeAttachment = new Attachment({
        filename: 'large-file.txt',
        contentType: 'text/plain',
        size: 2048, // 2KB（制限を超える）
        content: Buffer.alloc(2048),
      });

      const mockExtractor = {
        extractFromSESRecord: vi.fn().mockResolvedValue(
          new Email({
            id: 'test123',
            timestamp: new Date(),
            subject: 'Test',
            from: 'sender@example.com',
            to: ['test@example.com'],
            recipient: 'test@example.com',
            textBody: 'Small text',
            attachments: [largeAttachment],
            headers: {},
          })
        ),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).emailExtractor = mockExtractor;

      // 実行
      const result = await service.processEmail(record);

      // 検証 - サイズ制限エラーが発生し、統一メッセージが返される
      expect(result.success).toBe(false);
      expect(result.message).toBe('全てのエンドポイントが失敗');
      expect(result.statusCode).toBe(400); // バリデーションエラーのステータスコード
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('maxSizeが設定されていない場合はサイズチェックをスキップする', async () => {
      // 準備 - maxSize未設定のルート
      routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api.example.com/webhook',
          format: 'json',
          // maxSize未設定
        }),
      ]);

      service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

      const record = createMockSESRecord({
        messageId: 'test123',
        recipient: 'test@example.com',
        from: 'sender@example.com',
      });

      // Mock EmailExtractorを大きなメールを返すように設定
      const longText = 'Very long email body content.'.repeat(1000);
      const mockExtractor = {
        extractFromSESRecord: vi.fn().mockResolvedValue(
          new Email({
            id: 'test123',
            timestamp: new Date(),
            subject: 'Test',
            from: 'sender@example.com',
            to: ['test@example.com'],
            recipient: 'test@example.com',
            textBody: longText,
            attachments: [],
            headers: {},
          })
        ),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).emailExtractor = mockExtractor;

      // 実行
      const result = await service.processEmail(record);

      // 検証
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  describe('allowedSenders validation', () => {
    it('許可された送信者からのメールは正常に処理される', async () => {
      // 準備 - 特定の送信者のみ許可するルート
      routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api.example.com/webhook',
          format: 'json',
          allowedSenders: ['allowed@example.com', 'trusted@test.com'],
        }),
      ]);

      service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

      const record = createMockSESRecord({
        messageId: 'test123',
        recipient: 'test@example.com',
        subject: 'Test Subject',
        from: 'allowed@example.com', // 許可された送信者
      });

      const mockExtractor = {
        extractFromSESRecord: vi.fn().mockResolvedValue(
          new Email({
            id: 'test123',
            timestamp: new Date(),
            subject: 'Test Subject',
            from: 'allowed@example.com',
            to: ['test@example.com'],
            recipient: 'test@example.com',
            textBody: 'Test body',
            attachments: [],
            headers: {},
          })
        ),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).emailExtractor = mockExtractor;

      // 実行
      const result = await service.processEmail(record);

      // 検証
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('許可されていない送信者からのメールはエラーになる', async () => {
      // 準備 - 特定の送信者のみ許可するルート
      routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api.example.com/webhook',
          format: 'json',
          allowedSenders: ['allowed@example.com'],
        }),
      ]);

      service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

      const record = createMockSESRecord({
        messageId: 'test123',
        recipient: 'test@example.com',
        subject: 'Test Subject',
        from: 'forbidden@hacker.com', // 許可されていない送信者
      });

      const mockExtractor = {
        extractFromSESRecord: vi.fn().mockResolvedValue(
          new Email({
            id: 'test123',
            timestamp: new Date(),
            subject: 'Test Subject',
            from: 'forbidden@hacker.com',
            to: ['test@example.com'],
            recipient: 'test@example.com',
            textBody: 'Test body',
            attachments: [],
            headers: {},
          })
        ),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).emailExtractor = mockExtractor;

      // 実行
      const result = await service.processEmail(record);

      // 検証 - 送信者制限エラーが発生し、統一メッセージが返される
      expect(result.success).toBe(false);
      expect(result.message).toBe('全てのエンドポイントが失敗');
      expect(result.statusCode).toBe(400); // バリデーションエラーのステータスコード
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('ドメイン指定による許可が正しく動作する', async () => {
      // 準備 - ドメイン単位で許可するルート
      routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api.example.com/webhook',
          format: 'json',
          allowedSenders: ['@trusted.com', 'specific@other.com'],
        }),
      ]);

      service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

      const record = createMockSESRecord({
        messageId: 'test123',
        recipient: 'test@example.com',
        subject: 'Test Subject',
        from: 'anyone@trusted.com', // trusted.comドメインの任意のユーザー
      });

      const mockExtractor = {
        extractFromSESRecord: vi.fn().mockResolvedValue(
          new Email({
            id: 'test123',
            timestamp: new Date(),
            subject: 'Test Subject',
            from: 'anyone@trusted.com',
            to: ['test@example.com'],
            recipient: 'test@example.com',
            textBody: 'Test body',
            attachments: [],
            headers: {},
          })
        ),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).emailExtractor = mockExtractor;

      // 実行
      const result = await service.processEmail(record);

      // 検証
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('allowedSendersが空配列の場合は全ての送信者を許可する', async () => {
      // 準備 - allowedSendersが空配列のルート
      routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api.example.com/webhook',
          format: 'json',
          allowedSenders: [], // 空配列 = 制限なし
        }),
      ]);

      service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

      const record = createMockSESRecord({
        messageId: 'test123',
        recipient: 'test@example.com',
        subject: 'Test Subject',
        from: 'anyone@anywhere.com', // 任意の送信者
      });

      const mockExtractor = {
        extractFromSESRecord: vi.fn().mockResolvedValue(
          new Email({
            id: 'test123',
            timestamp: new Date(),
            subject: 'Test Subject',
            from: 'anyone@anywhere.com',
            to: ['test@example.com'],
            recipient: 'test@example.com',
            textBody: 'Test body',
            attachments: [],
            headers: {},
          })
        ),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).emailExtractor = mockExtractor;

      // 実行
      const result = await service.processEmail(record);

      // 検証
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('allowedSendersが未設定の場合は全ての送信者を許可する', async () => {
      // 準備 - allowedSenders未設定のルート
      routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api.example.com/webhook',
          format: 'json',
          // allowedSenders未設定
        }),
      ]);

      service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

      const record = createMockSESRecord({
        messageId: 'test123',
        recipient: 'test@example.com',
        subject: 'Test Subject',
        from: 'anyone@anywhere.com', // 任意の送信者
      });

      const mockExtractor = {
        extractFromSESRecord: vi.fn().mockResolvedValue(
          new Email({
            id: 'test123',
            timestamp: new Date(),
            subject: 'Test Subject',
            from: 'anyone@anywhere.com',
            to: ['test@example.com'],
            recipient: 'test@example.com',
            textBody: 'Test body',
            attachments: [],
            headers: {},
          })
        ),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).emailExtractor = mockExtractor;

      // 実行
      const result = await service.processEmail(record);

      // 検証
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  describe('複合的な検証', () => {
    it('maxSizeとallowedSendersの両方が設定されている場合、両方のチェックが行われる', async () => {
      // 準備 - 両方の制限があるルート
      routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api.example.com/webhook',
          format: 'json',
          maxSize: 1000, // 1KB制限
          allowedSenders: ['allowed@example.com'],
        }),
      ]);

      service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

      // ケース1: 送信者は許可されているがサイズ制限を超える
      const record1 = createMockSESRecord({
        messageId: 'test123',
        recipient: 'test@example.com',
        subject: 'Test Subject',
        from: 'allowed@example.com', // 許可された送信者
      });

      const longText = 'Very long content.'.repeat(100); // 長いコンテンツ
      const mockExtractor1 = {
        extractFromSESRecord: vi.fn().mockResolvedValue(
          new Email({
            id: 'test123',
            timestamp: new Date(),
            subject: 'Test Subject',
            from: 'allowed@example.com',
            to: ['test@example.com'],
            recipient: 'test@example.com',
            textBody: longText,
            attachments: [],
            headers: {},
          })
        ),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).emailExtractor = mockExtractor1;

      // 実行
      const result1 = await service.processEmail(record1);

      // 検証 - サイズ制限でエラー
      expect(result1.success).toBe(false);
      expect(result1.message).toBe('全てのエンドポイントが失敗');
      expect(result1.statusCode).toBe(400); // バリデーションエラーのステータスコード

      // ケース2: サイズは小さいが送信者が許可されていない
      const record2 = createMockSESRecord({
        messageId: 'test456',
        recipient: 'test@example.com',
        subject: 'Short',
        from: 'forbidden@hacker.com', // 許可されていない送信者
      });

      const mockExtractor2 = {
        extractFromSESRecord: vi.fn().mockResolvedValue(
          new Email({
            id: 'test456',
            timestamp: new Date(),
            subject: 'Short',
            from: 'forbidden@hacker.com',
            to: ['test@example.com'],
            recipient: 'test@example.com',
            textBody: 'Short',
            attachments: [],
            headers: {},
          })
        ),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).emailExtractor = mockExtractor2;

      // 実行
      const result2 = await service.processEmail(record2);

      // 検証 - 送信者制限でエラー
      expect(result2.success).toBe(false);
      expect(result2.message).toBe('全てのエンドポイントが失敗');
      expect(result2.statusCode).toBe(400); // バリデーションエラーのステータスコード
    });

    it('両方の条件をクリアした場合は正常に処理される', async () => {
      // 準備 - 両方の制限があるルート
      routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api.example.com/webhook',
          format: 'json',
          maxSize: 1048576, // 1MB制限
          allowedSenders: ['allowed@example.com'],
        }),
      ]);

      service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

      const record = createMockSESRecord({
        messageId: 'test123',
        recipient: 'test@example.com',
        subject: 'Short Subject',
        from: 'allowed@example.com', // 許可された送信者
      });

      const mockExtractor = {
        extractFromSESRecord: vi.fn().mockResolvedValue(
          new Email({
            id: 'test123',
            timestamp: new Date(),
            subject: 'Short Subject',
            from: 'allowed@example.com',
            to: ['test@example.com'],
            recipient: 'test@example.com',
            textBody: 'Short body',
            attachments: [],
            headers: {},
          })
        ),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).emailExtractor = mockExtractor;

      // 実行
      const result = await service.processEmail(record);

      // 検証
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  describe('エッジケース', () => {
    it('複数のルートがある場合、各ルートで個別に検証される', async () => {
      // 準備 - 異なる制限を持つ複数のルート
      routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api1.example.com/webhook',
          format: 'json',
          maxSize: 1000, // 小さな制限
          allowedSenders: ['allowed@example.com'],
        }),
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api2.example.com/webhook',
          format: 'json',
          maxSize: 10000, // 大きな制限
          allowedSenders: ['allowed@example.com'],
        }),
      ]);

      service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

      const record = createMockSESRecord({
        messageId: 'test123',
        recipient: 'test@example.com',
        subject: 'Test Subject',
        from: 'allowed@example.com',
      });

      // 中程度のサイズのメール（1つ目は制限オーバー、2つ目は制限内）
      const mediumText = 'Medium content.'.repeat(70); // 約1100バイト
      const mockExtractor = {
        extractFromSESRecord: vi.fn().mockResolvedValue(
          new Email({
            id: 'test123',
            timestamp: new Date(),
            subject: 'Test Subject',
            from: 'allowed@example.com',
            to: ['test@example.com'],
            recipient: 'test@example.com',
            textBody: mediumText,
            attachments: [],
            headers: {},
          })
        ),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).emailExtractor = mockExtractor;

      // 実行
      const result = await service.processEmail(record);

      // 検証 - 少なくとも1つのエンドポイントが成功したので全体は成功
      expect(result.success).toBe(true);
      expect(result.message).toContain('少なくとも1つのエンドポイントが成功');
      expect(mockFetch).toHaveBeenCalledOnce(); // 成功した1つのエンドポイントのみ呼ばれる
    });

    it('全てのルートで検証エラーが発生した場合は全体が失敗する', async () => {
      // 準備 - 全て厳しい制限のルート
      routeRepository = new MockRouteRepository([
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api1.example.com/webhook',
          format: 'json',
          allowedSenders: ['different@example.com'], // 許可されていない送信者
        }),
        new Route({
          emailAddress: 'test@example.com',
          postEndpoint: 'https://api2.example.com/webhook',
          format: 'json',
          maxSize: 100, // 非常に小さな制限
        }),
      ]);

      service = new EmailProcessingService(routeRepository, emailRepository, mockFetch);

      const record = createMockSESRecord({
        messageId: 'test123',
        recipient: 'test@example.com',
        subject: 'Test Subject',
        from: 'forbidden@example.com',
      });

      const mockExtractor = {
        extractFromSESRecord: vi.fn().mockResolvedValue(
          new Email({
            id: 'test123',
            timestamp: new Date(),
            subject: 'Test Subject',
            from: 'forbidden@example.com',
            to: ['test@example.com'],
            recipient: 'test@example.com',
            textBody: 'This is a relatively long message that will exceed the size limit.',
            attachments: [],
            headers: {},
          })
        ),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).emailExtractor = mockExtractor;

      // 実行
      const result = await service.processEmail(record);

      // 検証 - 全てのエンドポイントが失敗
      expect(result.success).toBe(false);
      expect(result.message).toContain('全てのエンドポイントが失敗');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
