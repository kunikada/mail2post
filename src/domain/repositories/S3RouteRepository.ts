/**
 * S3ベースのルートリポジトリ実装
 *
 * 注意: このファイルは現在使用されていませんが、将来的にS3ベースの
 * 動的な設定管理が必要になった場合に備えて保持されています。
 *
 * 使用する場合は:
 * 1. RouteRepositoryFactory.tsでS3RouteRepositoryのimportとcaseを有効化
 * 2. 環境変数 ROUTE_REPOSITORY_TYPE=s3 を設定
 * 3. 必要なAWS権限を設定
 *
 * @deprecated 現在は使用されていません。FileRouteRepositoryを使用してください。
 */

import { S3 } from '@aws-sdk/client-s3';
import { AuthType, Route } from '@domain/models/Route';
import type { RouteRepository } from '@domain/repositories/RouteRepository';
import type { RouteConfigData, RouteData } from '@/types';
import { getCurrentConfig } from '@services/config';

export class S3RouteRepository implements RouteRepository {
  private readonly s3Client: S3;
  private readonly bucketName: string;
  private readonly configKey: string;
  private cachedRoutes: Route[] = [];
  private lastLoadTime = 0;
  private readonly cacheTtl: number;

  constructor(
    options: {
      bucketName?: string;
      configKey?: string;
      cacheTtl?: number;
      s3Client?: S3;
    } = {}
  ) {
    const config = getCurrentConfig();
    this.bucketName = options.bucketName || config.aws.bucketName;
    this.configKey = options.configKey || 'config/routes.json';
    this.cacheTtl = options.cacheTtl || 60 * 1000; // デフォルトは1分

    // S3クライアントの初期化
    this.s3Client =
      options.s3Client ||
      new S3({
        endpoint: process.env.AWS_ENDPOINT_URL || undefined,
        region: config.aws.region,
        credentials: process.env.AWS_ACCESS_KEY_ID
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
            }
          : undefined,
        forcePathStyle: process.env.AWS_ENDPOINT_URL ? true : undefined,
      });
  }

  /**
   * IDによるルートの取得
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
   */
  async save(route: Route): Promise<Route> {
    await this.loadRoutesIfNeeded();

    // 既存のルートを削除
    this.cachedRoutes = this.cachedRoutes.filter(r => r.emailAddress !== route.emailAddress);

    // 新しいルートを追加
    this.cachedRoutes.push(route);

    // S3に保存
    await this.saveToS3();

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
      await this.saveToS3();
      return true;
    }

    return false;
  }

  /**
   * メールアドレスに一致するルートを検索
   */
  async findByEmailAddress(emailAddress: string, domain?: string): Promise<Route | null> {
    await this.loadRoutesIfNeeded();

    // ドメインが指定されている場合は新しいロジックを使用
    if (domain) {
      // 完全一致を検索（ユーザー名のみ）
      let route = this.cachedRoutes.find(r => r.matches(emailAddress, domain));
      if (route) return route;
    } else {
      // 従来のロジック（完全なメールアドレス形式）
      // 完全一致を検索
      let route = this.cachedRoutes.find(r => r.emailAddress === emailAddress);
      if (route) return route;

      // ワイルドカード一致を検索 (*@example.com)
      const emailDomain = emailAddress.split('@')[1];
      route = this.cachedRoutes.find(r => r.emailAddress === `*@${emailDomain}`);
      if (route) return route;
    }

    return null;
  }

  /**
   * メールアドレスに一致する全てのルートを検索
   */
  async findAllByEmailAddress(emailAddress: string, domain?: string): Promise<Route[]> {
    await this.loadRoutesIfNeeded();

    if (domain) {
      // ドメインが指定されている場合は新しいロジックを使用
      // 完全一致を検索（ユーザー名のみ）
      const routes = this.cachedRoutes.filter(r => r.matches(emailAddress, domain));
      return routes;
    } else {
      // 従来のロジック（完全なメールアドレス形式）
      // 完全一致を検索
      const routes = this.cachedRoutes.filter(r => r.emailAddress === emailAddress);

      // 完全一致があればそれを返す
      if (routes.length > 0) return routes;

      // ワイルドカード一致を検索 (*@example.com)
      const emailDomain = emailAddress.split('@')[1];
      const wildcardRoutes = this.cachedRoutes.filter(r => r.emailAddress === `*@${emailDomain}`);

      return wildcardRoutes;
    }
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
      console.log(`S3からルート設定を読み込み中: s3://${this.bucketName}/${this.configKey}`);

      // S3からルーティング設定を読み込む
      const result = await this.s3Client.getObject({
        Bucket: this.bucketName,
        Key: this.configKey,
      });

      if (!result.Body) {
        throw new Error('S3オブジェクトの本文が空です');
      }

      const configData = await result.Body.transformToString();
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
      console.log(`${this.cachedRoutes.length}件のルート設定をS3からロードしました`);
    } catch (error) {
      console.error(`S3ルート設定のロード中にエラーが発生しました: ${error}`);

      // エラーが発生した場合でも、キャッシュが存在する場合はそれを引き続き使用
      if (this.cachedRoutes.length === 0) {
        throw error; // キャッシュがない場合は例外をスロー
      }
    }
  }

  /**
   * ルート設定をS3に保存
   * @private
   */
  private async saveToS3(): Promise<void> {
    // JSONデータの作成
    const configData = {
      routes: this.cachedRoutes.map(route => route.toJSON()),
    };

    // S3に書き込み
    await this.s3Client.putObject({
      Bucket: this.bucketName,
      Key: this.configKey,
      Body: JSON.stringify(configData, null, 2),
      ContentType: 'application/json',
    });

    console.log(`ルート設定を s3://${this.bucketName}/${this.configKey} に保存しました`);
  }
}
