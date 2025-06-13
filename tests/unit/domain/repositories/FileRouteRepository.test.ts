/**
 * FileRouteRepositoryの単体テスト
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileRouteRepository } from '@domain/repositories/FileRouteRepository';
import { Route } from '@domain/models/Route';
import * as fs from 'fs/promises';
import * as path from 'path';
import os from 'os';

describe('FileRouteRepository', () => {
  let tempDir: string;
  let configPath: string;
  let repository: FileRouteRepository;

  // 各テスト前に一時ディレクトリと初期設定ファイルを作成
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'route-test-'));
    configPath = path.join(tempDir, 'routes.test.json');

    // 空のルート設定ファイルを作成
    await fs.writeFile(configPath, JSON.stringify({ routes: [] }));

    repository = new FileRouteRepository({ configPath, cacheTtl: 0 }); // キャッシュを無効化
  });

  // 各テスト後に一時ディレクトリを削除
  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.error('テンポラリディレクトリの削除に失敗しました', err);
    }
  });

  // テスト用のルートサンプルを作成
  const createSampleRoute = () => {
    return new Route({
      emailAddress: 'test@example.com',
      postEndpoint: 'https://example.com/webhook',
      format: 'json',
      headers: { 'X-Custom-Header': 'custom-value' },
    });
  };

  const createSampleRoutes = () => {
    return [
      new Route({
        emailAddress: 'test1@example.com',
        postEndpoint: 'https://example.com/webhook1',
      }),
      new Route({
        emailAddress: 'test2@example.com',
        postEndpoint: 'https://example.com/webhook2',
        isDefault: true,
      }),
      new Route({
        emailAddress: '*@example.com',
        postEndpoint: 'https://example.com/webhook-wildcard',
      }),
    ];
  };

  // 初期化テスト
  describe('initialization', () => {
    it('設定ファイルパスをカスタマイズできる', () => {
      const customRepo = new FileRouteRepository({ configPath: '/custom/path.json' });
      // 内部プロパティを直接テストするのは理想的ではないが、この場合は必要
      expect((customRepo as any).configPath).toBe('/custom/path.json');
    });
  });

  // 基本的なCRUD操作のテスト
  describe('CRUD operations', () => {
    it('ルートを保存して取得できる', async () => {
      // 準備
      const route = createSampleRoute();

      // 実行
      await repository.save(route);
      const retrieved = await repository.findById(route.emailAddress);

      // 検証
      expect(retrieved).not.toBeNull();
      expect(retrieved?.emailAddress).toBe(route.emailAddress);
      expect(retrieved?.postEndpoint).toBe(route.postEndpoint);
    });

    it('存在しないルートはnullを返す', async () => {
      // 実行
      const result = await repository.findById('nonexistent@example.com');

      // 検証
      expect(result).toBeNull();
    });

    it('すべてのルートを取得できる', async () => {
      // 準備
      const routes = createSampleRoutes();
      for (const route of routes) {
        await repository.save(route);
      }

      // 実行
      const allRoutes = await repository.findAll();

      // 検証
      expect(allRoutes.length).toBe(routes.length);
      expect(allRoutes.map(r => r.emailAddress).sort()).toEqual(
        routes.map(r => r.emailAddress).sort()
      );
    });

    it('ルートを更新できる', async () => {
      // 準備
      const route = createSampleRoute();
      await repository.save(route);

      // 更新されたルート
      const updatedRoute = new Route({
        emailAddress: route.emailAddress,
        postEndpoint: 'https://example.com/updated',
        format: 'form',
      });

      // 実行
      await repository.save(updatedRoute);
      const retrieved = await repository.findById(route.emailAddress);

      // 検証
      expect(retrieved).not.toBeNull();
      expect(retrieved?.postEndpoint).toBe('https://example.com/updated');
      expect(retrieved?.format).toBe('form');
    });

    it('ルートを削除できる', async () => {
      // 準備
      const route = createSampleRoute();
      await repository.save(route);

      // 実行 - 削除前の確認
      let retrieved = await repository.findById(route.emailAddress);
      expect(retrieved).not.toBeNull();

      // 削除を実行
      const result = await repository.delete(route.emailAddress);

      // 検証 - 削除結果
      expect(result).toBe(true);

      // 削除後の確認
      retrieved = await repository.findById(route.emailAddress);
      expect(retrieved).toBeNull();
    });

    it('存在しないルートの削除はfalseを返す', async () => {
      // 実行
      const result = await repository.delete('nonexistent@example.com');

      // 検証
      expect(result).toBe(false);
    });
  });

  // 特殊検索機能のテスト
  describe('special queries', () => {
    it('メールアドレスで完全一致するルートを検索できる', async () => {
      // 準備
      const routes = createSampleRoutes();
      for (const route of routes) {
        await repository.save(route);
      }

      // 実行
      const result = await repository.findByEmailAddress('test1@example.com');

      // 検証
      expect(result).not.toBeNull();
      expect(result?.emailAddress).toBe('test1@example.com');
    });

    it('ワイルドカードマッチするルートを検索できる', async () => {
      // 準備
      const routes = createSampleRoutes();
      for (const route of routes) {
        await repository.save(route);
      }

      // 実行 - 直接登録されていないアドレスだがワイルドカードにマッチする
      const result = await repository.findByEmailAddress('other@example.com');

      // 検証
      expect(result).not.toBeNull();
      expect(result?.emailAddress).toBe('*@example.com');
    });

    it('デフォルトルートを検索できる', async () => {
      // 準備
      const routes = createSampleRoutes();
      for (const route of routes) {
        await repository.save(route);
      }

      // 実行
      const result = await repository.findDefault();

      // 検証
      expect(result).not.toBeNull();
      expect(result?.emailAddress).toBe('test2@example.com');
      expect(result?.isDefault).toBe(true);
    });
  });

  // エラー処理とリロードのテスト
  describe('error handling and reload', () => {
    it('設定ファイルが存在しない場合はエラーをスロー', async () => {
      // 準備 - 存在しないパスを指定
      const nonexistentPath = path.join(tempDir, 'nonexistent.json');
      const errorRepo = new FileRouteRepository({ configPath: nonexistentPath });

      // 実行 & 検証
      await expect(errorRepo.findAll()).rejects.toThrow();
    });

    it('強制的にリロードできる', async () => {
      // 準備 - キャッシュを有効にしたリポジトリ
      const cachedRepo = new FileRouteRepository({ configPath, cacheTtl: 60000 });
      const route = createSampleRoute();
      await cachedRepo.save(route);

      // 直接ファイルを書き換え（リポジトリを通さない）
      const updatedConfig = {
        routes: [
          {
            emailAddress: route.emailAddress,
            postEndpoint: 'https://example.com/modified',
            format: 'json',
          },
        ],
      };
      await fs.writeFile(configPath, JSON.stringify(updatedConfig));

      // 実行 - キャッシュされているためまだ古い値
      let retrieved = await cachedRepo.findById(route.emailAddress);
      expect(retrieved?.postEndpoint).toBe(route.postEndpoint);

      // リロードを実行
      await cachedRepo.reload();

      // 検証 - 新しい値が反映される
      retrieved = await cachedRepo.findById(route.emailAddress);
      expect(retrieved?.postEndpoint).toBe('https://example.com/modified');
    });
  });
});
