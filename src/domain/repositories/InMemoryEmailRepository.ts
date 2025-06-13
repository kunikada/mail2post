/**
 * インメモリメールリポジトリ実装
 * (テストやデバッグ用)
 */
import type { Email } from '@domain/models/Email';
import type { EmailRepository } from '@domain/repositories/EmailRepository';

export class InMemoryEmailRepository implements EmailRepository {
  private emails: Map<string, Email> = new Map();

  /**
   * IDによるメールの取得
   */
  async findById(id: string): Promise<Email | null> {
    return this.emails.get(id) || null;
  }

  /**
   * すべてのメールの取得
   */
  async findAll(): Promise<Email[]> {
    return Array.from(this.emails.values());
  }

  /**
   * メールの保存
   */
  async save(email: Email): Promise<Email> {
    this.emails.set(email.id, email);
    return email;
  }

  /**
   * メールの削除
   */
  async delete(id: string): Promise<boolean> {
    return this.emails.delete(id);
  }

  /**
   * 受信者アドレスで検索
   */
  async findByRecipient(recipient: string): Promise<Email[]> {
    return Array.from(this.emails.values()).filter(email => email.recipient === recipient);
  }

  /**
   * 送信者アドレスで検索
   */
  async findBySender(sender: string): Promise<Email[]> {
    return Array.from(this.emails.values()).filter(email => email.from === sender);
  }

  /**
   * 件名で検索
   */
  async findBySubject(subject: string): Promise<Email[]> {
    return Array.from(this.emails.values()).filter(email => email.subject.includes(subject));
  }

  /**
   * 日付範囲で検索
   */
  async findByDateRange(start: Date, end: Date): Promise<Email[]> {
    return Array.from(this.emails.values()).filter(email => {
      const timestamp = email.timestamp;
      return timestamp >= start && timestamp <= end;
    });
  }
}
