/**
 * Attachmentモデルの単体テスト
 */

import { describe, expect, it } from 'vitest';
import { Attachment } from '@domain/models/Attachment';
import { Buffer } from 'buffer';

describe('Attachment', () => {
  // コンストラクタとゲッターのテスト
  describe('constructor & getters', () => {
    it('Bufferコンテンツで初期化できる', () => {
      // 準備
      const content = Buffer.from('テスト添付ファイル内容');
      const props = {
        filename: 'test.txt',
        contentType: 'text/plain',
        size: content.length,
        content,
      };

      // 実行
      const attachment = new Attachment(props);

      // 検証
      expect(attachment.filename).toBe(props.filename);
      expect(attachment.contentType).toBe(props.contentType);
      expect(attachment.size).toBe(props.size);
      expect(attachment.content).toBe(content);
    });

    it('Base64文字列コンテンツで初期化できる', () => {
      // 準備
      const original = 'テスト添付ファイル内容';
      const base64Content = Buffer.from(original).toString('base64');
      const props = {
        filename: 'test.txt',
        contentType: 'text/plain',
        size: Buffer.from(base64Content, 'base64').length,
        content: base64Content,
      };

      // 実行
      const attachment = new Attachment(props);

      // 検証
      expect(attachment.filename).toBe(props.filename);
      expect(attachment.contentType).toBe(props.contentType);
      expect(attachment.size).toBe(props.size);
      expect(attachment.content.toString()).toBe(original);
    });
  });

  // Base64エンコードのテスト
  describe('getBase64Content', () => {
    it('コンテンツをBase64エンコードして返す', () => {
      // 準備
      const original = 'テスト添付ファイル内容';
      const content = Buffer.from(original);
      const expectedBase64 = content.toString('base64');

      const attachment = new Attachment({
        filename: 'test.txt',
        contentType: 'text/plain',
        size: content.length,
        content,
      });

      // 実行
      const base64Content = attachment.getBase64Content();

      // 検証
      expect(base64Content).toBe(expectedBase64);
      // 復元テスト
      expect(Buffer.from(base64Content, 'base64').toString()).toBe(original);
    });
  });

  // JSONシリアライズのテスト
  describe('toJSON', () => {
    it('正しいJSON形式でオブジェクトを返す', () => {
      // 準備
      const original = 'テスト添付ファイル内容';
      const content = Buffer.from(original);
      const expectedBase64 = content.toString('base64');

      const attachment = new Attachment({
        filename: 'test.txt',
        contentType: 'text/plain',
        size: content.length,
        content,
      });

      // 実行
      const json = attachment.toJSON();

      // 検証
      expect(json).toEqual({
        filename: 'test.txt',
        contentType: 'text/plain',
        size: content.length,
        content: expectedBase64,
      });
    });
  });
});
