/**
 * ルートリポジトリのインターフェース
 */
import type { Route } from '@domain/models/Route';
import type { Repository } from '@domain/repositories/Repository';

export interface RouteRepository extends Repository<Route, string> {
  /**
   * メールアドレスに一致するルートを検索
   * @param emailAddress メールアドレス
   * @param domain ドメイン名（オプション）
   */
  findByEmailAddress(emailAddress: string, domain?: string): Promise<Route | null>;

  /**
   * メールアドレスに一致する全てのルートを検索
   * @param emailAddress メールアドレス
   * @param domain ドメイン名（オプション）
   */
  findAllByEmailAddress(emailAddress: string, domain?: string): Promise<Route[]>;

  /**
   * デフォルトルートを検索
   */
  findDefault(): Promise<Route | null>;

  /**
   * すべてのルートをリロード
   */
  reload(): Promise<void>;
}
