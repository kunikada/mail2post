/**
 * アプリケーション設定管理
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { AppConfig } from '../types/index.js';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

/**
 * 環境に応じたconfig/配下のjsonファイルを読み込む
 */
export function loadConfig(stage: string = process.env.NODE_ENV || 'dev'): AppConfig {
  // 複数のパスを試行して設定ファイルを見つける
  const possiblePaths = [
    // ローカル開発環境用（相対パス）
    path.join(dirname, '..', '..', 'config', `${stage}.json`),
    // Lambda環境用（ルートからの相対パス）
    path.join(process.cwd(), 'config', `${stage}.json`),
    // Lambda環境用（絶対パス）
    `/var/task/config/${stage}.json`,
    // 代替パス
    `./config/${stage}.json`,
    `config/${stage}.json`,
  ];

  let configPath = '';
  for (const tryPath of possiblePaths) {
    if (fs.existsSync(tryPath)) {
      configPath = tryPath;
      break;
    }
  }

  if (!configPath) {
    const errorMessage = `Config file not found for stage: ${stage}. Tried paths: ${possiblePaths.join(', ')}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  console.log(`Loading config from: ${configPath}`);
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
