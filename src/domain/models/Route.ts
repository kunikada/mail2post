/**
 * ルート設定ドメインモデル
 */

export type RouteFormat = 'json' | 'form' | 'raw';
export type AuthType = 'none' | 'basic' | 'bearer';
export type HtmlMode = 'text' | 'html' | 'both';
export type InlineImagesMode = 'ignore' | 'base64' | 'urls';

export class Route {
  private readonly email: string;
  private readonly endpoint: string;
  private readonly messageFormat: RouteFormat;
  private readonly requestHeaders: Map<string, string>;
  private readonly authentication: AuthType;
  private readonly token?: string;
  private readonly retries: number;
  private readonly delay: number;
  private readonly defaultRoute: boolean;
  private readonly htmlProcessing: HtmlMode;
  private readonly imageHandling: InlineImagesMode;
  private readonly sizeLimit?: number;

  constructor(props: {
    emailAddress: string;
    postEndpoint: string;
    format?: RouteFormat;
    headers?: Map<string, string> | Record<string, string>;
    authType?: AuthType;
    authToken?: string;
    retryCount?: number;
    retryDelay?: number;
    isDefault?: boolean;
    htmlMode?: HtmlMode;
    inlineImages?: InlineImagesMode;
    maxSize?: number;
  }) {
    this.email = props.emailAddress;
    this.endpoint = props.postEndpoint;
    this.messageFormat = props.format || 'json';
    this.authentication = props.authType || 'none';
    this.token = props.authToken;
    this.retries = props.retryCount || 3;
    this.delay = props.retryDelay || 1000;
    this.defaultRoute = props.isDefault || false;
    this.htmlProcessing = props.htmlMode || 'text';
    this.imageHandling = props.inlineImages || 'ignore';
    this.sizeLimit = props.maxSize;

    // ヘッダーの変換
    this.requestHeaders = new Map<string, string>();
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
  get emailAddress(): string {
    return this.email;
  }
  get postEndpoint(): string {
    return this.endpoint;
  }
  get format(): RouteFormat {
    return this.messageFormat;
  }
  get authType(): AuthType {
    return this.authentication;
  }
  get authToken(): string | undefined {
    return this.token;
  }
  get retryCount(): number {
    return this.retries;
  }
  get retryDelay(): number {
    return this.delay;
  }
  get isDefault(): boolean {
    return this.defaultRoute;
  }
  get htmlMode(): HtmlMode {
    return this.htmlProcessing;
  }
  get inlineImages(): InlineImagesMode {
    return this.imageHandling;
  }
  get maxSize(): number | undefined {
    return this.sizeLimit;
  }

  get headers(): Record<string, string> {
    return this.getHeadersObject();
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

  // ルートの一致を確認
  matches(emailAddress: string, domain?: string): boolean {
    // ドメインが提供された場合、設定されたユーザー名と組み合わせて比較
    if (domain) {
      const fullEmailAddress = this.email.includes('@') ? this.email : `${this.email}@${domain}`;

      // 完全一致
      if (fullEmailAddress === emailAddress) {
        return true;
      }

      // ワイルドカード一致 (*@domain.com or *)
      if (this.email === '*' || fullEmailAddress === `*@${domain}`) {
        const emailDomain = emailAddress.split('@')[1];
        return emailDomain === domain;
      }
    } else {
      // 従来の動作を維持（完全なメールアドレス形式）
      // 完全一致
      if (this.email === emailAddress) {
        return true;
      }

      // ワイルドカード一致 (*@domain.com)
      if (this.email.startsWith('*@')) {
        const emailDomain = emailAddress.split('@')[1];
        const routeDomain = this.email.slice(2); // '*@'を削除
        return emailDomain === routeDomain;
      }
    }

    return false;
  }

  // JSONオブジェクトに変換
  toJSON(): object {
    return {
      emailAddress: this.email,
      postEndpoint: this.endpoint,
      format: this.messageFormat,
      headers: Object.fromEntries(this.requestHeaders),
      authType: this.authentication,
      authToken: this.token,
      retryCount: this.retries,
      retryDelay: this.delay,
      isDefault: this.defaultRoute,
      transformationOptions: {
        htmlMode: this.htmlProcessing,
        inlineImages: this.imageHandling,
        maxSize: this.sizeLimit,
      },
    };
  }
}
