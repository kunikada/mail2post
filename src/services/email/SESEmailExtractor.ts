/**
 * SESイベントレコードからEmailオブジェクトを抽出するサービス
 */
import type { SESEventRecord } from 'aws-lambda';
import { Email } from '@domain/models/Email';
import { S3EmailService } from '../s3EmailService';
import { getCurrentConfig } from '@config/app';

export class SESEmailExtractor {
  private s3EmailService: S3EmailService;

  constructor(s3EmailService?: S3EmailService) {
    if (s3EmailService) {
      this.s3EmailService = s3EmailService;
    } else {
      const config = getCurrentConfig();
      this.s3EmailService = new S3EmailService(config.aws.region);
    }
  }

  /**
   * SESイベントレコードからEmailオブジェクトを生成
   */
  async extractFromSESRecord(record: SESEventRecord): Promise<Email> {
    const mail = record.ses.mail;
    const receipt = record.ses.receipt;

    // 受信者アドレスを取得
    const recipient = receipt.recipients[0];

    try {
      // S3からメール本文を取得
      const config = getCurrentConfig();
      const s3Key = this.s3EmailService.generateS3Key(mail.messageId);
      const parsedMail = await this.s3EmailService.getEmailFromS3(config.aws.bucketName, s3Key);

      // メールオブジェクトの構築
      return new Email({
        id: mail.messageId,
        timestamp: mail.timestamp,
        subject: mail.commonHeaders.subject || parsedMail.subject || '(件名なし)',
        from: mail.commonHeaders.from?.[0] || mail.source,
        to: mail.commonHeaders.to || [],
        cc: mail.commonHeaders.cc || [],
        recipient,
        textBody: parsedMail.text || '',
        htmlBody: parsedMail.html || undefined,
        headers: this.convertHeadersArrayToObject(mail.headers || []),
      });
    } catch (error) {
      console.error('S3からのメール取得に失敗、フォールバック処理を実行:', error);

      // S3からの取得に失敗した場合は基本情報のみでEmailオブジェクトを作成
      return new Email({
        id: mail.messageId,
        timestamp: mail.timestamp,
        subject: mail.commonHeaders.subject || '(件名なし)',
        from: mail.commonHeaders.from?.[0] || mail.source,
        to: mail.commonHeaders.to || [],
        cc: mail.commonHeaders.cc || [],
        recipient,
        textBody: '(メール本文の取得に失敗しました)',
        htmlBody: undefined,
        headers: this.convertHeadersArrayToObject(mail.headers || []),
      });
    }
  }

  /**
   * ヘッダー配列をオブジェクトに変換
   * @private
   */
  private convertHeadersArrayToObject(
    headers: Array<{ name: string; value: string }>
  ): Record<string, string> {
    return headers.reduce(
      (obj, header) => {
        obj[header.name] = header.value;
        return obj;
      },
      {} as Record<string, string>
    );
  }
}
