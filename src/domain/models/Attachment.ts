import { Buffer } from 'buffer';

/**
 * 添付ファイルドメインモデル
 */

export class Attachment {
  private readonly fileName: string;
  private readonly mimeType: string;
  private readonly fileSize: number;
  private readonly fileContent: Buffer;

  constructor(props: {
    filename: string;
    contentType: string;
    size: number;
    content: Buffer | string;
  }) {
    this.fileName = props.filename;
    this.mimeType = props.contentType;
    this.fileSize = props.size;

    // 文字列の場合はBufferに変換
    if (typeof props.content === 'string') {
      this.fileContent = Buffer.from(props.content, 'base64');
    } else {
      this.fileContent = props.content;
    }
  }

  // ゲッター
  get filename(): string {
    return this.fileName;
  }
  get contentType(): string {
    return this.mimeType;
  }
  get size(): number {
    return this.fileSize;
  }
  get content(): Buffer {
    return this.fileContent;
  }

  // Base64エンコードされた内容を取得
  getBase64Content(): string {
    return this.fileContent.toString('base64');
  }

  // JSONデータを取得
  toJSON(): object {
    return {
      filename: this.fileName,
      contentType: this.mimeType,
      size: this.fileSize,
      // Base64エンコード文字列として内容を返す
      content: this.getBase64Content(),
    };
  }
}
