/**
 * Routeモデルの単体テスト
 */

import { describe, expect, it } from 'vitest';
import { Route } from '@domain/models/Route';

describe('Route', () => {
  // コンストラクタとゲッターのテスト
  describe('constructor & getters', () => {
    it('必須プロパティのみで初期化できる', () => {
      // 準備
      const props = {
        emailAddress: 'test@example.com',
        postEndpoint: 'https://example.com/webhook',
      };

      // 実行
      const route = new Route(props);

      // 検証
      expect(route.emailAddress).toBe(props.emailAddress);
      expect(route.postEndpoint).toBe(props.postEndpoint);
      expect(route.format).toBe('json');
      expect(route.authType).toBe('none');
      expect(route.retryCount).toBe(3);
      expect(route.retryDelay).toBe(1000);
      expect(route.isDefault).toBe(false);
      expect(route.htmlMode).toBe('text');
      expect(route.inlineImages).toBe('ignore');
      expect(route.maxSize).toBeUndefined();
      expect(route.contentSelection).toBe('full');
      expect(route.allowedSenders).toEqual([]);
    });

    it('すべてのプロパティを指定して初期化できる', () => {
      // 準備
      const props = {
        emailAddress: 'test@example.com',
        postEndpoint: 'https://example.com/webhook',
        format: 'form' as const,
        headers: { 'X-Custom-Header': 'custom-value' },
        authType: 'bearer' as const,
        authToken: 'token123',
        retryCount: 5,
        retryDelay: 2000,
        isDefault: true,
        htmlMode: 'html' as const,
        inlineImages: 'base64' as const,
        maxSize: 10485760,
        contentSelection: 'subject' as const,
        allowedSenders: ['allowed@example.com', '@trusted.com'],
      };

      // 実行
      const route = new Route(props);

      // 検証
      expect(route.emailAddress).toBe(props.emailAddress);
      expect(route.postEndpoint).toBe(props.postEndpoint);
      expect(route.format).toBe(props.format);
      expect(route.authType).toBe(props.authType);
      expect(route.authToken).toBe(props.authToken);
      expect(route.retryCount).toBe(props.retryCount);
      expect(route.retryDelay).toBe(props.retryDelay);
      expect(route.isDefault).toBe(props.isDefault);
      expect(route.htmlMode).toBe(props.htmlMode);
      expect(route.inlineImages).toBe(props.inlineImages);
      expect(route.maxSize).toBe(props.maxSize);
      expect(route.contentSelection).toBe(props.contentSelection);
      expect(route.allowedSenders).toEqual(props.allowedSenders);
      expect(route.getHeader('X-Custom-Header')).toBe('custom-value');
    });
  });

  // ヘッダー関連メソッドのテスト
  describe('header methods', () => {
    it('getAllHeadersはすべてのヘッダーを返す', () => {
      // 準備
      const route = new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://example.com/webhook',
        headers: {
          'X-Custom-Header-1': 'value1',
          'X-Custom-Header-2': 'value2',
        },
      });

      // 実行
      const headers = route.getAllHeaders();

      // 検証
      expect(headers.get('X-Custom-Header-1')).toBe('value1');
      expect(headers.get('X-Custom-Header-2')).toBe('value2');
    });

    it('getHeadersObjectはオブジェクトとしてヘッダーを返す', () => {
      // 準備
      const route = new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://example.com/webhook',
        headers: {
          'X-Custom-Header-1': 'value1',
          'X-Custom-Header-2': 'value2',
        },
      });

      // 実行
      const headers = route.getHeadersObject();

      // 検証
      expect(headers['X-Custom-Header-1']).toBe('value1');
      expect(headers['X-Custom-Header-2']).toBe('value2');
    });
  });

  // ルートのマッチングロジックのテスト
  describe('matches', () => {
    it('完全一致の場合はtrueを返す', () => {
      // 準備
      const route = new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://example.com/webhook',
      });

      // 実行 & 検証
      expect(route.matches('test@example.com')).toBe(true);
    });

    it('完全一致しない場合はfalseを返す', () => {
      // 準備
      const route = new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://example.com/webhook',
      });

      // 実行 & 検証
      expect(route.matches('other@example.com')).toBe(false);
    });

    it('ワイルドカードドメイン一致の場合はtrueを返す', () => {
      // 準備
      const route = new Route({
        emailAddress: '*@example.com',
        postEndpoint: 'https://example.com/webhook',
      });

      // 実行 & 検証
      expect(route.matches('test@example.com')).toBe(true);
      expect(route.matches('other@example.com')).toBe(true);
    });

    it('ワイルドカードドメイン不一致の場合はfalseを返す', () => {
      // 準備
      const route = new Route({
        emailAddress: '*@example.com',
        postEndpoint: 'https://example.com/webhook',
      });

      // 実行 & 検証
      expect(route.matches('test@other.com')).toBe(false);
    });
  });

  // JSONシリアライズのテスト
  describe('toJSON', () => {
    it('正しいJSON形式でオブジェクトを返す', () => {
      // 準備
      const route = new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://example.com/webhook',
        format: 'json',
        headers: { 'X-Custom-Header': 'custom-value' },
        authType: 'bearer',
        authToken: 'token123',
        retryCount: 5,
        retryDelay: 2000,
        isDefault: true,
        htmlMode: 'both',
        inlineImages: 'base64',
        maxSize: 10485760,
        allowedSenders: ['allowed@example.com', '@trusted.com'],
      });

      // 実行
      const json = route.toJSON();

      // 検証
      expect(json).toEqual({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://example.com/webhook',
        format: 'json',
        headers: { 'X-Custom-Header': 'custom-value' },
        authType: 'bearer',
        authToken: 'token123',
        retryCount: 5,
        retryDelay: 2000,
        isDefault: true,
        transformationOptions: {
          htmlMode: 'both',
          inlineImages: 'base64',
          maxSize: 10485760,
          contentSelection: 'full',
          allowedSenders: ['allowed@example.com', '@trusted.com'],
        },
      });
    });
  });

  // contentSelectionのテスト
  describe('contentSelection', () => {
    it('デフォルトでfullが設定される', () => {
      const route = new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://example.com/webhook',
      });

      expect(route.contentSelection).toBe('full');
    });

    it('subjectを指定できる', () => {
      const route = new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://example.com/webhook',
        contentSelection: 'subject',
      });

      expect(route.contentSelection).toBe('subject');
    });

    it('bodyを指定できる', () => {
      const route = new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://example.com/webhook',
        contentSelection: 'body',
      });

      expect(route.contentSelection).toBe('body');
    });

    it('toJSONでcontentSelectionが出力される', () => {
      const route = new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://example.com/webhook',
        contentSelection: 'subject',
      });

      const json = route.toJSON();

      expect(json).toEqual({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://example.com/webhook',
        format: 'json',
        headers: {},
        authType: 'none',
        authToken: undefined,
        retryCount: 3,
        retryDelay: 1000,
        isDefault: false,
        transformationOptions: {
          htmlMode: 'text',
          inlineImages: 'ignore',
          maxSize: undefined,
          contentSelection: 'subject',
          allowedSenders: [],
        },
      });
    });
  });

  // 新機能のテスト
  describe('email validation features', () => {
    it('allowedSendersの設定が正しく反映される', () => {
      // 準備
      const route = new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://example.com/webhook',
        allowedSenders: ['sender1@example.com', '@trusted.com', 'sender2@test.com'],
      });

      // 検証
      expect(route.allowedSenders).toEqual([
        'sender1@example.com',
        '@trusted.com',
        'sender2@test.com',
      ]);
    });

    it('allowedSendersが未設定の場合は空配列になる', () => {
      // 準備
      const route = new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://example.com/webhook',
      });

      // 検証
      expect(route.allowedSenders).toEqual([]);
    });

    it('maxSizeの設定が正しく反映される', () => {
      // 準備
      const route = new Route({
        emailAddress: 'test@example.com',
        postEndpoint: 'https://example.com/webhook',
        maxSize: 5242880, // 5MB
      });

      // 検証
      expect(route.maxSize).toBe(5242880);
    });
  });
});
