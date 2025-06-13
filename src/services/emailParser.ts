/**
 * メール解析サービス
 */

import type { SESEventRecord } from 'aws-lambda';
import type { EmailData } from '@/types';

/**
 * SESイベントレコードからメールデータを解析する
 *
 * @param record - SESイベントレコード
 * @returns Promise<EmailData> - 解析されたメールデータ
 * @deprecated 代わりに EmailProcessingService.parseEmail() を使用してください
 */
export async function parseEmail(record: SESEventRecord): Promise<EmailData> {
  // 実際の実装では、S3から取得したメール全体を解析する必要があります
  // ここではサンプル実装として、SESイベントから直接取得できる情報のみを扱います

  const mail = record.ses.mail;
  const receipt = record.ses.receipt;

  // 受信者アドレスを取得
  const recipient = receipt.recipients[0];

  // メールデータの構築
  const emailData: EmailData = {
    messageId: mail.messageId,
    timestamp: mail.timestamp,
    subject: mail.commonHeaders.subject || '(件名なし)',
    from: mail.commonHeaders.from?.[0] || mail.source,
    to: mail.commonHeaders.to || [],
    cc: mail.commonHeaders.cc || [],
    recipient,
    body: {
      text: '(メール本文は実際の実装ではS3から取得します)',
    },
    headers: convertHeadersArrayToObject(mail.headers || []),
  };

  console.log('解析されたメールデータ:', JSON.stringify(emailData, null, 2));
  return emailData;
}

/**
 * ヘッダー配列をオブジェクトに変換
 *
 * @param headers - SESから取得したヘッダー配列
 * @returns Record<string, string> - キーと値のオブジェクト
 */
function convertHeadersArrayToObject(
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
