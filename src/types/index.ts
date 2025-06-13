/**
 * Mail2Post型定義
 */

// メール処理のためのインターフェース
export interface EmailData {
  messageId: string;
  timestamp: string;
  subject: string;
  from: string;
  to: string[];
  cc?: string[];
  recipient: string; // ルーティングに使用される受信アドレス
  body: {
    text?: string;
    html?: string;
  };
  attachments?: Attachment[];
  headers: Record<string, string>;
}

// 添付ファイルのインターフェース
export interface Attachment {
  filename: string;
  contentType: string;
  size: number;
  content: unknown; // Bufferまたはbase64エンコードされた文字列
}

// ルーティング設定のインターフェース
export interface RouteConfig {
  emailAddress: string;
  postEndpoint: string;
  format?: 'json' | 'form' | 'raw';
  headers?: Record<string, string>;
  authType?: 'none' | 'basic' | 'bearer';
  authToken?: string;
  retryCount?: number;
  retryDelay?: number;
  isDefault?: boolean;
  transformationOptions?: {
    htmlMode?: 'text' | 'html' | 'both';
    inlineImages?: 'ignore' | 'base64' | 'urls';
    maxSize?: number;
  };
}

// HTTP送信結果のインターフェース
export interface SendResult {
  success: boolean;
  statusCode?: number;
  message?: string;
  retries?: number;
}

// Slack通知設定のインターフェース
export interface SlackConfig {
  type: 'slack';
  emailAddress: string;
  webhookUrl: string;
  channel?: string;
  username?: string;
  icon?: string;
  messageFormat?: string;
}

// ルート設定データのインターフェース（ファイル読み込み用）
export interface RouteData {
  emailAddress: string;
  postEndpoint: string;
  format?: 'json' | 'form' | 'raw';
  headers?: Record<string, string>;
  authType?: 'none' | 'basic' | 'bearer';
  authToken?: string;
  retryCount?: number;
  retryDelay?: number;
  isDefault?: boolean;
  transformationOptions?: {
    htmlMode?: 'text' | 'html' | 'both';
    inlineImages?: 'ignore' | 'base64' | 'urls';
    maxSize?: number;
  };
}

// ルート設定ファイルのインターフェース
export interface RouteConfigData {
  routes: RouteData[];
  defaults?: Partial<RouteData>;
  aws?: {
    region?: string;
    bucketName?: string;
  };
  ses?: {
    recipients?: string[];
    autoGenerate?: boolean;
  };
  system?: {
    logLevel?: string;
    lambdaMemorySize?: number;
    lambdaTimeout?: number;
    routesConfigSource?: string;
    notificationEmail?: string;
  };
}
