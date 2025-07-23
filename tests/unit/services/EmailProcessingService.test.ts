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
    // 毎回テスト開始時にmockFetchをリセット - これは全テストで共通
    mockFetch.mockReset();

    // 成功レスポンスのデフォルト
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'Success',
      json: async () => ({ status: 'success' }),
    } as Response);

    // エンドポイントカウンターもリセット
    EmailProcessingService['endpointCounters'] = {};
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

  async findAllByEmailAddress(emailAddress: string, domain?: string): Promise<Route[]> {
    // 完全一致のルートをすべて検索
    const exactMatches = this.routes.filter(route => route.emailAddress === emailAddress);
    if (exactMatches.length > 0) return exactMatches;

    // ドメインが指定されている場合、ドメイン一致を検索
    if (domain) {
      const domainMatches = this.routes.filter(route => route.emailAddress === domain);
      if (domainMatches.length > 0) return domainMatches;
    }

    return [];
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
  const fromEmail = props.from || 'sender@example.com';
  const fromHeader = fromEmail.includes('<') ? fromEmail : `Sender <${fromEmail}>`;

  return {
    ses: {
      mail: {
        messageId: props.messageId,
        timestamp: new Date().toISOString(),
        source: fromEmail,
        destination: [props.recipient],
        commonHeaders: {
          subject: props.subject,
          from: [fromHeader],
          to: [props.recipient],
        },
        headers: [
          { name: 'Subject', value: props.subject },
          { name: 'From', value: fromHeader },
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

describe('EmailProcessingService - contentSelection', () => {
  let routeRepository: MockRouteRepository;
  let emailRepository: MockEmailRepository;
  let service: EmailProcessingService;

  beforeEach(() => {
    // 毎回テスト開始時にmockFetchをリセット
    mockFetch.mockReset();

    // 成功レスポンスのデフォルト
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'Success',
      json: async () => ({ status: 'success' }),
    } as Response);

    // エンドポイントカウンターもリセット
    EmailProcessingService['endpointCounters'] = {};

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
    expect(bodyData).toHaveProperty('body', '(メール本文は実際の実装ではS3から取得します)');
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

    // フォームデータの検証
    const formData = new URLSearchParams(options.body);
    expect(formData.get('body')).toBe('(メール本文は実際の実装ではS3から取得します)');
    // 本文のみなので他の情報は含まれない
    expect(formData.has('messageId')).toBe(false);
    expect(formData.has('from')).toBe(false);
    expect(formData.has('recipient')).toBe(false);
    expect(formData.has('subject')).toBe(false);
  });
});

describe('EmailProcessingService - 複数エンドポイント', () => {
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
});
