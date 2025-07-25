/**
 * SimpleEmailParser のテスト
 */
import { describe, expect, it } from 'vitest';
import { SimpleEmailParser } from '@services/email/SimpleEmailParser';

describe('SimpleEmailParser', () => {
  describe('parse', () => {
    it('should parse simple text email', async () => {
      const emailContent = [
        'From: sender@example.com',
        'To: recipient@example.com',
        'Subject: Test Subject',
        'Date: Mon, 1 Jan 2025 10:00:00 +0000',
        'Message-ID: <test@example.com>',
        'Content-Type: text/plain',
        '',
        'This is a test email body.',
      ].join('\r\n');

      const buffer = Buffer.from(emailContent, 'utf8');
      const result = await SimpleEmailParser.parse(buffer);

      expect(result.from).toBe('sender@example.com');
      expect(result.to).toEqual(['recipient@example.com']);
      expect(result.subject).toBe('Test Subject');
      expect(result.messageId).toBe('<test@example.com>');
      expect(result.text).toBe('This is a test email body.');
      expect(result.html).toBeUndefined();
      expect(result.attachments).toEqual([]);
    });

    it('should parse HTML email', async () => {
      const emailContent = [
        'From: sender@example.com',
        'To: recipient@example.com',
        'Subject: HTML Test',
        'Content-Type: text/html; charset=utf-8',
        '',
        '<html><body><h1>Hello World</h1></body></html>',
      ].join('\r\n');

      const buffer = Buffer.from(emailContent, 'utf8');
      const result = await SimpleEmailParser.parse(buffer);

      expect(result.from).toBe('sender@example.com');
      expect(result.subject).toBe('HTML Test');
      expect(result.html).toBe('<html><body><h1>Hello World</h1></body></html>');
      expect(result.text).toBeUndefined();
    });

    it('should parse quoted-printable encoded email', async () => {
      const emailContent = [
        'From: sender@example.com',
        'To: recipient@example.com',
        'Subject: Encoded Test',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        'This is a test with Japanese =E6=97=A5=E6=9C=AC=E8=AA=9E text.',
      ].join('\r\n');

      const buffer = Buffer.from(emailContent, 'utf8');
      const result = await SimpleEmailParser.parse(buffer);

      expect(result.from).toBe('sender@example.com');
      expect(result.subject).toBe('Encoded Test');
      expect(result.text).toBe('This is a test with Japanese 日本語 text.');
    });

    it('should parse base64 encoded email', async () => {
      const emailContent = [
        'From: sender@example.com',
        'To: recipient@example.com',
        'Subject: Base64 Test',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: base64',
        '',
        'VGhpcyBpcyBhIHRlc3QgbWVzc2FnZSE=', // "This is a test message!"
      ].join('\r\n');

      const buffer = Buffer.from(emailContent, 'utf8');
      const result = await SimpleEmailParser.parse(buffer);

      expect(result.from).toBe('sender@example.com');
      expect(result.subject).toBe('Base64 Test');
      expect(result.text).toBe('This is a test message!');
    });

    it('should parse multipart email', async () => {
      const boundary = '----=_Part_12345';
      const emailContent = [
        'From: sender@example.com',
        'To: recipient@example.com',
        'Subject: Multipart Test',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `------=_Part_12345`,
        'Content-Type: text/plain',
        '',
        'Plain text content',
        `------=_Part_12345`,
        'Content-Type: text/html',
        '',
        '<p>HTML content</p>',
        `------=_Part_12345--`,
      ].join('\r\n');

      const buffer = Buffer.from(emailContent, 'utf8');
      const result = await SimpleEmailParser.parse(buffer);

      expect(result.from).toBe('sender@example.com');
      expect(result.subject).toBe('Multipart Test');
      expect(result.text).toBe('Plain text content');
      expect(result.html).toBe('<p>HTML content</p>');
    });

    it('should parse multiple recipients', async () => {
      const emailContent = [
        'From: sender@example.com',
        'To: recipient1@example.com, recipient2@example.com',
        'Cc: cc1@example.com, cc2@example.com',
        'Subject: Multiple Recipients',
        '',
        'Test body',
      ].join('\r\n');

      const buffer = Buffer.from(emailContent, 'utf8');
      const result = await SimpleEmailParser.parse(buffer);

      expect(result.to).toEqual(['recipient1@example.com', 'recipient2@example.com']);
      expect(result.cc).toEqual(['cc1@example.com', 'cc2@example.com']);
    });

    it('should decode RFC2047 encoded headers', async () => {
      const emailContent = [
        'From: sender@example.com',
        'To: recipient@example.com',
        'Subject: =?UTF-8?B?44OG44K544OI5Lu25ZCN?=', // "テスト件名" in Base64
        '',
        'Test body',
      ].join('\r\n');

      const buffer = Buffer.from(emailContent, 'utf8');
      const result = await SimpleEmailParser.parse(buffer);

      expect(result.subject).toBe('テスト件名');
    });

    it('should handle folded headers', async () => {
      const emailContent = [
        'From: sender@example.com',
        'To: recipient1@example.com,',
        ' recipient2@example.com,',
        '\trecipient3@example.com',
        'Subject: Folded Header Test',
        '',
        'Test body',
      ].join('\r\n');

      const buffer = Buffer.from(emailContent, 'utf8');
      const result = await SimpleEmailParser.parse(buffer);

      expect(result.to).toEqual([
        'recipient1@example.com',
        'recipient2@example.com',
        'recipient3@example.com',
      ]);
    });

    it('should throw error for invalid email format', async () => {
      const emailContent = 'Invalid email without header separator';
      const buffer = Buffer.from(emailContent, 'utf8');

      await expect(SimpleEmailParser.parse(buffer)).rejects.toThrow(
        'Invalid email format: no header/body separator found'
      );
    });

    it('should parse date header', async () => {
      const emailContent = [
        'From: sender@example.com',
        'To: recipient@example.com',
        'Subject: Date Test',
        'Date: Mon, 01 Jan 2025 10:30:45 +0000',
        '',
        'Test body',
      ].join('\r\n');

      const buffer = Buffer.from(emailContent, 'utf8');
      const result = await SimpleEmailParser.parse(buffer);

      expect(result.date).toBeInstanceOf(Date);
      expect(result.date?.getFullYear()).toBe(2025);
      expect(result.date?.getMonth()).toBe(0); // January is 0
      expect(result.date?.getDate()).toBe(1);
    });

    it('should handle email with attachment in multipart', async () => {
      const boundary = '----=_Part_attachment';
      const emailContent = [
        'From: sender@example.com',
        'To: recipient@example.com',
        'Subject: Attachment Test',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `------=_Part_attachment`,
        'Content-Type: text/plain',
        '',
        'Email with attachment',
        `------=_Part_attachment`,
        'Content-Type: application/pdf',
        'Content-Disposition: attachment; filename="test.pdf"',
        'Content-Transfer-Encoding: base64',
        '',
        'JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovTGVuZ3RoIDYgMCBSCi9GaWx0ZXIgL0ZsYXRlRGVjb2RlCj4+CnN0cmVhbQ==',
        `------=_Part_attachment--`,
      ].join('\r\n');

      const buffer = Buffer.from(emailContent, 'utf8');
      const result = await SimpleEmailParser.parse(buffer);

      expect(result.text).toBe('Email with attachment');
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0].filename).toBe('test.pdf');
      expect(result.attachments[0].contentType).toBe('application/pdf');
      expect(result.attachments[0].size).toBeGreaterThan(0);
    });
  });
});
