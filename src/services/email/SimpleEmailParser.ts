/**
 * シンプルなメール解析クラス
 * mailparserの代替として、Node.js標準ライブラリのみを使用
 */

import type { ParsedEmail } from '@/types';

export class SimpleEmailParser {
  /**
   * 生のメールデータをパースする
   * @param buffer メールの生データ
   * @returns ParsedEmail パース結果
   */
  static async parse(buffer: Buffer): Promise<ParsedEmail> {
    const content = buffer.toString('utf8');
    const lines = content.split('\r\n');

    let headerEnd = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === '') {
        headerEnd = i;
        break;
      }
    }

    if (headerEnd === -1) {
      throw new Error('Invalid email format: no header/body separator found');
    }

    const headerLines = lines.slice(0, headerEnd);
    const bodyLines = lines.slice(headerEnd + 1);

    // ヘッダーの解析
    const headers = this.parseHeaders(headerLines);

    // 本文の解析
    const { text, html, attachments } = this.parseBody(bodyLines.join('\r\n'), headers);

    return {
      subject: headers['subject'],
      from: headers['from'],
      to: headers['to']?.split(',').map(s => s.trim()),
      cc: headers['cc']?.split(',').map(s => s.trim()),
      bcc: headers['bcc']?.split(',').map(s => s.trim()),
      messageId: headers['message-id'],
      date: headers['date'] ? new Date(headers['date']) : undefined,
      text,
      html,
      attachments,
    };
  }

  /**
   * ヘッダー行をパースする
   */
  private static parseHeaders(headerLines: string[]): Record<string, string> {
    const headers: Record<string, string> = {};
    let currentHeader = '';
    let currentValue = '';

    for (const line of headerLines) {
      if (line.startsWith(' ') || line.startsWith('\t')) {
        // 継続行
        currentValue += ' ' + line.trim();
      } else {
        // 新しいヘッダー
        if (currentHeader) {
          headers[currentHeader.toLowerCase()] = this.decodeHeader(currentValue);
        }

        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          currentHeader = line.substring(0, colonIndex).trim();
          currentValue = line.substring(colonIndex + 1).trim();
        }
      }
    }

    // 最後のヘッダーを追加
    if (currentHeader) {
      headers[currentHeader.toLowerCase()] = this.decodeHeader(currentValue);
    }

    return headers;
  }

  /**
   * ヘッダー値をデコードする（RFC2047対応の簡易版）
   */
  private static decodeHeader(value: string): string {
    // 簡易的なRFC2047デコード
    return value.replace(
      /=\?([^?]+)\?([QB])\?([^?]*)\?=/gi,
      (match, _charset, encoding, encoded) => {
        try {
          if (encoding.toUpperCase() === 'B') {
            // Base64デコード
            return Buffer.from(encoded, 'base64').toString('utf8');
          } else if (encoding.toUpperCase() === 'Q') {
            // Quoted-Printableデコード（簡易版）
            return encoded
              .replace(/=([0-9A-F]{2})/gi, (_: string, hex: string) =>
                String.fromCharCode(parseInt(hex, 16))
              )
              .replace(/_/g, ' ');
          }
        } catch {
          // デコードに失敗した場合は元の値を返す
        }
        return match;
      }
    );
  }

  /**
   * 本文をパースする
   */
  private static parseBody(
    body: string,
    headers: Record<string, string>
  ): {
    text?: string;
    html?: string;
    attachments: Array<{
      filename?: string;
      contentType?: string;
      content: Buffer;
      size: number;
    }>;
  } {
    const contentType = headers['content-type'] || 'text/plain';
    const contentTransferEncoding = headers['content-transfer-encoding'];
    const attachments: Array<{
      filename?: string;
      contentType?: string;
      content: Buffer;
      size: number;
    }> = [];

    // multipartの場合
    if (contentType.includes('multipart/')) {
      const boundaryMatch = contentType.match(/boundary=["']?([^"';]+)["']?/i);
      if (boundaryMatch) {
        const boundary = '--' + boundaryMatch[1];
        return this.parseMultipart(body, boundary);
      }
    }

    // エンコードされた本文をデコード
    const decodedBody = this.decodeBody(body, contentTransferEncoding);

    // シンプルなテキスト/HTMLメール
    if (contentType.includes('text/html')) {
      return { html: decodedBody, attachments };
    } else {
      return { text: decodedBody, attachments };
    }
  }

  /**
   * Content-Transfer-Encodingに基づいて本文をデコードする
   */
  private static decodeBody(body: string, encoding?: string): string {
    if (!encoding) {
      return body;
    }

    switch (encoding.toLowerCase()) {
      case 'quoted-printable':
        return this.decodeQuotedPrintable(body);
      case 'base64':
        try {
          return Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8');
        } catch {
          return body; // デコードに失敗した場合は元の値を返す
        }
      case '7bit':
      case '8bit':
      case 'binary':
      default:
        return body;
    }
  }

  /**
   * Quoted-Printableデコード
   */
  private static decodeQuotedPrintable(input: string): string {
    // まず=で始まる16進数エンコードをバイト配列に変換
    const bytes: number[] = [];
    let i = 0;
    while (i < input.length) {
      if (input[i] === '=' && i + 2 < input.length) {
        if (input.slice(i, i + 3) === '=\r\n') {
          // soft line break - skip
          i += 3;
          continue;
        }
        const hex = input.slice(i + 1, i + 3);
        if (/^[0-9A-F]{2}$/i.test(hex)) {
          bytes.push(parseInt(hex, 16));
          i += 3;
          continue;
        }
      }
      bytes.push(input.charCodeAt(i));
      i++;
    }

    // バイト配列をUTF-8文字列に変換
    const buffer = Buffer.from(bytes);
    return buffer.toString('utf8').replace(/\r\n/g, '\n');
  }

  /**
   * マルチパートメールをパースする
   */
  private static parseMultipart(
    body: string,
    boundary: string
  ): {
    text?: string;
    html?: string;
    attachments: Array<{
      filename?: string;
      contentType?: string;
      content: Buffer;
      size: number;
    }>;
  } {
    const parts = body.split(boundary).slice(1, -1); // 最初と最後は除外
    let text: string | undefined;
    let html: string | undefined;
    const attachments: Array<{
      filename?: string;
      contentType?: string;
      content: Buffer;
      size: number;
    }> = [];

    for (const part of parts) {
      const lines = part.trim().split('\r\n');
      let headerEnd = -1;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i] === '') {
          headerEnd = i;
          break;
        }
      }

      if (headerEnd === -1) continue;

      const partHeaders = this.parseHeaders(lines.slice(0, headerEnd));
      const partBody = lines.slice(headerEnd + 1).join('\r\n');
      const contentType = partHeaders['content-type'] || 'text/plain';
      const contentTransferEncoding = partHeaders['content-transfer-encoding'];

      if (contentType.includes('text/plain') && !text) {
        text = this.decodeBody(partBody, contentTransferEncoding);
      } else if (contentType.includes('text/html') && !html) {
        html = this.decodeBody(partBody, contentTransferEncoding);
      } else {
        // 添付ファイルとして処理
        const filename = this.extractFilename(partHeaders);
        const content =
          contentTransferEncoding === 'base64'
            ? Buffer.from(partBody.replace(/\r\n/g, ''), 'base64')
            : Buffer.from(partBody, 'utf8');
        attachments.push({
          filename,
          contentType,
          content,
          size: content.length,
        });
      }
    }

    return { text, html, attachments };
  }

  /**
   * ファイル名を抽出する
   */
  private static extractFilename(headers: Record<string, string>): string | undefined {
    const contentDisposition = headers['content-disposition'];
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename=["']?([^"';]+)["']?/i);
      if (filenameMatch) {
        return filenameMatch[1];
      }
    }
    return undefined;
  }
}
