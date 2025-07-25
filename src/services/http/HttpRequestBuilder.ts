/**
 * HTTPリクエストの構築を担当するサービス
 */
import { randomUUID } from 'crypto';
import { Email } from '@domain/models/Email';
import type { Route } from '@domain/models/Route';
import { HttpRequest } from '@domain/models/HttpRequest';
import { SlackMessage } from '@domain/models/SlackMessage';
import { EmailContentFormatter } from '../email/EmailContentFormatter';

export class HttpRequestBuilder {
  // 同一メールID用のエンドポイントカウンター
  private static endpointCounters: Record<string, number> = {};
  private contentFormatter: EmailContentFormatter;

  constructor(contentFormatter?: EmailContentFormatter) {
    this.contentFormatter = contentFormatter || new EmailContentFormatter();
  }

  /**
   * HTTPリクエストを構築
   */
  buildRequest(email: Email, route: Route): HttpRequest {
    const { postEndpoint, format } = route;

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

      return new HttpRequest({
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

      return new HttpRequest({
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
    const htmlMode = route.htmlMode;

    // コンテンツ選択に基づいてデータを準備
    const selectedData = this.contentFormatter.selectContent(email, contentSelection, htmlMode);

    switch (format) {
      case 'json': {
        // HttpRequestクラスのserializeBody()でJSON.stringify()されるため、オブジェクトをそのまま返す
        return selectedData;
      }
      case 'form': {
        // フォームデータとして送信するため、フラットな構造に変換
        return this.contentFormatter.flattenForForm(selectedData);
      }
      case 'raw':
      default: {
        // コンテンツ選択に応じてテキストを返す
        if (contentSelection === 'subject') {
          return email.subject;
        } else if (contentSelection === 'body') {
          return this.contentFormatter.prepareRawBodyContent(email, htmlMode);
        } else {
          // fullの場合はメール全体の情報をテキスト形式で送信
          return this.contentFormatter.formatAsText(email);
        }
      }
    }
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

        if (!HttpRequestBuilder.endpointCounters[emailId]) {
          HttpRequestBuilder.endpointCounters[emailId] = 1;
        } else {
          HttpRequestBuilder.endpointCounters[emailId]++;
        }

        // 通し番号を付与（1つ目のエンドポイントも含めて全てに通し番号を付与）
        const counter = HttpRequestBuilder.endpointCounters[emailId];
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
}
