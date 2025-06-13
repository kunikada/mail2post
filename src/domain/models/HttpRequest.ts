/**
 * HTTPリクエストドメインモデル
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export type ContentType =
  | 'application/json'
  | 'application/x-www-form-urlencoded'
  | 'multipart/form-data'
  | 'text/plain';

export class HttpRequest {
  private readonly requestUrl: string;
  private readonly httpMethod: HttpMethod;
  private readonly requestHeaders: Map<string, string>;
  private readonly requestBody: unknown;
  private readonly mediaType: ContentType;

  constructor(props: {
    url: string;
    method?: HttpMethod;
    headers?: Map<string, string> | Record<string, string>;
    body?: unknown;
    contentType?: ContentType;
  }) {
    this.requestUrl = props.url;
    this.httpMethod = props.method || 'POST';
    this.mediaType = props.contentType || 'application/json';
    this.requestBody = props.body || {};

    // ヘッダーの変換
    this.requestHeaders = new Map<string, string>();

    // デフォルトのContent-Typeを設定
    this.requestHeaders.set('Content-Type', this.mediaType);

    if (props.headers) {
      if (props.headers instanceof Map) {
        props.headers.forEach((value, key) => this.requestHeaders.set(key, value));
      } else {
        Object.entries(props.headers).forEach(([key, value]) =>
          this.requestHeaders.set(key, value)
        );
      }
    }
  }

  // ゲッター
  get url(): string {
    return this.requestUrl;
  }
  get method(): HttpMethod {
    return this.httpMethod;
  }
  get contentType(): ContentType {
    return this.mediaType;
  }
  get body(): unknown {
    return this.requestBody;
  }

  // ヘッダー取得
  getHeader(name: string): string | undefined {
    return this.requestHeaders.get(name);
  }

  // 全ヘッダー取得
  getAllHeaders(): ReadonlyMap<string, string> {
    return new Map(this.requestHeaders);
  }

  // ヘッダーオブジェクトとして取得
  getHeadersObject(): Record<string, string> {
    return Object.fromEntries(this.requestHeaders);
  }

  // fetchライブラリのRequestInit形式でリクエスト情報を取得
  toRequestInit(): {
    method: HttpMethod;
    headers: Record<string, string>;
    body: string | FormData;
  } {
    return {
      method: this.httpMethod,
      headers: this.getHeadersObject(),
      body: this.serializeBody(),
    };
  }

  // リクエストボディをシリアライズ
  private serializeBody(): string | FormData {
    switch (this.mediaType) {
      case 'application/json':
        return JSON.stringify(this.requestBody);

      case 'application/x-www-form-urlencoded':
        return new URLSearchParams(this.requestBody as Record<string, string>).toString();

      case 'multipart/form-data': {
        const formData = new FormData();
        Object.entries(this.requestBody as Record<string, string | Blob>).forEach(([key, value]) =>
          formData.append(key, value)
        );
        return formData;
      }

      case 'text/plain':
      default:
        if (typeof this.requestBody === 'string') {
          return this.requestBody;
        }
        return JSON.stringify(this.requestBody);
    }
  }
}
