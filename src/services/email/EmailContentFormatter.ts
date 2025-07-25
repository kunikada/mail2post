/**
 * メールコンテンツのフォーマット変換を行うサービス
 */
import { Email } from '@domain/models/Email';
import type { HtmlMode } from '@domain/models/Route';

export class EmailContentFormatter {
  /**
   * コンテンツ選択に基づいてメールデータを抽出
   */
  selectContent(email: Email, contentSelection: string, htmlMode: HtmlMode = 'text'): object {
    switch (contentSelection) {
      case 'subject':
        return {
          subject: email.subject,
        };
      case 'body':
        return this.prepareBodyContent(email, htmlMode);
      case 'full':
      default:
        return email.toJSON();
    }
  }

  /**
   * HTMLモードに応じてボディコンテンツを準備
   */
  prepareBodyContent(email: Email, htmlMode: HtmlMode): object {
    const textBody = email.textBody;
    const htmlBody = email.htmlBody;

    switch (htmlMode) {
      case 'text':
        return { body: textBody };
      case 'html':
        // HTMLが存在すればHTML、なければテキスト
        return { body: htmlBody || textBody };
      case 'both':
        return {
          body: {
            text: textBody,
            html: htmlBody,
          },
        };
      default:
        return { body: textBody };
    }
  }

  /**
   * RAWフォーマット用のボディコンテンツを準備
   */
  prepareRawBodyContent(email: Email, htmlMode: HtmlMode): string {
    const textBody = email.textBody;
    const htmlBody = email.htmlBody;

    switch (htmlMode) {
      case 'text':
        return textBody;
      case 'html':
        // HTMLが存在すればHTML、なければテキスト
        return htmlBody || textBody;
      case 'both':
        // bothの場合はテキストとHTMLを両方含める
        return htmlBody ? `${textBody}\n\n--- HTML ---\n${htmlBody}` : textBody;
      default:
        return textBody;
    }
  }

  /**
   * フォーム送信用にデータをフラット化
   */
  flattenForForm(data: object): Record<string, string> {
    const formData: Record<string, string> = {};

    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        formData[key] = value.join(',');
      } else if (typeof value === 'object' && value !== null) {
        // bodyオブジェクトの特別処理
        if (key === 'body' && 'text' in value && 'html' in value) {
          // bothモードでのbody: {text: ..., html: ...}の場合
          formData['body_text'] = String(value.text || '');
          if (value.html) {
            formData['body_html'] = String(value.html);
          }
        } else {
          // その他のネストされたオブジェクトをJSON文字列として保存
          formData[key] = JSON.stringify(value);
        }
      } else {
        formData[key] = String(value);
      }
    }

    return formData;
  }

  /**
   * メール全体をテキスト形式でフォーマット
   */
  formatAsText(email: Email): string {
    const lines: string[] = [];

    lines.push(`From: ${email.from}`);
    lines.push(`To: ${email.to.join(', ')}`);
    if (email.cc && email.cc.length > 0) {
      lines.push(`CC: ${email.cc.join(', ')}`);
    }
    lines.push(`Subject: ${email.subject}`);
    lines.push(`Date: ${email.timestamp.toISOString()}`);
    lines.push('');
    lines.push(email.textBody);

    if (email.attachments && email.attachments.length > 0) {
      lines.push('');
      lines.push('Attachments:');
      email.attachments.forEach(attachment => {
        lines.push(
          `- ${attachment.filename} (${attachment.contentType}, ${attachment.size} bytes)`
        );
      });
    }

    return lines.join('\n');
  }
}
