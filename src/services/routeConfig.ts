/**
 * ルーティング設定管理サービス
 * @deprecated 代わりに FileRouteRepository を使用してください
 */

import * as fs from 'fs/promises';
import type { RouteConfig } from '@/types';

// 設定ファイルのパス（デフォルト値）
const configPath = 'config/dev.json';

// キャッシュされた設定
let cachedRoutes: RouteConfig[] = [];
let lastLoadTime = 0;
const CACHE_TTL = 60 * 1000; // 1分間キャッシュを保持

/**
 * ルーティング設定をロードする
 * キャッシュが有効な場合はキャッシュから返す
 *
 * @returns Promise<RouteConfig[]> - ルート設定の配列
 * @deprecated 代わりに FileRouteRepository.findAll() を使用してください
 */
export async function loadRouteConfig(): Promise<RouteConfig[]> {
  const now = Date.now();

  // キャッシュが有効な場合はキャッシュから返す
  if (cachedRoutes.length > 0 && now - lastLoadTime < CACHE_TTL) {
    return cachedRoutes;
  }

  try {
    // ファイルからルーティング設定を読み込む
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);

    if (!config.routes || !Array.isArray(config.routes)) {
      throw new Error('routes配列が見つかりません');
    }

    // ルート設定を更新
    cachedRoutes = config.routes;
    lastLoadTime = now;

    // デフォルト設定の適用
    if (config.defaults) {
      applyDefaults(cachedRoutes, config.defaults);
    }

    console.log(`${cachedRoutes.length}件のルート設定をロードしました`);
    return cachedRoutes;
  } catch (error) {
    console.error(`ルーティング設定のロード中にエラーが発生しました: ${error}`);
    if (cachedRoutes.length > 0) {
      console.log('キャッシュされた設定を使用します');
      return cachedRoutes;
    }
    return [];
  }
}

/**
 * デフォルト設定を適用する
 *
 * @param routes - 設定を適用するルート配列
 * @param defaults - デフォルト設定
 * @private
 */
function applyDefaults(routes: RouteConfig[], defaults: Record<string, unknown>): void {
  for (const route of routes) {
    // 基本プロパティに対するデフォルト値
    Object.keys(defaults).forEach(key => {
      if (key !== 'transformationOptions' && route[key as keyof RouteConfig] === undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (route as any)[key] = defaults[key];
      }
    });

    // transformationOptionsに対するデフォルト値
    if (defaults.transformationOptions && typeof defaults.transformationOptions === 'object') {
      route.transformationOptions = route.transformationOptions || {};

      Object.keys(defaults.transformationOptions as Record<string, unknown>).forEach(key => {
        if (
          route.transformationOptions &&
          route.transformationOptions[key as keyof typeof route.transformationOptions] === undefined
        ) {
          (route.transformationOptions as Record<string, unknown>)[key] = (
            defaults.transformationOptions as Record<string, unknown>
          )[key];
        }
      });
    }
  }
}
