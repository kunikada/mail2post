/**
 * メールドメインモデル
 */

import type { Attachment } from '@domain/models/Attachment';

export class Email {
  private readonly messageId: string;
  private readonly createdAt: Date;
  private readonly emailSubject: string;
  private readonly sender: string;
  private readonly recipients: string[];
  private readonly carbonCopy: string[];
  private readonly primaryRecipient: string;
  private readonly textContent: string;
  private readonly htmlContent: string | null;
  private readonly fileAttachments: Attachment[];
  private readonly messageHeaders: Map<string, string>;

  constructor(props: {
    id: string;
    timestamp: Date | string;
    subject: string;
    from: string;
    to: string[];
    cc?: string[];
    recipient: string;
    textBody?: string;
    htmlBody?: string;
    attachments?: Attachment[];
    headers?: Map<string, string> | Record<string, string>;
  }) {
    this.messageId = props.id;
    this.createdAt = props.timestamp instanceof Date ? props.timestamp : new Date(props.timestamp);
    this.emailSubject = props.subject;
    this.sender = props.from;
    this.recipients = [...props.to];
    this.carbonCopy = [...(props.cc || [])];
    this.primaryRecipient = props.recipient;
    this.textContent = props.textBody || '';
    this.htmlContent = props.htmlBody || null;
    this.fileAttachments = [...(props.attachments || [])];

    // ヘッダーの変換
    this.messageHeaders = new Map<string, string>();
    if (props.headers) {
      if (props.headers instanceof Map) {
        props.headers.forEach((value, key) => this.messageHeaders.set(key, value));
      } else {
        Object.entries(props.headers).forEach(([key, value]) =>
          this.messageHeaders.set(key, value)
        );
      }
    }
  }

  // ゲッター
  get id(): string {
    return this.messageId;
  }
  get timestamp(): Date {
    return this.createdAt;
  }
  get subject(): string {
    return this.emailSubject;
  }
  get from(): string {
    return this.sender;
  }
  get to(): readonly string[] {
    return this.recipients;
  }
  get cc(): readonly string[] {
    return this.carbonCopy;
  }
  get recipient(): string {
    return this.primaryRecipient;
  }
  get textBody(): string {
    return this.textContent;
  }
  get htmlBody(): string | null {
    return this.htmlContent;
  }
  get attachments(): readonly Attachment[] {
    return this.fileAttachments;
  }

  // ヘッダー取得
  getHeader(name: string): string | undefined {
    return this.messageHeaders.get(name);
  }

  // 全ヘッダー取得
  getAllHeaders(): ReadonlyMap<string, string> {
    return new Map(this.messageHeaders);
  }

  // EmailとしてのJSONデータを取得
  toJSON(): object {
    return {
      id: this.messageId,
      timestamp: this.createdAt.toISOString(),
      subject: this.emailSubject,
      from: this.sender,
      to: this.recipients,
      cc: this.carbonCopy,
      recipient: this.primaryRecipient,
      body: {
        text: this.textContent,
        html: this.htmlContent,
      },
      attachments: this.fileAttachments.map((a: Attachment) => a.toJSON()),
      headers: Object.fromEntries(this.messageHeaders),
    };
  }
}
