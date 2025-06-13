/**
 * メール送信サービス
 * @deprecated 代わりに EmailProcessingService を使用してください
 */

import type { EmailData, RouteConfig, SendResult } from '@/types';

/**
 * 解析されたメールデータをHTTP POSTで送信する
 *
 * @param emailData - 解析済みのメールデータ
 * @param routeConfig - 使用するルーティング設定
 * @returns Promise<SendResult> - 送信結果
 * @deprecated 代わりに EmailProcessingService.sendToEndpoint() を使用してください
 */
export async function sendEmail(
  emailData: EmailData,
  routeConfig: RouteConfig
): Promise<SendResult> {
  // スタブ実装 - 常に成功を返す
  console.log('sendEmail called - this is a stub implementation');
  console.log('emailData:', JSON.stringify(emailData));
  console.log('routeConfig:', JSON.stringify(routeConfig));

  return {
    success: true,
    statusCode: 200,
    message: 'Stub implementation',
  };
}
