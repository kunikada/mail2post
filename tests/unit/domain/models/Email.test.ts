/**
 * Emailモデルの単体テスト
 */

import { describe, it, expect } from 'vitest';
import { Email } from '@domain/models/Email';
import { Attachment } from '@domain/models/Attachment';

describe('Email', () => {
  // コンストラクタとゲッターのテスト
  describe('constructor & getters', () => {
    it('必須プロパティで初期化できる', () => {
      // 準備
      const props = {
        id: 'email-123',
        timestamp: '2023-01-01T12:00:00Z',
        subject: 'テストメール',
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        recipient: 'recipient@example.com',
      };

      // 実行
      const email = new Email(props);

      // 検証
      expect(email.id).toBe(props.id);
      expect(email.timestamp).toBeInstanceOf(Date);
      // Date.toISOStringは常にミリ秒部分を含む
      expect(email.timestamp.toISOString()).toBe('2023-01-01T12:00:00.000Z');
      expect(email.subject).toBe(props.subject);
      expect(email.from).toBe(props.from);
      expect(email.to).toEqual(props.to);
      expect(email.cc).toEqual([]);
      expect(email.recipient).toBe(props.recipient);
      expect(email.textBody).toBe('');
      expect(email.htmlBody).toBeNull();
      expect(email.attachments).toEqual([]);
    });

    it('すべてのプロパティを指定して初期化できる', () => {
      // 準備
      const timestamp = new Date('2023-01-01T12:00:00Z');
      const attachmentBuffer = Buffer.from('test attachment content');
      const attachment = new Attachment({
        filename: 'test.txt',
        contentType: 'text/plain',
        size: attachmentBuffer.length,
        content: attachmentBuffer,
      });

      const props = {
        id: 'email-123',
        timestamp,
        subject: 'テストメール',
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        cc: ['cc@example.com'],
        recipient: 'recipient@example.com',
        textBody: 'テストメール本文',
        htmlBody: '<p>テストメール本文</p>',
        attachments: [attachment],
        headers: { 'X-Custom-Header': 'custom-value' },
      };

      // 実行
      const email = new Email(props);

      // 検証
      expect(email.id).toBe(props.id);
      expect(email.timestamp).toBe(timestamp);
      expect(email.subject).toBe(props.subject);
      expect(email.from).toBe(props.from);
      expect(email.to).toEqual(props.to);
      expect(email.cc).toEqual(props.cc);
      expect(email.recipient).toBe(props.recipient);
      expect(email.textBody).toBe(props.textBody);
      expect(email.htmlBody).toBe(props.htmlBody);
      expect(email.attachments).toEqual([attachment]);
      expect(email.getHeader('X-Custom-Header')).toBe('custom-value');
    });

    it('文字列のタイムスタンプをDateオブジェクトに変換する', () => {
      // 準備
      const timestampStr = '2023-01-01T12:00:00Z';
      const props = {
        id: 'email-123',
        timestamp: timestampStr,
        subject: 'テストメール',
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        recipient: 'recipient@example.com',
      };

      // 実行
      const email = new Email(props);

      // 検証
      expect(email.timestamp).toBeInstanceOf(Date);
      // Date.toISOStringは常にミリ秒部分を含む
      expect(email.timestamp.toISOString()).toBe('2023-01-01T12:00:00.000Z');
    });
  });

  // ヘッダー関連メソッドのテスト
  describe('header methods', () => {
    it('getAllHeadersはすべてのヘッダーを返す', () => {
      // 準備
      const email = new Email({
        id: 'email-123',
        timestamp: '2023-01-01T12:00:00Z',
        subject: 'テストメール',
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        recipient: 'recipient@example.com',
        headers: {
          'X-Custom-Header-1': 'value1',
          'X-Custom-Header-2': 'value2',
        },
      });

      // 実行
      const headers = email.getAllHeaders();

      // 検証
      expect(headers.get('X-Custom-Header-1')).toBe('value1');
      expect(headers.get('X-Custom-Header-2')).toBe('value2');
    });
  });

  // JSONシリアライズのテスト
  describe('toJSON', () => {
    it('正しいJSON形式でオブジェクトを返す', () => {
      // 準備
      const timestampStr = '2023-01-01T12:00:00Z';
      const attachmentBuffer = Buffer.from('test attachment content');
      const attachment = new Attachment({
        filename: 'test.txt',
        contentType: 'text/plain',
        size: attachmentBuffer.length,
        content: attachmentBuffer,
      });

      const email = new Email({
        id: 'email-123',
        timestamp: timestampStr,
        subject: 'テストメール',
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        cc: ['cc@example.com'],
        recipient: 'recipient@example.com',
        textBody: 'テストメール本文',
        htmlBody: '<p>テストメール本文</p>',
        attachments: [attachment],
        headers: { 'X-Custom-Header': 'custom-value' },
      });

      // 実行
      const json = email.toJSON();

      // 検証
      // タイムスタンプとアタッチメントは別途検証
      expect(json).toMatchObject({
        id: 'email-123',
        subject: 'テストメール',
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        cc: ['cc@example.com'],
        recipient: 'recipient@example.com',
        body: {
          text: 'テストメール本文',
          html: '<p>テストメール本文</p>',
        },
        headers: { 'X-Custom-Header': 'custom-value' },
      });

      // タイムスタンプ部分を検証
      expect((json as any).timestamp).toBe('2023-01-01T12:00:00.000Z');

      // アタッチメント部分を検証
      expect((json as any).attachments).toHaveLength(1);
      expect((json as any).attachments[0]).toEqual(attachment.toJSON());
    });
  });
});
