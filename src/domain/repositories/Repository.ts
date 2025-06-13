/**
 * リポジトリインターフェース
 */

export interface Repository<T, ID> {
  /**
   * IDによるエンティティの取得
   */
  findById(id: ID): Promise<T | null>;

  /**
   * すべてのエンティティの取得
   */
  findAll(): Promise<T[]>;

  /**
   * エンティティの保存
   */
  save(entity: T): Promise<T>;

  /**
   * エンティティの削除
   */
  delete(id: ID): Promise<boolean>;
}
