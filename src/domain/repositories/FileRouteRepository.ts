/**
 * ファイルベースのルートリポジトリ実装
 */
/// <reference lib="dom" />

import * as fs from 'fs/promises';
import * as path from 'path';
import { AuthType, Route } from '@domain/models/Route';
import type { RouteRepository } from '@domain/repositories/RouteRepository';
import type { RouteConfigData, RouteData } from '@/types';

export class FileRouteRepository implements RouteRepository {
  private readonly configPath: string;
  private cachedRoutes: Route[] = [];
  private lastLoadTime = 0;
  private readonly cacheTtl: number;

  constructor(
    options: {
      configPath?: string;
      cacheTtl?: number;
    } = {}
  ) {
    // Serverlessのstageに基づいて設定ファイルを決定
    // デプロイ時はstage、テスト時は明示的にパス指定
    const defaultConfigPath = `config/${process.env.NODE_ENV || 'dev'}.json`;
    this.configPath = options.configPath || defaultConfigPath;
    this.cacheTtl = options.cacheTtl || 60 * 1000; // デフォルトは1分
  }

  /**
   * IDによるルートの取得
   * (このケースでは、IDはemailAddressと同じ)
   */
  async findById(id: string): Promise<Route | null> {
    await this.loadRoutesIfNeeded();
    return this.cachedRoutes.find(route => route.emailAddress === id) || null;
  }

  /**
   * すべてのルートの取得
   */
  async findAll(): Promise<Route[]> {
    await this.loadRoutesIfNeeded();
    return [...this.cachedRoutes];
  }

  /**
   * ルートの保存
   * (ファイルに書き込む)
   */
  async save(route: Route): Promise<Route> {
    await this.loadRoutesIfNeeded();

    // 既存のルートを削除
    this.cachedRoutes = this.cachedRoutes.filter(r => r.emailAddress !== route.emailAddress);

    // 新しいルートを追加
    this.cachedRoutes.push(route);

    // ファイルに保存
    await this.saveToFile();

    return route;
  }

  /**
   * ルートの削除
   */
  async delete(id: string): Promise<boolean> {
    await this.loadRoutesIfNeeded();

    const initialLength = this.cachedRoutes.length;
    this.cachedRoutes = this.cachedRoutes.filter(route => route.emailAddress !== id);

    if (initialLength !== this.cachedRoutes.length) {
      await this.saveToFile();
      return true;
    }

    return false;
  }

  /**
   * メールアドレスに一致するルートを検索
   */
  async findByEmailAddress(emailAddress: string): Promise<Route | null> {
    await this.loadRoutesIfNeeded();

    // 完全一致を検索
    let route = this.cachedRoutes.find(r => r.emailAddress === emailAddress);
    if (route) return route;

    // ワイルドカード一致を検索 (*@example.com)
    const emailDomain = emailAddress.split('@')[1];
    route = this.cachedRoutes.find(r => r.emailAddress === `*@${emailDomain}`);
    if (route) return route;

    return null;
  }

  /**
   * メールアドレスに一致する全てのルートを検索
   */
  async findAllByEmailAddress(emailAddress: string): Promise<Route[]> {
    await this.loadRoutesIfNeeded();

    // 完全一致を検索
    const routes = this.cachedRoutes.filter(r => r.emailAddress === emailAddress);

    // 完全一致があればそれを返す
    if (routes.length > 0) return routes;

    // ワイルドカード一致を検索 (*@example.com)
    const emailDomain = emailAddress.split('@')[1];
    const wildcardRoutes = this.cachedRoutes.filter(r => r.emailAddress === `*@${emailDomain}`);

    return wildcardRoutes;
  }

  /**
   * デフォルトルートを検索
   */
  async findDefault(): Promise<Route | null> {
    await this.loadRoutesIfNeeded();
    return this.cachedRoutes.find(r => r.isDefault) || null;
  }

  /**
   * すべてのルートを強制的にリロード
   */
  async reload(): Promise<void> {
    this.lastLoadTime = 0;
    await this.loadRoutesIfNeeded();
  }

  /**
   * 必要に応じてルート設定をロード
   * @private
   */
  private async loadRoutesIfNeeded(): Promise<void> {
    const now = Date.now();

    // キャッシュが有効な場合はスキップ
    if (now - this.lastLoadTime < this.cacheTtl && this.cachedRoutes.length > 0) {
      return;
    }

    try {
      // ファイルからルーティング設定を読み込む
      const configData = await fs.readFile(this.configPath, 'utf8');
      const config = JSON.parse(configData) as RouteConfigData;

      if (!config.routes || !Array.isArray(config.routes)) {
        throw new Error('routes配列が見つかりません');
      }

      // ルート設定を更新
      this.cachedRoutes = config.routes.map((routeData: RouteData) => {
        // デフォルト設定の適用
        if (config.defaults) {
          // authオブジェクトを展開
          const defaults = { ...config.defaults } as RouteData & {
            auth?: { type?: string; token?: string };
          };
          if (defaults.auth) {
            defaults.authType = defaults.authType || (defaults.auth.type as AuthType);
            defaults.authToken = defaults.authToken || defaults.auth.token;
            delete defaults.auth; // authオブジェクトを削除
          }
          routeData = { ...defaults, ...routeData };
        }

        // Routeドメインモデルのインスタンスを作成
        return new Route({
          emailAddress: routeData.emailAddress,
          postEndpoint: routeData.postEndpoint,
          format: routeData.format,
          headers: routeData.headers,
          authType: routeData.authType,
          authToken: routeData.authToken,
          retryCount: routeData.retryCount,
          retryDelay: routeData.retryDelay,
          isDefault: routeData.isDefault,
          htmlMode: routeData.transformationOptions?.htmlMode,
          inlineImages: routeData.transformationOptions?.inlineImages,
          maxSize: routeData.transformationOptions?.maxSize,
          contentSelection: routeData.transformationOptions?.contentSelection,
        });
      });

      this.lastLoadTime = now;
      console.log(`${this.cachedRoutes.length}件のルート設定をロードしました`);
    } catch (error) {
      console.error(`ルート設定のロード中にエラーが発生しました: ${error}`);

      // エラーが発生した場合でも、キャッシュが存在する場合はそれを引き続き使用
      if (this.cachedRoutes.length === 0) {
        throw error; // キャッシュがない場合は例外をスロー
      }
    }
  }

  /**
   * ルート設定をファイルに保存
   * @private
   */
  private async saveToFile(): Promise<void> {
    // 出力先ディレクトリが存在することを確認
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });

    // JSONデータの作成
    const configData = {
      routes: this.cachedRoutes.map(route => route.toJSON()),
    };

    // ファイルに書き込み
    await fs.writeFile(this.configPath, JSON.stringify(configData, null, 2));
    console.log(`ルート設定を ${this.configPath} に保存しました`);
  }
}
