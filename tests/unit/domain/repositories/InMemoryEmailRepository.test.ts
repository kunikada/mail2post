/**
 * InMemoryEmailRepositoryの単体テスト
 */

import { describe, expect, it } from 'vitest';
import { InMemoryEmailRepository } from '@domain/repositories/InMemoryEmailRepository';
import { Email } from '@domain/models/Email';

describe('InMemoryEmailRepository', () => {
  // テスト用のメールサンプルを作成
  const createSampleEmail = (id: string = 'email-123') => {
    return new Email({
      id,
      timestamp: new Date('2023-01-01T12:00:00Z'),
      subject: 'テストメール',
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      recipient: 'recipient@example.com',
      textBody: 'テストメール本文',
    });
  };

  // 基本的なCRUD操作のテスト
  describe('CRUD operations', () => {
    it('メールを保存して取得できる', async () => {
      // 準備
      const repository = new InMemoryEmailRepository();
      const email = createSampleEmail();

      // 実行
      await repository.save(email);
      const retrieved = await repository.findById(email.id);

      // 検証
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(email.id);
      expect(retrieved?.subject).toBe(email.subject);
    });

    it('存在しないメールはnullを返す', async () => {
      // 準備
      const repository = new InMemoryEmailRepository();

      // 実行
      const result = await repository.findById('nonexistent-id');

      // 検証
      expect(result).toBeNull();
    });

    it('すべてのメールを取得できる', async () => {
      // 準備
      const repository = new InMemoryEmailRepository();
      const emails = [
        createSampleEmail('email-1'),
        createSampleEmail('email-2'),
        createSampleEmail('email-3'),
      ];

      for (const email of emails) {
        await repository.save(email);
      }

      // 実行
      const allEmails = await repository.findAll();

      // 検証
      expect(allEmails.length).toBe(emails.length);
      expect(allEmails.map(e => e.id).sort()).toEqual(emails.map(e => e.id).sort());
    });

    it('メールを更新できる', async () => {
      // 準備
      const repository = new InMemoryEmailRepository();
      const email = createSampleEmail();
      await repository.save(email);

      // 更新されたメール（同じID）
      const updatedEmail = new Email({
        id: email.id,
        timestamp: email.timestamp,
        subject: '更新された件名',
        from: email.from,
        to: email.to as string[],
        recipient: email.recipient,
        textBody: '更新された本文',
      });

      // 実行
      await repository.save(updatedEmail);
      const retrieved = await repository.findById(email.id);

      // 検証
      expect(retrieved).not.toBeNull();
      expect(retrieved?.subject).toBe('更新された件名');
      expect(retrieved?.textBody).toBe('更新された本文');
    });

    it('メールを削除できる', async () => {
      // 準備
      const repository = new InMemoryEmailRepository();
      const email = createSampleEmail();
      await repository.save(email);

      // 実行 - 削除前の確認
      let retrieved = await repository.findById(email.id);
      expect(retrieved).not.toBeNull();

      // 削除を実行
      const result = await repository.delete(email.id);

      // 検証 - 削除結果
      expect(result).toBe(true);

      // 削除後の確認
      retrieved = await repository.findById(email.id);
      expect(retrieved).toBeNull();
    });

    it('存在しないメールの削除はfalseを返す', async () => {
      // 準備
      const repository = new InMemoryEmailRepository();

      // 実行
      const result = await repository.delete('nonexistent-id');

      // 検証
      expect(result).toBe(false);
    });
  });

  // 特殊検索機能のテスト
  describe('search queries', () => {
    it('受信者アドレスでメールを検索できる', async () => {
      // 準備
      const repository = new InMemoryEmailRepository();
      const email1 = createSampleEmail('email-1');

      const email2 = new Email({
        id: 'email-2',
        timestamp: new Date('2023-01-02T12:00:00Z'),
        subject: '別のメール',
        from: 'sender@example.com',
        to: ['other@example.com'],
        recipient: 'other@example.com',
        textBody: '別のメール本文',
      });

      await repository.save(email1);
      await repository.save(email2);

      // 実行
      const results = await repository.findByRecipient('recipient@example.com');

      // 検証
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('email-1');
    });

    it('送信者アドレスでメールを検索できる', async () => {
      // 準備
      const repository = new InMemoryEmailRepository();
      const email1 = createSampleEmail('email-1');

      const email2 = new Email({
        id: 'email-2',
        timestamp: new Date('2023-01-02T12:00:00Z'),
        subject: '別のメール',
        from: 'other@example.com',
        to: ['recipient@example.com'],
        recipient: 'recipient@example.com',
        textBody: '別のメール本文',
      });

      await repository.save(email1);
      await repository.save(email2);

      // 実行
      const results = await repository.findBySender('sender@example.com');

      // 検証
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('email-1');
    });

    it('件名でメールを検索できる', async () => {
      // 準備
      const repository = new InMemoryEmailRepository();
      const email1 = createSampleEmail('email-1');

      const email2 = new Email({
        id: 'email-2',
        timestamp: new Date('2023-01-02T12:00:00Z'),
        subject: '重要なお知らせ',
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        recipient: 'recipient@example.com',
        textBody: 'お知らせ本文',
      });

      await repository.save(email1);
      await repository.save(email2);

      // 実行
      const results = await repository.findBySubject('重要');

      // 検証
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('email-2');
    });

    it('日付範囲でメールを検索できる', async () => {
      // 準備
      const repository = new InMemoryEmailRepository();

      const email1 = new Email({
        id: 'email-1',
        timestamp: new Date('2023-01-01T12:00:00Z'),
        subject: 'メール1',
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        recipient: 'recipient@example.com',
      });

      const email2 = new Email({
        id: 'email-2',
        timestamp: new Date('2023-02-01T12:00:00Z'),
        subject: 'メール2',
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        recipient: 'recipient@example.com',
      });

      const email3 = new Email({
        id: 'email-3',
        timestamp: new Date('2023-03-01T12:00:00Z'),
        subject: 'メール3',
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        recipient: 'recipient@example.com',
      });

      await repository.save(email1);
      await repository.save(email2);
      await repository.save(email3);

      // 実行
      const results = await repository.findByDateRange(
        new Date('2023-01-15T00:00:00Z'),
        new Date('2023-02-15T23:59:59Z')
      );

      // 検証
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('email-2');
    });
  });
});
