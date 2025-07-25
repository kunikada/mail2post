/**
 * メール処理サービス（オーケストレーション）
 */
import type { SESEventRecord } from 'aws-lambda';
import { Email } from '@domain/models/Email';
import type { Route } from '@domain/models/Route';
import type { RouteRepository } from '@domain/repositories/RouteRepository';
import type { EmailRepository } from '@domain/repositories/EmailRepository';
import { SESEmailExtractor } from './email/SESEmailExtractor';
import { EmailValidator } from './email/EmailValidator';
import { HttpRequestBuilder } from './http/HttpRequestBuilder';
import { HttpSender } from './http/HttpSender';
import type { SendResult } from '@/types';

export class EmailProcessingService {
  private emailExtractor: SESEmailExtractor;
  private emailValidator: EmailValidator;
  private requestBuilder: HttpRequestBuilder;
  private httpSender: HttpSender;

  constructor(
    private readonly routeRepository: RouteRepository,
    private readonly emailRepository?: EmailRepository,
    fetchFn?: (url: string, init?: RequestInit) => Promise<Response>,
    emailExtractor?: SESEmailExtractor
  ) {
    this.emailExtractor = emailExtractor || new SESEmailExtractor();
    this.emailValidator = new EmailValidator();
    this.requestBuilder = new HttpRequestBuilder();
    this.httpSender = new HttpSender(fetchFn);
  }

  /**
   * SESイベントレコードからメールを処理
   * @param record SESイベントレコード
   */
  async processEmail(record: SESEventRecord): Promise<SendResult> {
    try {
      // console.log('レコード処理:', record.ses.mail.messageId); // eslint-disable-line no-console

      // メールデータの解析
      const email = await this.emailExtractor.extractFromSESRecord(record);

      // メールを保存（リポジトリが提供されている場合）
      if (this.emailRepository) {
        await this.emailRepository.save(email);
      }

      // 該当するルーティング設定を全て取得
      const routes = await this.findAllRoutes(email.recipient);
      if (!routes || routes.length === 0) {
        return { success: false, message: 'ルート設定が見つかりません' };
      }

      // 全てのエンドポイントに送信
      const results = await Promise.all(
        routes.map(async (route: Route) => {
          try {
            // メールサイズと送信者の検証
            this.emailValidator.validateSize(email, route);
            this.emailValidator.validateSender(email, route);

            return await this.sendToEndpoint(email, route);
          } catch (error) {
            // 検証エラーの場合は失敗として処理
            return {
              success: false,
              message: error instanceof Error ? error.message : String(error),
              statusCode: 400, // バリデーションエラーは400番台
            };
          }
        })
      );

      // 少なくとも1つのエンドポイントが成功した場合は全体を成功とみなす
      const anySuccess = results.some((r: { success: boolean }) => r.success);

      if (anySuccess) {
        return {
          success: true,
          message: '少なくとも1つのエンドポイントが成功',
          statusCode: results.find((r: { success: boolean }) => r.success)?.statusCode,
        };
      }

      // 複数エンドポイントが全て失敗した場合は常に統一メッセージを返す
      return {
        success: false,
        message: '全てのエンドポイントが失敗',
        statusCode: results[0]?.statusCode,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * メールに対応する全てのルート設定を検索
   * @private
   */
  private async findAllRoutes(recipient: string): Promise<Route[]> {
    // 完全一致を検索
    const routes = await this.routeRepository.findAllByEmailAddress(recipient);
    if (routes && routes.length > 0) return routes;

    // デフォルトルートを検索
    const defaultRoute = await this.routeRepository.findDefault();
    return defaultRoute ? [defaultRoute] : [];
  }

  /**
   * メールをエンドポイントに送信
   * @private
   */
  private async sendToEndpoint(email: Email, route: Route): Promise<SendResult> {
    const { postEndpoint, retryCount, retryDelay } = route;

    // HTTPリクエストの構築
    const request = this.requestBuilder.buildRequest(email, route);

    // リトライロジックを含む送信処理
    const result = await this.httpSender.sendWithRetry(request, retryCount, retryDelay);

    // エラー時のみ詳細ログを出力
    if (!result.success) {
      const logData = {
        statusCode: result.statusCode,
        errorMessage: result.message,
        retries: result.retries,
        emailId: email.id,
        recipient: email.recipient,
      };

      // クライアントエラー（4xx系）の場合はリクエストの詳細も出力
      if (result.statusCode && result.statusCode >= 400 && result.statusCode < 500) {
        const requestInit = request.toRequestInit();
        const bodyString = typeof requestInit.body === 'string' ? requestInit.body : '[FormData]';

        console.error(`クライアントエラー（${result.statusCode}）: ${postEndpoint}`, {
          ...logData,
          requestDetails: {
            url: request.url,
            method: request.method,
            headers: request.getHeadersObject(),
            contentType: request.contentType,
            bodySize: bodyString.length,
            bodyPreview:
              bodyString.length > 500 ? bodyString.substring(0, 500) + '...' : bodyString,
          },
        });
      } else {
        console.error(`エンドポイント送信失敗: ${postEndpoint}`, logData);
      }
    }

    return result;
  }
}
