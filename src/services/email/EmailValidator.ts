/**
 * メール関連のバリデーションを行うサービス
 */
import { Email } from '@domain/models/Email';
import type { Route } from '@domain/models/Route';
import { SimpleEmailParser } from './SimpleEmailParser';

export class EmailValidator {
  /**
   * メールサイズチェック
   */
  validateSize(email: Email, route: Route): void {
    const maxSize = route.maxSize;
    if (!maxSize) return; // サイズ制限が設定されていない場合はスキップ

    // メール全体のサイズを概算（添付ファイルを含む）
    let totalSize = 0;

    // 基本メールサイズ（件名、本文、ヘッダーなど）
    totalSize += (email.subject || '').length;
    totalSize += (email.textBody || '').length;
    totalSize += (email.htmlBody || '').length;
    totalSize += email.from.length;
    totalSize += email.to.join(',').length;

    // 添付ファイルのサイズを加算
    if (email.attachments) {
      for (const attachment of email.attachments) {
        totalSize += attachment.size || 0;
      }
    }

    if (totalSize > maxSize) {
      throw new Error(
        `メールサイズが制限を超えています: ${totalSize} bytes > ${maxSize} bytes (制限値)`
      );
    }
  }

  /**
   * 送信者チェック
   */
  validateSender(email: Email, route: Route): void {
    const allowedSenders = route.allowedSenders;
    if (!allowedSenders || allowedSenders.length === 0) return; // 制限が設定されていない場合はスキップ

    const senderEmail = SimpleEmailParser.extractEmailAddress(email.from);

    // 完全一致チェック
    if (allowedSenders.includes(senderEmail)) {
      return;
    }

    // ドメイン一致チェック（@domain.comの形式）
    const senderDomain = senderEmail.split('@')[1];
    if (senderDomain) {
      const domainPatterns = allowedSenders.filter(pattern => pattern.startsWith('@'));
      for (const pattern of domainPatterns) {
        if (pattern === `@${senderDomain}`) {
          return;
        }
      }
    }

    throw new Error(
      `送信者が許可されていません: ${senderEmail}. 許可されている送信者: ${allowedSenders.join(', ')}`
    );
  }
}
