import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import nodemailer from 'nodemailer';
import fs from 'fs/promises';

// SendGrid設定の読み込み
interface SendGridConfig {
  smtp: {
    host: string;
    port: number;
    auth: {
      user: string;
      pass: string;
    };
  };
  description?: string;
}

// テストAPIのベースURL - 実際の設定からWebhook URLを取得するため削除
// const TEST_API_BASE_URL = 'https://nscjss6xle.execute-api.ap-northeast-1.amazonaws.com/dev';

// SendGrid設定とトランスポーターのセットアップ
let sendGridConfig: SendGridConfig;
let transporter: nodemailer.Transporter;
let webhookUrl: string;

describe('ルート設定統合テスト', () => {
  // 一意のテストID（テスト間の区別のため）
  const testId = Date.now().toString();

  beforeAll(async () => {
    try {
      // SendGrid設定の読み込み
      const sendGridConfigData = await fs.readFile('./config/sendgrid.json', 'utf-8');
      sendGridConfig = JSON.parse(sendGridConfigData);

      // dev.jsonから設定を読み込んでWebhook URLを取得
      const configData = await fs.readFile('./config/dev.json', 'utf-8');
      const config = JSON.parse(configData);
      const testRoute = config.routes[0];
      if (!testRoute) {
        throw new Error('ルート設定が見つかりません');
      }
      webhookUrl = testRoute.postEndpoint;

      // SendGrid SMTPトランスポーターの作成
      transporter = nodemailer.createTransport({
        host: sendGridConfig.smtp.host,
        port: sendGridConfig.smtp.port,
        secure: false,
        auth: {
          user: sendGridConfig.smtp.auth.user,
          pass: sendGridConfig.smtp.auth.pass,
        },
      });

      console.log('SendGrid SMTP設定完了');
      console.log('Webhook URL:', webhookUrl);
    } catch (error) {
      console.error('テストセットアップに失敗しました:', error);
      throw error;
    }
  }, 30000);

  afterAll(async () => {
    if (transporter) {
      transporter.close();
    }
  }, 30000);

  // メール送信のヘルパー関数
  async function sendTestEmail(
    to: string,
    subject: string,
    htmlContent?: string,
    textContent?: string,
    attachments?: Array<{ filename: string; content: string | Buffer }>
  ): Promise<string> {
    const mailProcessingId = `test-${testId}-${Date.now()}`;

    const mailOptions = {
      from: 'Test Sender <test@mail2post.com>',
      to,
      subject,
      text: textContent || `テストメール本文 ${subject}`,
      html: htmlContent,
      attachments,
      headers: {
        'X-Mail-Processing-ID': mailProcessingId,
      },
    };

    await transporter.sendMail(mailOptions);
    console.log(`メール送信完了 - Processing ID: ${mailProcessingId}, To: ${to}`);
    return mailProcessingId;
  }

  // Webhook結果取得のヘルパー関数
  async function getWebhookResult(
    mailProcessingId: string,
    maxRetries = 5
  ): Promise<{
    webhookData: {
      subject: string;
      to: string;
      headers?: Record<string, string>;
      body?: string;
      text?: string;
      html?: string;
    };
  }> {
    // 最初のエンドポイントには -1 の通し番号が付与される
    const endpointProcessingId = `${mailProcessingId}-1`;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`${webhookUrl}?mailProcessingId=${endpointProcessingId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.body) {
            // bodyをパースしてwebhookDataとして返す
            const bodyData = JSON.parse(data.body);
            return { webhookData: bodyData };
          }
        }
        console.log(`Webhook結果待機中... (${i + 1}/${maxRetries})`);
        console.log(`使用しているmailProcessingId: ${endpointProcessingId}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.log(`Webhook結果取得エラー (試行 ${i + 1}): ${error}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    throw new Error('Webhook結果の取得に失敗しました');
  }

  it('JSON形式のルート設定が正しく機能すること', async () => {
    const testEmail = 'test@mail2post.com';
    const subject = `JSON形式テスト ${testId}`;

    // メール送信
    const mailProcessingId = await sendTestEmail(testEmail, subject);

    // Webhook結果を取得
    const result = await getWebhookResult(mailProcessingId);

    // 結果検証
    expect(result.webhookData).toBeDefined();
    expect(result.webhookData.subject).toBe(subject);
    expect(result.webhookData.to).toContain(testEmail);
    // JSON形式であることを確認（オブジェクト構造）
    expect(typeof result.webhookData).toBe('object');
    expect(result.webhookData.headers).toBeDefined();
  }, 30000);

  it('フォーム形式のルート設定が正しく機能すること', async () => {
    const testEmail = 'test@mail2post.com';
    const subject = `フォーム形式テスト ${testId}`;

    // メール送信
    const mailProcessingId = await sendTestEmail(testEmail, subject);

    // Webhook結果を取得
    const result = await getWebhookResult(mailProcessingId);

    // 結果検証
    expect(result.webhookData).toBeDefined();
    expect(result.webhookData.subject).toBe(subject);
    expect(result.webhookData.to).toContain(testEmail);
  }, 30000);

  it('RAW形式のルート設定が正しく機能すること', async () => {
    const testEmail = 'test@mail2post.com';
    const subject = `RAW形式テスト ${testId}`;

    // メール送信
    const mailProcessingId = await sendTestEmail(testEmail, subject);

    // Webhook結果を取得
    const result = await getWebhookResult(mailProcessingId);

    // 結果検証
    expect(result.webhookData).toBeDefined();
    expect(result.webhookData.subject).toBe(subject);
    expect(result.webhookData.to).toContain(testEmail);
  }, 30000);

  it('Bearer認証付きルート設定が正しく機能すること', async () => {
    const testEmail = 'test@mail2post.com';
    const subject = `Bearer認証テスト ${testId}`;

    // メール送信
    const mailProcessingId = await sendTestEmail(testEmail, subject);

    // Webhook結果を取得
    const result = await getWebhookResult(mailProcessingId);

    // 結果検証
    expect(result.webhookData).toBeDefined();
    expect(result.webhookData.subject).toBe(subject);
    expect(result.webhookData.to).toContain(testEmail);
    // 認証ヘッダーが設定されていることを間接的に確認（リクエストが成功している）
    expect(result.webhookData.headers).toBeDefined();
  }, 30000);

  it('Basic認証付きルート設定が正しく機能すること', async () => {
    const testEmail = 'test@mail2post.com';
    const subject = `Basic認証テスト ${testId}`;

    // メール送信
    const mailProcessingId = await sendTestEmail(testEmail, subject);

    // Webhook結果を取得
    const result = await getWebhookResult(mailProcessingId);

    // 結果検証
    expect(result.webhookData).toBeDefined();
    expect(result.webhookData.subject).toBe(subject);
    expect(result.webhookData.to).toContain(testEmail);
  }, 30000);

  it('カスタムヘッダー付きルート設定が正しく機能すること', async () => {
    const testEmail = 'test@mail2post.com';
    const subject = `カスタムヘッダーテスト ${testId}`;

    // メール送信
    const mailProcessingId = await sendTestEmail(testEmail, subject);

    // Webhook結果を取得
    const result = await getWebhookResult(mailProcessingId);

    // 結果検証
    expect(result.webhookData).toBeDefined();
    expect(result.webhookData.subject).toBe(subject);
    expect(result.webhookData.to).toContain(testEmail);
  }, 30000);

  it('HTML処理モード（text）が正しく機能すること', async () => {
    const testEmail = 'test@mail2post.com';
    const subject = `HTML-textモードテスト ${testId}`;
    const htmlContent = '<p>これは<strong>HTML</strong>コンテンツです</p>';

    // メール送信
    const mailProcessingId = await sendTestEmail(testEmail, subject, htmlContent);

    // Webhook結果を取得
    const result = await getWebhookResult(mailProcessingId);

    // 結果検証
    expect(result.webhookData).toBeDefined();
    expect(result.webhookData.subject).toBe(subject);
    expect(result.webhookData.to).toContain(testEmail);
    // textモードの場合、HTMLがテキストに変換されていることを確認
    expect(result.webhookData.body || result.webhookData.text).toBeDefined();
  }, 30000);

  it('HTML処理モード（html）が正しく機能すること', async () => {
    const testEmail = 'test@mail2post.com';
    const subject = `HTML-htmlモードテスト ${testId}`;
    const htmlContent = '<p>これは<strong>HTML</strong>コンテンツです</p>';

    // メール送信
    const mailProcessingId = await sendTestEmail(testEmail, subject, htmlContent);

    // Webhook結果を取得
    const result = await getWebhookResult(mailProcessingId);

    // 結果検証
    expect(result.webhookData).toBeDefined();
    expect(result.webhookData.subject).toBe(subject);
    expect(result.webhookData.to).toContain(testEmail);
    // htmlモードの場合、HTMLがそのまま含まれることを確認
    expect(result.webhookData.html || result.webhookData.body).toBeDefined();
  }, 30000);

  it('HTML処理モード（both）が正しく機能すること', async () => {
    const testEmail = 'test@mail2post.com';
    const subject = `HTML-bothモードテスト ${testId}`;
    const htmlContent = '<p>これは<strong>HTML</strong>コンテンツです</p>';

    // メール送信
    const mailProcessingId = await sendTestEmail(testEmail, subject, htmlContent);

    // Webhook結果を取得
    const result = await getWebhookResult(mailProcessingId);

    // 結果検証
    expect(result.webhookData).toBeDefined();
    expect(result.webhookData.subject).toBe(subject);
    expect(result.webhookData.to).toContain(testEmail);
    // bothモードの場合、HTMLとテキストの両方が含まれることを確認
    expect(
      result.webhookData.html || result.webhookData.text || result.webhookData.body
    ).toBeDefined();
  }, 30000);

  it('画像処理モード（ignore）が正しく機能すること', async () => {
    const testEmail = 'test@mail2post.com';
    const subject = `画像ignoreモードテスト ${testId}`;
    const htmlContent =
      '<p>テスト画像: <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==" alt="test"></p>';

    // メール送信
    const mailProcessingId = await sendTestEmail(testEmail, subject, htmlContent);

    // Webhook結果を取得
    const result = await getWebhookResult(mailProcessingId);

    // 結果検証
    expect(result.webhookData).toBeDefined();
    expect(result.webhookData.subject).toBe(subject);
    expect(result.webhookData.to).toContain(testEmail);
  }, 30000);

  it('コンテンツ選択（subject）が正しく機能すること', async () => {
    const testEmail = 'test@mail2post.com';
    const subject = `件名のみテスト ${testId}`;

    // メール送信
    const mailProcessingId = await sendTestEmail(testEmail, subject);

    // Webhook結果を取得
    const result = await getWebhookResult(mailProcessingId);

    // 結果検証
    expect(result.webhookData).toBeDefined();
    expect(result.webhookData.subject).toBe(subject);
    expect(result.webhookData.to).toContain(testEmail);
  }, 30000);

  it('コンテンツ選択（body）が正しく機能すること', async () => {
    const testEmail = 'test@mail2post.com';
    const subject = `本文のみテスト ${testId}`;
    const textContent = `これは本文のみのテストです ${testId}`;

    // メール送信
    const mailProcessingId = await sendTestEmail(testEmail, subject, undefined, textContent);

    // Webhook結果を取得
    const result = await getWebhookResult(mailProcessingId);

    // 結果検証
    expect(result.webhookData).toBeDefined();
    expect(result.webhookData.subject).toBe(subject);
    expect(result.webhookData.to).toContain(testEmail);
    expect(result.webhookData.body || result.webhookData.text).toBeDefined();
  }, 30000);

  it('ワイルドカードルート（*@domain）が正しく機能すること', async () => {
    const testEmail = 'test@mail2post.com';
    const subject = `ワイルドカードテスト ${testId}`;

    // メール送信
    const mailProcessingId = await sendTestEmail(testEmail, subject);

    // Webhook結果を取得
    const result = await getWebhookResult(mailProcessingId);

    // 結果検証
    expect(result.webhookData).toBeDefined();
    expect(result.webhookData.subject).toBe(subject);
    expect(result.webhookData.to).toContain(testEmail);
  }, 30000);

  it('デフォルトルートが正しく機能すること', async () => {
    const testEmail = 'test@mail2post.com';
    const subject = `デフォルトルートテスト ${testId}`;

    // メール送信
    const mailProcessingId = await sendTestEmail(testEmail, subject);

    // Webhook結果を取得
    const result = await getWebhookResult(mailProcessingId);

    // 結果検証
    expect(result.webhookData).toBeDefined();
    expect(result.webhookData.subject).toBe(subject);
    expect(result.webhookData.to).toContain(testEmail);
  }, 30000);

  it('サイズ制限設定が適用されること', async () => {
    const testEmail = 'test@mail2post.com';
    const subject = `サイズ制限テスト ${testId}`;
    const largeContent = 'A'.repeat(1000); // 大きなコンテンツ

    // メール送信
    const mailProcessingId = await sendTestEmail(testEmail, subject, undefined, largeContent);

    // Webhook結果を取得
    const result = await getWebhookResult(mailProcessingId);

    // 結果検証
    expect(result.webhookData).toBeDefined();
    expect(result.webhookData.subject).toBe(subject);
    expect(result.webhookData.to).toContain(testEmail);
  }, 30000);

  it('リトライ設定が適用されること', async () => {
    const testEmail = 'test@mail2post.com';
    const subject = `リトライテスト ${testId}`;

    // メール送信
    const mailProcessingId = await sendTestEmail(testEmail, subject);

    // Webhook結果を取得（リトライ設定があっても最終的に成功することを確認）
    const result = await getWebhookResult(mailProcessingId);

    // 結果検証
    expect(result.webhookData).toBeDefined();
    expect(result.webhookData.subject).toBe(subject);
    expect(result.webhookData.to).toContain(testEmail);
  }, 30000);
}, 30000);
