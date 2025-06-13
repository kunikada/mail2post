/**
 * Mail2Post - メールからHTTP POSTへの変換サービス
 *
 * このファイルはアプリケーションのエントリポイントです。
 */

import { processEmailHandler } from '@handlers/processEmail';

// Lambda関数のエクスポート
export const handler = processEmailHandler;

// ローカル開発用のエクスポート (必要に応じて)
export { processEmailHandler };
