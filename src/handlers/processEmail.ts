/**
 * SESイベントを処理するLambdaハンドラー
 */

import type { Context, SESEvent, SESEventRecord } from 'aws-lambda';
import { EmailProcessingService } from '@services/EmailProcessingService';
import { RouteRepositoryFactory } from '@domain/repositories/RouteRepositoryFactory';

// リポジトリの初期化（アプリケーション起動時に一度だけ実行される）
const routeRepository = RouteRepositoryFactory.create();

// メール処理サービスの初期化
const emailProcessingService = new EmailProcessingService(routeRepository);

/**
 * SESからのメールを処理し、設定されたエンドポイントにPOSTするLambdaハンドラー
 *
 * @param event - SESイベント
 * @param _lambdaContext - Lambda実行コンテキスト（未使用だがAWS Lambdaハンドラーの契約により必要）
 * @returns Promise<void>
 */
export const processEmailHandler = async (
  event: SESEvent,
  _lambdaContext: Context
): Promise<void> => {
  try {
    console.log('受信イベント:', JSON.stringify(event, null, 2));

    // メール処理の初期化
    const records = event.Records || [];
    if (records.length === 0) {
      console.warn('処理対象レコードがありません');
      return;
    }

    // 必要な場合、複数レコードを処理
    for (const record of records) {
      await processRecord(record);
    }

    console.log('すべてのメールの処理が完了しました');
  } catch (error) {
    console.error('メール処理中にエラーが発生しました:', error);
    throw error; // エラーを再スローして、Lambdaが失敗として扱うようにする
  }
};

/**
 * 単一のSESレコードを処理する
 *
 * @param record - 処理対象のSESイベントレコード
 */
async function processRecord(record: SESEventRecord): Promise<void> {
  try {
    // EmailProcessingServiceを使用してメールを処理
    const result = await emailProcessingService.processEmail(record);

    // 処理結果のログ
    console.log('メール処理結果:', result);

    if (!result.success) {
      console.warn(`メール処理が失敗しました: ${result.message}`);
    }
  } catch (error) {
    console.error('レコード処理中にエラーが発生しました:', error);
    throw error;
  }
}
