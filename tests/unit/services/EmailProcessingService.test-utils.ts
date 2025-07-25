/**
 * EmailProcessingServiceテスト用の共通ユーティリティ
 */

import { vi } from 'vitest';
import { Route } from '@domain/models/Route';
import { Email } from '@domain/models/Email';
import { RouteRepository } from '@domain/repositories/RouteRepository';
import { EmailRepository } from '@domain/repositories/EmailRepository';
import { S3EmailService } from '@services/s3EmailService';
import { SESEmailExtractor } from '@services/email/SESEmailExtractor';
import { EmailProcessingService } from '@services/EmailProcessingService';
import type { SESEventRecord } from 'aws-lambda';
import type { ParsedEmail } from '@/types';

// モックのfetch関数をセットアップ
export const mockFetch = vi.fn();
// fetchのグローバル定義（Node.js環境で型エラー回避）
(globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;

// configのモック
vi.mock('@services/config', () => ({
  getCurrentConfig: vi.fn(() => ({
    aws: {
      region: 'us-east-1',
      bucketName: 'test-bucket',
    },
    ses: {
      recipients: ['test@example.com'],
    },
    defaults: {
      format: 'json',
      retryCount: 3,
      retryDelay: 1000,
    },
  })),
}));

/**
 * テスト用のモックRouteRepository実装
 */
export class MockRouteRepository implements RouteRepository {
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
export class MockEmailRepository implements EmailRepository {
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
 * テスト用のモックSESEmailExtractor実装
 */
export class MockSESEmailExtractor extends SESEmailExtractor {
  private mockS3EmailService: MockS3EmailService;

  constructor(mockS3EmailService?: MockS3EmailService) {
    super();
    this.mockS3EmailService = mockS3EmailService || new MockS3EmailService();
  }

  async extractFromSESRecord(record: SESEventRecord): Promise<Email> {
    const mail = record.ses.mail;
    const receipt = record.ses.receipt;

    // メール基本情報の抽出
    const subject = mail.commonHeaders?.subject || '';
    const from = mail.commonHeaders?.from?.[0] || mail.source;
    const to = mail.commonHeaders?.to || mail.destination;
    const recipient = receipt.recipients[0];

    // 本文を取得（mockS3EmailServiceを使用）
    let textBody = '';
    let htmlBody: string | undefined;

    try {
      const s3Key = this.mockS3EmailService.generateS3Key(mail.messageId);
      const parsedMail = await this.mockS3EmailService.getEmailFromS3('', s3Key);
      textBody = parsedMail.text || '';
      htmlBody = parsedMail.html || undefined;
    } catch {
      textBody = '(メール本文の取得に失敗しました)';
    }

    return new Email({
      id: mail.messageId,
      subject,
      from,
      to,
      recipient,
      textBody,
      htmlBody,
      timestamp: new Date(mail.timestamp),
      headers: this.convertHeaders(mail.headers || []),
    });
  }

  private convertHeaders(headers: Array<{ name: string; value: string }>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const header of headers) {
      result[header.name.toLowerCase()] = header.value;
    }
    return result;
  }
}
export class MockS3EmailService extends S3EmailService {
  private emailData: Map<string, ParsedEmail> = new Map();

  constructor() {
    super('us-east-1'); // ダミーリージョン
  }

  // テスト用にメールデータを設定するメソッド
  setEmailData(messageId: string, data: { text: string; html?: string; subject: string }): void {
    const key = this.generateS3Key(messageId);
    const parsedMail = this.createParsedEmail(data.text, data.html, data.subject);
    this.emailData.set(key, parsedMail);
  }

  private createParsedEmail(text: string, html: string | undefined, subject: string): ParsedEmail {
    return {
      text,
      html,
      subject,
      attachments: [],
    };
  }

  async getEmailFromS3(_bucketName: string, s3Key: string): Promise<ParsedEmail> {
    console.log('MockS3EmailService: Looking for key:', s3Key);
    console.log('MockS3EmailService: Available keys:', Array.from(this.emailData.keys()));
    const data = this.emailData.get(s3Key);
    if (!data) {
      throw new Error('Email not found in mock S3');
    }
    return data;
  }
}

/**
 * テスト用のモックSESレコードを作成するヘルパー関数
 */
export function createMockSESRecord(props: {
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

/**
 * テスト前共通セットアップ関数
 */
export function setupTestEnvironment(): void {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (EmailProcessingService as any)['endpointCounters'] = {};
}
