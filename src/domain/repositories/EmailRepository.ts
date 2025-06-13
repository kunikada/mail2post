/**
 * メールリポジトリのインターフェース
 */
import type { Email } from '@domain/models/Email';
import type { Repository } from '@domain/repositories/Repository';

export interface EmailRepository extends Repository<Email, string> {
  /**
   * 受信者アドレスで検索
   * @param recipient 受信者アドレス
   */
  findByRecipient(recipient: string): Promise<Email[]>;

  /**
   * 送信者アドレスで検索
   * @param sender 送信者アドレス
   */
  findBySender(sender: string): Promise<Email[]>;

  /**
   * 件名で検索
   * @param subject 件名（部分一致）
   */
  findBySubject(subject: string): Promise<Email[]>;

  /**
   * 日付範囲で検索
   * @param start 開始日時
   * @param end 終了日時
   */
  findByDateRange(start: Date, end: Date): Promise<Email[]>;
}
