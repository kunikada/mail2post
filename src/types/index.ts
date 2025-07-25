/**
 * Mail2Post型定義
 */
import type { Attachment } from '@domain/models/Attachment';

// シンプルメールパーサーの型定義
export interface ParsedEmail {
  subject?: string;
  from?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  messageId?: string;
  date?: Date;
  text?: string;
  html?: string;
  attachments: Array<{
    filename?: string;
    contentType?: string;
    content: Buffer;
    size: number;
  }>;
}

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

// ルーティング設定のインターフェース
export interface RouteConfig {
  emailAddress: string;
  postEndpoint: string;
  format?: 'json' | 'form' | 'raw';
  headers?: Record<string, string>;
  authType?: 'none' | 'basic' | 'bearer' | 'apikey';
  authToken?: string;
  retryCount?: number;
  retryDelay?: number;
  isDefault?: boolean;
  transformationOptions?: {
    htmlMode?: 'text' | 'html' | 'both';
    inlineImages?: 'ignore' | 'base64' | 'urls';
    maxSize?: number;
    contentSelection?: 'full' | 'subject' | 'body';
    allowedSenders?: string[];
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
  authType?: 'none' | 'basic' | 'bearer' | 'apikey';
  authToken?: string;
  retryCount?: number;
  retryDelay?: number;
  isDefault?: boolean;
  transformationOptions?: {
    htmlMode?: 'text' | 'html' | 'both';
    inlineImages?: 'ignore' | 'base64' | 'urls';
    maxSize?: number;
    contentSelection?: 'full' | 'subject' | 'body';
    allowedSenders?: string[];
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

/**
 * アプリケーション設定の型定義
 */
export interface AppConfig {
  aws: {
    region: string;
    bucketName: string;
  };
  routes: Array<{
    emailAddress: string;
    postEndpoint: string;
    format: string;
    headers?: Record<string, string>;
    authType?: string;
    authToken?: string;
    retryCount?: number;
    retryDelay?: number;
    transformationOptions?: {
      includeAttachments?: boolean;
      attachmentReferences?: boolean;
      htmlMode?: string;
      inlineImages?: string;
      maxSize?: number;
      attachmentStore?: boolean;
      allowedSenders?: string[];
      contentSelection?: string;
    };
  }>;
  defaults: {
    format: string;
    retryCount: number;
    retryDelay: number;
    transformationOptions: {
      htmlMode: string;
      inlineImages: string;
      maxSize: number;
      attachmentStore: boolean;
      allowedSenders: string[];
      contentSelection: string;
    };
    auth: {
      type: string;
      token?: string;
    };
    headers: Record<string, string>;
  };
  system: {
    logLevel: string;
    lambdaMemorySize: number;
    lambdaTimeout: number;
    notificationEmail: string;
  };
}
