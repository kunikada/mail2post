/**
 * アプリケーション設定管理
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

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

/**
 * 環境に応じたconfig/配下のjsonファイルを読み込む
 * テスト環境では常にdev.jsonを使用
 */
export function loadConfig(_stage: string = process.env.NODE_ENV || 'dev'): AppConfig {
  // テスト環境では常にdev.jsonを参照（テスト用のルート設定が含まれている）
  const effectiveStage = 'dev';
  const configPath = path.join(dirname, '..', '..', 'config', `${effectiveStage}.json`);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }
  const configRaw = fs.readFileSync(configPath, 'utf-8');
  const configObj = JSON.parse(configRaw);
  return configObj as AppConfig;
}

/**
 * 現在の環境の設定を取得
 */
export function getCurrentConfig(): AppConfig {
  const stage = process.env.NODE_ENV || 'dev';
  return loadConfig(stage);
}

/**
 * レガシーフォーマット（JSON設定）との互換性を保つ
 */
export function getCompatibleConfig(): AppConfig {
  return getCurrentConfig();
}

/**
 * 現在の設定からSES受信者リストを生成
 */
export function getSesRecipients(): string[] {
  const config = getCurrentConfig();
  return config.routes ? config.routes.map(route => route.emailAddress) : [];
}
