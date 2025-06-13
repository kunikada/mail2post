/**
 * HttpRequestモデルの単体テスト
 */

import { describe, expect, it } from 'vitest';
import { HttpRequest } from '@domain/models/HttpRequest';

describe('HttpRequest', () => {
  // コンストラクタとゲッターのテスト
  describe('constructor & getters', () => {
    it('デフォルト値で初期化できる', () => {
      // 準備
      const url = 'https://example.com/api';

      // 実行
      const request = new HttpRequest({ url });

      // 検証
      expect(request.url).toBe(url);
      expect(request.method).toBe('POST');
      expect(request.contentType).toBe('application/json');
      expect(request.body).toEqual({});
      expect(request.getHeader('Content-Type')).toBe('application/json');
    });

    it('すべてのプロパティを指定して初期化できる', () => {
      // 準備
      const props = {
        url: 'https://example.com/api',
        method: 'GET' as const,
        contentType: 'text/plain' as const,
        body: { key: 'value' },
        headers: { 'X-Custom-Header': 'custom-value' },
      };

      // 実行
      const request = new HttpRequest(props);

      // 検証
      expect(request.url).toBe(props.url);
      expect(request.method).toBe(props.method);
      expect(request.contentType).toBe(props.contentType);
      expect(request.body).toEqual(props.body);
      expect(request.getHeader('Content-Type')).toBe(props.contentType);
      expect(request.getHeader('X-Custom-Header')).toBe('custom-value');
    });

    it('Map形式のヘッダーを指定して初期化できる', () => {
      // 準備
      const headers = new Map<string, string>();
      headers.set('X-Custom-Header', 'custom-value');

      // 実行
      const request = new HttpRequest({
        url: 'https://example.com/api',
        headers,
      });

      // 検証
      expect(request.getHeader('X-Custom-Header')).toBe('custom-value');
    });
  });

  // ヘッダー関連メソッドのテスト
  describe('header methods', () => {
    it('getAllHeadersはすべてのヘッダーを返す', () => {
      // 準備
      const request = new HttpRequest({
        url: 'https://example.com/api',
        headers: {
          'X-Custom-Header-1': 'value1',
          'X-Custom-Header-2': 'value2',
        },
      });

      // 実行
      const headers = request.getAllHeaders();

      // 検証
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('X-Custom-Header-1')).toBe('value1');
      expect(headers.get('X-Custom-Header-2')).toBe('value2');
    });

    it('getHeadersObjectはオブジェクトとしてヘッダーを返す', () => {
      // 準備
      const request = new HttpRequest({
        url: 'https://example.com/api',
        headers: {
          'X-Custom-Header-1': 'value1',
          'X-Custom-Header-2': 'value2',
        },
      });

      // 実行
      const headers = request.getHeadersObject();

      // 検証
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Custom-Header-1']).toBe('value1');
      expect(headers['X-Custom-Header-2']).toBe('value2');
    });
  });

  // リクエスト変換のテスト
  describe('toRequestInit', () => {
    it('fetchで使用可能なRequestInitオブジェクトを返す', () => {
      // 準備
      const request = new HttpRequest({
        url: 'https://example.com/api',
        method: 'POST',
        contentType: 'application/json',
        body: { data: 'test' },
        headers: { 'X-API-Key': 'abc123' },
      });

      // 実行
      const requestInit = request.toRequestInit();

      // 検証
      expect(requestInit.method).toBe('POST');
      expect(requestInit.headers).toEqual({
        'Content-Type': 'application/json',
        'X-API-Key': 'abc123',
      });
      expect(requestInit.body).toBe(JSON.stringify({ data: 'test' }));
    });
  });

  // ボディシリアライズのテスト
  describe('serializeBody (through toRequestInit)', () => {
    it('application/jsonコンテンツタイプでJSONシリアライズする', () => {
      // 準備
      const request = new HttpRequest({
        url: 'https://example.com/api',
        contentType: 'application/json',
        body: { data: 'test' },
      });

      // 実行
      const requestInit = request.toRequestInit();

      // 検証
      expect(requestInit.body).toBe(JSON.stringify({ data: 'test' }));
    });

    it('application/x-www-form-urlencodedコンテンツタイプでURLSearchParamsを使用する', () => {
      // 準備
      const request = new HttpRequest({
        url: 'https://example.com/api',
        contentType: 'application/x-www-form-urlencoded',
        body: { key1: 'value1', key2: 'value2' },
      });

      // 実行
      const requestInit = request.toRequestInit();

      // 検証
      expect(requestInit.body).toBe('key1=value1&key2=value2');
    });

    it('text/plainコンテンツタイプで文字列をそのまま使用する', () => {
      // 準備
      const request = new HttpRequest({
        url: 'https://example.com/api',
        contentType: 'text/plain',
        body: 'plain text content',
      });

      // 実行
      const requestInit = request.toRequestInit();

      // 検証
      expect(requestInit.body).toBe('plain text content');
    });

    it('text/plainコンテンツタイプでオブジェクトの場合はJSONシリアライズする', () => {
      // 準備
      const request = new HttpRequest({
        url: 'https://example.com/api',
        contentType: 'text/plain',
        body: { key: 'value' },
      });

      // 実行
      const requestInit = request.toRequestInit();

      // 検証
      expect(requestInit.body).toBe(JSON.stringify({ key: 'value' }));
    });

    // multipart/form-dataのテストはブラウザ環境でFormDataが必要なため省略
  });
});
