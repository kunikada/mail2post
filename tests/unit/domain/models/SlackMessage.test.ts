/**
 * SlackMessageモデルの単体テスト
 */

import { describe, expect, it } from 'vitest';
import { SlackMessage } from '@domain/models/SlackMessage';

describe('SlackMessage', () => {
  // toPayloadメソッドのテスト
  describe('toPayload', () => {
    it('必須フィールドのみを持つペイロードを生成する', () => {
      // 準備
      const slackMessage = new SlackMessage({
        webhookUrl: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
        text: 'テストメッセージ',
      });

      // 実行
      const payload = slackMessage.toPayload();

      // 検証
      expect(payload).toEqual({
        text: 'テストメッセージ',
      });
    });

    it('すべてのフィールドを持つペイロードを生成する', () => {
      // 準備
      const slackMessage = new SlackMessage({
        webhookUrl: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
        text: 'テストメッセージ',
        channel: '#test-channel',
        username: 'TestBot',
        iconEmoji: ':robot:',
        iconUrl: 'https://example.com/icon.png',
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'テスト' } }],
        attachments: [{ color: '#ff0000', text: '添付' }],
      });

      // 実行
      const payload = slackMessage.toPayload();

      // 検証
      expect(payload).toEqual({
        text: 'テストメッセージ',
        channel: '#test-channel',
        username: 'TestBot',
        icon_emoji: ':robot:',
        icon_url: 'https://example.com/icon.png',
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'テスト' } }],
        attachments: [{ color: '#ff0000', text: '添付' }],
      });
    });
  });

  // fromEmailSimpleメソッドのテスト
  describe('fromEmailSimple', () => {
    it('メールからSlackメッセージを生成する - オプションなし', () => {
      // 準備
      const email = {
        subject: 'テスト件名',
        from: 'test@example.com',
        textBody: 'これはテストメールです。',
        recipient: 'recipient@example.com',
      };
      const webhookUrl = 'https://hooks.slack.com/services/XXX/YYY/ZZZ';

      // 実行
      const slackMessage = SlackMessage.fromEmailSimple(email, webhookUrl);

      // 検証
      expect(slackMessage.webhookUrl).toBe(webhookUrl);
      expect(slackMessage.text).toContain('*件名:* テスト件名');
      expect(slackMessage.text).toContain('*送信者:* test@example.com');
      expect(slackMessage.text).toContain('*宛先:* recipient@example.com');
      expect(slackMessage.text).toContain('これはテストメールです。');
      expect(slackMessage.username).toBe('📧 Mail2Post');
      expect(slackMessage.iconEmoji).toBe(':email:');
      expect(slackMessage.channel).toBeUndefined();
    });

    it('メールからSlackメッセージを生成する - カスタムオプション', () => {
      // 準備
      const email = {
        subject: 'テスト件名',
        from: 'test@example.com',
        textBody: 'これはテストメールです。',
        recipient: 'recipient@example.com',
      };
      const webhookUrl = 'https://hooks.slack.com/services/XXX/YYY/ZZZ';
      const options = {
        channel: '#custom-channel',
        username: 'CustomBot',
        iconEmoji: ':custom:',
      };

      // 実行
      const slackMessage = SlackMessage.fromEmailSimple(email, webhookUrl, options);

      // 検証
      expect(slackMessage.webhookUrl).toBe(webhookUrl);
      expect(slackMessage.text).toContain('*件名:* テスト件名');
      expect(slackMessage.channel).toBe('#custom-channel');
      expect(slackMessage.username).toBe('CustomBot');
      expect(slackMessage.iconEmoji).toBe(':custom:');
    });

    it('長いテキスト本文を1000文字に切り詰める', () => {
      // 準備
      const longText = 'a'.repeat(2000);
      const email = {
        subject: 'テスト件名',
        from: 'test@example.com',
        textBody: longText,
        recipient: 'recipient@example.com',
      };
      const webhookUrl = 'https://hooks.slack.com/services/XXX/YYY/ZZZ';

      // 実行
      const slackMessage = SlackMessage.fromEmailSimple(email, webhookUrl);

      // 検証
      // テキストに「...」が含まれていることを確認
      expect(slackMessage.text).toContain('...');

      // 実際のテキスト部分（コードブロック内）が1000文字+「...」であることを確認
      const lines = slackMessage.text.split('\n');
      const codeBlockIndex = lines.findIndex(line => line === '```');
      const textContent = lines[codeBlockIndex + 1];
      expect(textContent).toHaveLength(1003); // 1000文字 + '...'
      expect(textContent).toBe('a'.repeat(1000) + '...');
    });
  });
});
