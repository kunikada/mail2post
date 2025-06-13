/**
 * EmailProcessingServiceの単体テスト
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailProcessingService } from '@services/EmailProcessingService';
import { Route } from '@domain/models/Route';
import { Email } from '@domain/models/Email';
import { RouteRepository } from '@domain/repositories/RouteRepository';
import { EmailRepository } from '@domain/repositories/EmailRepository';
import { SESEventRecord } from 'aws-lambda';

// モックのfetch関数をセットアップ
const mockFetch = vi.fn();
// fetchのグローバル定義（Node.js環境で型エラー回避）
(globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;

describe('EmailProcessingService', () => {
  // テスト前の準備
  beforeEach(() => {
    // fetchのモックをリセット
    mockFetch.mockReset();
    // 成功レスポンスのデフォルト
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'Success',
      json: async () => ({ status: 'success' }),
    } as Response);
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
});

/**
 * テスト用のモックRouteRepository実装
 */
class MockRouteRepository implements RouteRepository {
  private routes: Route[];

  constructor(routes: Route[] = []) {
    this.routes = routes;
  }

  async findById(id: string): Promise<Route | null> {
    return this.routes.find(route => route.emailAddress === id) || null;
  }

  async findAll(): Promise<Route[]> {
    return [...this.routes];
  }

  async save(route: Route): Promise<Route> {
    const existingIndex = this.routes.findIndex(r => r.emailAddress === route.emailAddress);
    if (existingIndex >= 0) {
      this.routes[existingIndex] = route;
    } else {
      this.routes.push(route);
    }
    return route;
  }

  async delete(id: string): Promise<boolean> {
    const initialLength = this.routes.length;
    this.routes = this.routes.filter(route => route.emailAddress !== id);
    return this.routes.length < initialLength;
  }

  async findByEmailAddress(emailAddress: string, domain?: string): Promise<Route | null> {
    // まず完全一致を検索
    const exactMatch = this.routes.find(route => route.emailAddress === emailAddress);
    if (exactMatch) return exactMatch;

    // ドメインが指定されている場合、ドメイン一致を検索
    if (domain) {
      const domainMatch = this.routes.find(route => route.emailAddress === domain);
      if (domainMatch) return domainMatch;
    }

    return null;
  }

  async findDefault(): Promise<Route | null> {
    return this.routes.find(route => route.emailAddress === '*') || null;
  }

  async reload(): Promise<void> {
    // モックでは何もしない
  }
}

/**
 * テスト用のモックEmailRepository実装
 */
class MockEmailRepository implements EmailRepository {
  private emails: Email[] = [];

  async findById(id: string): Promise<Email | null> {
    return this.emails.find(email => email.id === id) || null;
  }

  async findAll(): Promise<Email[]> {
    return [...this.emails];
  }

  async save(email: Email): Promise<Email> {
    const existingIndex = this.emails.findIndex(e => e.id === email.id);
    if (existingIndex >= 0) {
      this.emails[existingIndex] = email;
    } else {
      this.emails.push(email);
    }
    return email;
  }

  async delete(id: string): Promise<boolean> {
    const initialLength = this.emails.length;
    this.emails = this.emails.filter(email => email.id !== id);
    return this.emails.length < initialLength;
  }

  async findByRecipient(recipient: string): Promise<Email[]> {
    return this.emails.filter(
      email => email.to.includes(recipient) || email.recipient === recipient
    );
  }

  async findBySender(sender: string): Promise<Email[]> {
    return this.emails.filter(email => email.from === sender);
  }

  async findBySubject(subject: string): Promise<Email[]> {
    return this.emails.filter(email => email.subject.includes(subject));
  }

  async findByDateRange(start: Date, end: Date): Promise<Email[]> {
    return this.emails.filter(email => {
      const emailDate = email.timestamp;
      return emailDate >= start && emailDate <= end;
    });
  }
}

/**
 * テスト用のモックSESレコードを作成するヘルパー関数
 */
function createMockSESRecord(props: {
  messageId: string;
  recipient: string;
  subject: string;
  from?: string;
}): SESEventRecord {
  return {
    ses: {
      mail: {
        messageId: props.messageId,
        timestamp: new Date().toISOString(),
        source: props.from || 'sender@example.com',
        destination: [props.recipient],
        commonHeaders: {
          subject: props.subject,
          from: [props.from || 'Sender <sender@example.com>'],
          to: [props.recipient],
        },
        headers: [
          { name: 'Subject', value: props.subject },
          { name: 'From', value: props.from || 'Sender <sender@example.com>' },
          { name: 'To', value: props.recipient },
        ],
      },
      receipt: {
        timestamp: new Date().toISOString(),
        recipients: [props.recipient],
        action: {
          type: 'Lambda',
          functionArn: 'arn:aws:lambda:test:function:test-function',
        },
      },
    },
  } as SESEventRecord;
}
