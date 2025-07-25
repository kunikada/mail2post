/**
 * HTTP送信とリトライロジックを担当するサービス
 */
import { HttpRequest } from '@domain/models/HttpRequest';
import type { SendResult } from '@/types';

export class HttpSender {
  constructor(
    private readonly fetchFn: (url: string, init?: RequestInit) => Promise<Response> = fetch
  ) {}

  /**
   * リトライロジックを含むHTTPリクエスト送信
   */
  async sendWithRetry(
    request: HttpRequest,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<SendResult> {
    let retries = 0;
    let lastError: Error | null = null;
    let lastStatusCode: number | undefined = undefined;

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

        // statusCodeを保存
        lastStatusCode = response.status;

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
        }

        // エラーレスポンスを返す
        return {
          success: false,
          statusCode: lastStatusCode,
          message: lastError.message,
          retries,
        };
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
      statusCode: lastStatusCode,
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
}
