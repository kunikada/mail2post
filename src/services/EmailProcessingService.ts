/**
 * メール処理サービス
 */
import type { SESEventRecord } from 'aws-lambda';
import { Email } from '@domain/models/Email';
// Attachmentは削除（未使用のため）
import type { Route } from '@domain/models/Route';
import { HttpRequest } from '@domain/models/HttpRequest';
import { SlackMessage } from '@domain/models/SlackMessage';
import type { RouteRepository } from '@domain/repositories/RouteRepository';
import type { EmailRepository } from '@domain/repositories/EmailRepository';

export class EmailProcessingService {
  constructor(
    private readonly routeRepository: RouteRepository,
    private readonly emailRepository?: EmailRepository,
    private readonly fetchFn: (url: string, init?: RequestInit) => Promise<Response> = fetch
  ) {}

  /**
   * SESイベントレコードからメールを処理
   * @param record SESイベントレコード
   */
  async processEmail(record: SESEventRecord): Promise<{
    success: boolean;
    statusCode?: number;
    message?: string;
    retries?: number;
  }> {
    try {
      // console.log('レコード処理:', record.ses.mail.messageId); // eslint-disable-line no-console

      // メールデータの解析
      const email = await this.parseEmail(record);

      // メールを保存（リポジトリが提供されている場合）
      if (this.emailRepository) {
        await this.emailRepository.save(email);
      }

      // 該当するルーティング設定の取得
      const route = await this.findRoute(email.recipient);
      if (!route) {
        // console.log('適切なルーティング設定が見つかりませんでした。処理をスキップします'); // eslint-disable-line no-console
        return { success: false, message: 'ルート設定が見つかりません' };
      }

      // メールを送信
      return await this.sendToEndpoint(email, route);
    } catch (error) {
      // console.error('レコード処理中にエラーが発生しました:', error); // eslint-disable-line no-console
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * SESイベントレコードからEmailオブジェクトを生成
   * @private
   */
  private async parseEmail(record: SESEventRecord): Promise<Email> {
    // 実際の実装では、S3から取得したメール全体を解析する必要があります
    // ここではサンプル実装として、SESイベントから直接取得できる情報のみを扱います

    const mail = record.ses.mail;
    const receipt = record.ses.receipt;

    // 受信者アドレスを取得
    const recipient = receipt.recipients[0];

    // メールオブジェクトの構築
    return new Email({
      id: mail.messageId,
      timestamp: mail.timestamp,
      subject: mail.commonHeaders.subject || '(件名なし)',
      from: mail.commonHeaders.from?.[0] || mail.source,
      to: mail.commonHeaders.to || [],
      cc: mail.commonHeaders.cc || [],
      recipient,
      textBody: '(メール本文は実際の実装ではS3から取得します)',
      headers: this.convertHeadersArrayToObject(mail.headers || []),
    });
  }

  /**
   * メールに対応するルート設定を検索
   * @private
   */
  private async findRoute(recipient: string): Promise<Route | null> {
    // 完全一致を検索
    let route = await this.routeRepository.findByEmailAddress(recipient);
    if (route) return route;

    // デフォルトルートを検索
    return await this.routeRepository.findDefault();
  }

  /**
   * メールをエンドポイントに送信
   * @private
   */
  private async sendToEndpoint(
    email: Email,
    route: Route
  ): Promise<{
    success: boolean;
    statusCode?: number;
    message?: string;
    retries?: number;
  }> {
    const { postEndpoint, format, retryCount, retryDelay } = route;

    // 送信するデータの準備
    let request: HttpRequest;

    // 送信形式によって異なる処理
    if (postEndpoint.includes('hooks.slack.com')) {
      // Slack WebhookへのPOST
      const slackMessage = SlackMessage.fromEmailSimple(
        {
          subject: email.subject,
          from: email.from,
          textBody: email.textBody,
          recipient: email.recipient,
        },
        postEndpoint
      );

      request = new HttpRequest({
        url: postEndpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: slackMessage.toPayload(),
      });
    } else {
      // 通常のエンドポイントへのPOST
      const body = this.prepareBody(email, format);
      const headers = this.prepareHeaders(route);

      request = new HttpRequest({
        url: postEndpoint,
        method: 'POST',
        headers,
        body,
        contentType:
          format === 'json'
            ? 'application/json'
            : format === 'form'
              ? 'application/x-www-form-urlencoded'
              : 'text/plain',
      });
    }

    // リトライロジックを含む送信処理
    return await this.sendWithRetry(request, retryCount, retryDelay);
  }

  /**
   * 送信するデータを準備
   * @private
   */
  private prepareBody(email: Email, format: string): Record<string, string> | string {
    switch (format) {
      case 'json': {
        // EmailのtoJSON()はobject型なので、stringifyして返す
        return JSON.stringify(email.toJSON());
      }
      case 'form': {
        // フォームデータとして送信するため、フラットな構造に変換
        const formData: Record<string, string> = {
          messageId: email.id,
          timestamp: email.timestamp.toISOString(),
          subject: email.subject,
          from: email.from,
          to: email.to.join(','),
          recipient: email.recipient,
          body: email.textBody,
        };
        if (email.cc && email.cc.length > 0) {
          formData.cc = email.cc.join(',');
        }
        return formData;
      }
      case 'raw':
      default: {
        // メール本文をそのまま送信
        return email.textBody;
      }
    }
  }

  /**
   * ヘッダーを準備
   * @private
   */
  private prepareHeaders(route: Route): Record<string, string> {
    const headers = { ...route.getHeadersObject() };

    // 認証ヘッダーの追加
    if (route.authType === 'basic' && route.authToken) {
      headers['Authorization'] = `Basic ${route.authToken}`;
    } else if (route.authType === 'bearer' && route.authToken) {
      headers['Authorization'] = `Bearer ${route.authToken}`;
    }

    return headers;
  }

  /**
   * リトライロジックを含むHTTPリクエスト送信
   * @private
   */
  private async sendWithRetry(
    request: HttpRequest,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<{
    success: boolean;
    statusCode?: number;
    message?: string;
    retries?: number;
  }> {
    let retries = 0;
    let lastError: Error | null = null;

    while (retries <= maxRetries) {
      try {
        // node-fetchの型エラー回避のため、RequestInitのbodyがFormDataの場合はform-urlencodedに変換
        const requestInit = request.toRequestInit();
        if (requestInit.body instanceof FormData) {
          requestInit.body = new URLSearchParams(request.body as Record<string, string>).toString();
          // headersがRecord<string, string>型である前提で修正
          if (
            requestInit.headers &&
            typeof requestInit.headers === 'object' &&
            !Array.isArray(requestInit.headers)
          ) {
            (requestInit.headers as Record<string, string>)['Content-Type'] =
              'application/x-www-form-urlencoded';
          }
        }
        // fetchのbodyがWeb Streams APIのReadableStreamの場合はundefinedにする
        if (
          typeof requestInit.body === 'object' &&
          requestInit.body &&
          typeof (requestInit.body as { getReader: () => unknown }).getReader === 'function'
        ) {
          requestInit.body = '';
        }
        const response = await this.fetchFn(request.url, requestInit as RequestInit);

        // 2xx系のステータスコードを成功とみなす
        if (response.status >= 200 && response.status < 300) {
          return {
            success: true,
            statusCode: response.status,
            message: response.statusText,
            retries,
          };
        }

        // エラーレスポンスの場合
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);

        // 一時的なエラーの場合だけリトライ（4xx以外）
        if (response.status < 400 || response.status >= 500) {
          retries++;
          if (retries <= maxRetries) {
            await this.sleep(retryDelay * retries);
            continue;
          }
        } else {
          // 4xxエラーはクライアントエラーなのでリトライしない
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retries++;

        if (retries <= maxRetries) {
          await this.sleep(retryDelay * retries);
          continue;
        }
      }

      break;
    }

    return {
      success: false,
      message: lastError ? lastError.message : 'Unknown error',
      retries,
    };
  }

  /**
   * 指定ミリ秒スリープする
   * @private
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
