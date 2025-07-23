/**
 * メール処理サービス
 */
import type { SESEventRecord } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { Email } from '@domain/models/Email';
import type { Route } from '@domain/models/Route';
import { HttpRequest } from '@domain/models/HttpRequest';
import { SlackMessage } from '@domain/models/SlackMessage';
import type { RouteRepository } from '@domain/repositories/RouteRepository';
import type { EmailRepository } from '@domain/repositories/EmailRepository';

export class EmailProcessingService {
  // 同一メールID用のエンドポイントカウンター
  private static endpointCounters: Record<string, number> = {};

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

      // 該当するルーティング設定を全て取得
      const routes = await this.findAllRoutes(email.recipient);
      if (!routes || routes.length === 0) {
        return { success: false, message: 'ルート設定が見つかりません' };
      }

      // 全てのエンドポイントに送信
      const results = await Promise.all(
        routes.map((route: Route) => this.sendToEndpoint(email, route))
      );

      // 少なくとも1つのエンドポイントが成功した場合は全体を成功とみなす
      const anySuccess = results.some((r: { success: boolean }) => r.success);

      // 全体の結果を返す
      return {
        success: anySuccess,
        message: anySuccess ? '少なくとも1つのエンドポイントが成功' : '全てのエンドポイントが失敗',
        // 最初の成功結果のステータスコードを返す
        statusCode: results.find((r: { success: boolean }) => r.success)?.statusCode,
      };
    } catch (error) {
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
   * @deprecated `findAllRoutes` を使用してください
   */
  private async findRoute(recipient: string): Promise<Route | null> {
    // 完全一致を検索
    let route = await this.routeRepository.findByEmailAddress(recipient);
    if (route) return route;

    // デフォルトルートを検索
    return await this.routeRepository.findDefault();
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
      const body = this.prepareBody(email, format, route);
      const headers = this.prepareHeaders(route, email);

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
    const result = await this.sendWithRetry(request, retryCount, retryDelay);

    // エラー時のみ詳細ログを出力
    if (!result.success) {
      console.error(`エンドポイント送信失敗: ${postEndpoint}`, {
        statusCode: result.statusCode,
        errorMessage: result.message,
        retries: result.retries,
        emailId: email.id,
        recipient: email.recipient,
      });
    }

    return result;
  }

  /**
   * 送信するデータを準備
   * @private
   */
  private prepareBody(
    email: Email,
    format: string,
    route: Route
  ): Record<string, string> | string | object {
    const contentSelection = route.contentSelection;

    // コンテンツ選択に基づいてデータを準備
    const selectedData = this.selectEmailContent(email, contentSelection);

    switch (format) {
      case 'json': {
        // HttpRequestクラスのserializeBody()でJSON.stringify()されるため、オブジェクトをそのまま返す
        return selectedData;
      }
      case 'form': {
        // フォームデータとして送信するため、フラットな構造に変換
        return this.flattenDataForForm(selectedData);
      }
      case 'raw':
      default: {
        // コンテンツ選択に応じてテキストを返す
        if (contentSelection === 'subject') {
          return email.subject;
        } else if (contentSelection === 'body') {
          return email.textBody;
        } else {
          // fullの場合はメール本文をそのまま送信
          return email.textBody;
        }
      }
    }
  }

  /**
   * コンテンツ選択に基づいてメールデータを抽出
   * @private
   */
  private selectEmailContent(email: Email, contentSelection: string): object {
    switch (contentSelection) {
      case 'subject':
        return {
          subject: email.subject,
        };
      case 'body':
        return {
          body: email.textBody,
        };
      case 'full':
      default:
        return email.toJSON();
    }
  }

  /**
   * フォーム送信用にデータをフラット化
   * @private
   */
  private flattenDataForForm(data: object): Record<string, string> {
    const formData: Record<string, string> = {};

    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        formData[key] = value.join(',');
      } else if (typeof value === 'object' && value !== null) {
        // ネストされたオブジェクトをJSON文字列として保存
        formData[key] = JSON.stringify(value);
      } else {
        formData[key] = String(value);
      }
    }

    return formData;
  }

  /**
   * ヘッダーを準備
   * @private
   */
  private prepareHeaders(route: Route, email?: Email): Record<string, string> {
    const headers = { ...route.getHeadersObject() };

    // SESメール受信処理の一意IDを取得または生成してヘッダーに追加
    if (email) {
      // メールヘッダーから既存のX-Mail-Processing-IDを取得
      const existingMailProcessingId = email.getHeader('X-Mail-Processing-ID');

      // 既存のIDがあればそれを使用、なければ新しいUUIDを生成
      let mailProcessingId = existingMailProcessingId || randomUUID();

      // 同一メールの複数エンドポイント処理の場合、エンドポイントごとに一意のIDを付与
      if (route.postEndpoint) {
        // 同一メールIDに対するエンドポイント通し番号を取得・更新
        const emailId = email.id;

        if (!EmailProcessingService.endpointCounters[emailId]) {
          EmailProcessingService.endpointCounters[emailId] = 1;
        } else {
          EmailProcessingService.endpointCounters[emailId]++;
        }

        // 通し番号を付与（1つ目のエンドポイントも含めて全てに通し番号を付与）
        const counter = EmailProcessingService.endpointCounters[emailId];
        mailProcessingId = `${mailProcessingId}-${counter}`;
      }

      headers['X-Mail-Processing-ID'] = mailProcessingId;
    }

    // 認証ヘッダーの追加
    if (route.authType === 'basic' && route.authToken) {
      headers['Authorization'] = `Basic ${route.authToken}`;
    } else if (route.authType === 'bearer' && route.authToken) {
      headers['Authorization'] = `Bearer ${route.authToken}`;
    } else if (route.authType === 'apikey' && route.authToken) {
      headers['x-api-key'] = route.authToken;
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

        // エラーレスポンスの詳細を取得
        let errorDetails = '';
        try {
          // レスポンスボディを取得（テキストとして）
          const responseText = await response.text();
          if (responseText) {
            errorDetails = ` - レスポンス内容: ${responseText.substring(0, 500)}${
              responseText.length > 500 ? '...' : ''
            }`;
          }
        } catch (bodyError) {
          console.warn(`レスポンスボディの取得に失敗: ${bodyError}`);
        }

        // エラーレスポンスの場合
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}${errorDetails}`);

        // エラー詳細をログ出力
        console.error(`HTTP送信エラー: ${request.url}`, {
          statusCode: response.status,
          statusText: response.statusText,
          responseBody: errorDetails.replace(' - レスポンス内容: ', ''),
          attempt: retries + 1,
          maxRetries: maxRetries + 1,
        });

        // 一時的なエラーの場合だけリトライ（4xx以外）
        if (response.status < 400 || response.status >= 500) {
          retries++;
          if (retries <= maxRetries) {
            const sleepTime = retryDelay * retries;
            console.warn(
              `${sleepTime}ms後にリトライします (${retries}/${maxRetries}): ${request.url}`
            );
            await this.sleep(sleepTime);
            continue;
          }
        } else {
          // 4xxエラーはクライアントエラーなのでリトライしない
          console.error(
            `クライアントエラーのためリトライしません: ${response.status} ${response.statusText} (${request.url})`
          );
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // ネットワークエラーの詳細をログ出力
        console.error(`HTTP送信時にネットワークエラーが発生: ${request.url}`, {
          errorName: lastError.name,
          errorMessage: lastError.message,
          attempt: retries + 1,
          maxRetries: maxRetries + 1,
        });

        retries++;

        if (retries <= maxRetries) {
          const sleepTime = retryDelay * retries;
          console.warn(
            `${sleepTime}ms後にリトライします (${retries}/${maxRetries}): ${request.url}`
          );
          await this.sleep(sleepTime);
          continue;
        }
      }

      break;
    }

    // 最終失敗時の詳細ログ
    console.error(`HTTP送信最終失敗: ${request.url}`, {
      totalAttempts: retries,
      finalError: lastError?.message || 'Unknown error',
      url: request.url,
    });

    return {
      success: false,
      statusCode:
        lastError && 'status' in lastError ? (lastError as { status: number }).status : undefined,
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
