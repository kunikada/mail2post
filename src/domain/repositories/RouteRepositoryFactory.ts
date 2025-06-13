/**
 * ルートリポジトリファクトリ
 * 設定に基づいて適切なRepositoryインスタンスを作成
 */

import { RouteRepository } from './RouteRepository';
import { FileRouteRepository } from './FileRouteRepository';
// 将来的に必要に応じてコメントアウトを解除
// import { S3RouteRepository } from './S3RouteRepository';

/**
 * リポジトリの種類を表す列挙型
 */
export enum RepositoryType {
  FILE = 'file',
  S3 = 's3',
}

/**
 * ルートリポジトリファクトリ
 */
export class RouteRepositoryFactory {
  /**
   * 環境変数に基づいてルートリポジトリのインスタンスを作成
   */
  static create(): RouteRepository {
    const repositoryType =
      (process.env.ROUTE_REPOSITORY_TYPE as RepositoryType) || RepositoryType.FILE;

    switch (repositoryType) {
      case RepositoryType.FILE:
        return new FileRouteRepository();

      // 将来的にS3リポジトリが必要になった場合は以下のコメントを解除
      // case RepositoryType.S3:
      //   return new S3RouteRepository();

      default:
        console.warn(`未知のリポジトリタイプ: ${repositoryType}. FileRepositoryを使用します。`);
        return new FileRouteRepository();
    }
  }

  /**
   * 指定されたタイプのリポジトリインスタンスを作成
   */
  static createByType(type: RepositoryType): RouteRepository {
    switch (type) {
      case RepositoryType.FILE:
        return new FileRouteRepository();

      // 将来的にS3リポジトリが必要になった場合は以下のコメントを解除
      // case RepositoryType.S3:
      //   return new S3RouteRepository();

      default:
        throw new Error(`サポートされていないリポジトリタイプ: ${type}`);
    }
  }
}
