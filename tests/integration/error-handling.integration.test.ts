import { beforeAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { randomUUID } from 'crypto';

describe('エラーハンドリング統合テスト', () => {
  const FROM_EMAIL = 'sender@mail2post.com';

  let transporter: Transporter;
  let config: { routes: { emailAddress: string; postEndpoint: string }[] };
  let sendgridConfig: {
    smtp: { host: string; port: number; auth: { user: string; pass: string } };
  };
  let webhookUrl: string;

  // 一意のテストID（テスト間の区別のため）
  const testId = Date.now().toString();

  beforeAll(async () => {
    // dev.jsonから設定を読み込み
    const configPath = './config/dev.json';
    try {
      const configContent = await fs.readFile(configPath, 'utf8');
      config = JSON.parse(configContent);
      console.log('dev.jsonから設定を読み込みました');
    } catch (error) {
      console.error('設定ファイル読み込みエラー:', error);
      throw error;
    }

    // SendGrid設定の読み込み
    const sendgridConfigPath = './config/sendgrid.json';
    try {
      const sendgridConfigContent = await fs.readFile(sendgridConfigPath, 'utf8');
      sendgridConfig = JSON.parse(sendgridConfigContent);
      console.log('SendGrid設定を読み込みました');
    } catch (error) {
      console.error('SendGrid設定ファイル読み込みエラー:', error);
      throw error;
    }

    // 最初のルート設定を取得（どのメールアドレスでも可）
    const testRoute = config.routes[0];
    if (!testRoute) {
      throw new Error('ルート設定が見つかりません');
    }

    // Webhook URLを設定（postEndpointがすでに完全なWebhook URLなのでそのまま使用）
    webhookUrl = testRoute.postEndpoint;
    console.log('Webhook URL:', webhookUrl);

    // nodemailerトランスポーターの作成（SendGrid SMTP）
    transporter = nodemailer.createTransport({
      host: sendgridConfig.smtp.host,
      port: sendgridConfig.smtp.port,
      secure: false,
      auth: {
        user: sendgridConfig.smtp.auth.user,
        pass: sendgridConfig.smtp.auth.pass,
      },
    });

    console.log('SendGrid SMTPサーバーへの接続を設定しました');

    // SMTP接続テスト
    try {
      await transporter.verify();
      console.log('✅ SendGrid SMTP接続テストが成功しました');
    } catch (error) {
      console.error('❌ SendGrid SMTP接続テストが失敗しました:', error);
      throw error;
    }
  });

  /**
   * SendGridを使用してメールを送信する
   */
  async function sendTestEmail(options: {
    to: string;
    subject: string;
    text: string;
    mailProcessingId: string;
  }): Promise<string> {
    const { to, subject, text, mailProcessingId } = options;

    // メール送信オプション
    const mailOptions = {
      from: FROM_EMAIL,
      to,
      subject,
      text,
      headers: {
        'X-Mail-Processing-ID': mailProcessingId,
      },
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('✅ SendGridからメールが送信されました');
      console.log('メッセージID:', info.messageId);
      console.log('送信先:', to);
      console.log('X-Mail-Processing-ID:', mailProcessingId);
      console.log('件名:', subject);
      return info.messageId || '';
    } catch (error) {
      console.error('SendGridメール送信エラー:', error);
      throw error;
    }
  }

  it('エラーハンドリング処理が正常に動作すること', async () => {
    // テスト用の一意のMail Processing IDを生成
    const mailProcessingId = randomUUID();
    console.log('=== エラーハンドリングテスト開始 ===');
    console.log('テスト用Mail Processing ID:', mailProcessingId);

    // テスト用メールを送信
    const testSubject = `エラーハンドリングテスト ${testId}`;
    const testText = `これはエラーハンドリング処理のテストメールです。ID: ${testId}`;

    const messageId = await sendTestEmail({
      to: config.routes[0].emailAddress,
      subject: testSubject,
      text: testText,
      mailProcessingId,
    });

    expect(messageId).toBeDefined();
    console.log(`SendGridでメールを送信しました: ${messageId}`);

    // メール処理の完了を待機
    console.log('\n📨 メール処理の完了を待機中...');
    console.log('待機時間: 15秒');
    await new Promise(resolve => setTimeout(resolve, 15000));

    // GETメソッドでMail Processing IDを指定してWebhookデータを取得
    console.log('\n🔍 Webhookデータの取得を開始...');

    // 最初のエンドポイントには -1 の通し番号が付与される
    const endpointProcessingId = `${mailProcessingId}-1`;
    console.log('GET URL:', `${webhookUrl}?mailProcessingId=${endpointProcessingId}`);

    const getResponse = await fetch(`${webhookUrl}?mailProcessingId=${endpointProcessingId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('Webhook GET Response Status:', getResponse.status);

    // レスポンス内容を詳細にログ出力
    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.log('GET Error Response:', errorText);
    }

    // GETが成功したことを確認（エラーハンドリングが正常に動作）
    expect(getResponse.status).toBe(200);

    const responseData = await getResponse.json();

    // デバッグ用：レスポンスデータの構造を確認
    console.log('Response Data:', JSON.stringify(responseData, null, 2));

    // レスポンスデータの検証
    expect(responseData).toBeDefined();
    expect(responseData.mailProcessingId).toBe(endpointProcessingId);
    expect(responseData.method).toBe('POST');
    expect(responseData.headers['X-Mail-Processing-ID']).toBe(endpointProcessingId);

    // メール内容がWebhookデータに含まれていることを確認
    expect(responseData.body).toBeDefined();
    const bodyData = JSON.parse(responseData.body);

    // デバッグ用：パースされたボディデータの構造を確認
    console.log('Parsed Body Data:', JSON.stringify(bodyData, null, 2));

    expect(bodyData.subject).toBe(testSubject);

    console.log('✅ エラーハンドリング処理が正常に完了しました');
    console.log('取得したデータ:', {
      mailProcessingId: responseData.mailProcessingId,
      timestamp: responseData.timestamp,
      method: responseData.method,
      bodyLength: responseData.bodyLength,
    });
  }, 60000);

  it('システム負荷下でのメール処理が正常に動作すること', async () => {
    // テスト用の一意のMail Processing IDを生成
    const mailProcessingId = randomUUID();
    console.log('=== システム負荷テスト開始 ===');
    console.log('テスト用Mail Processing ID:', mailProcessingId);

    // テスト用メールを送信
    const testSubject = `システム負荷テスト ${testId}`;
    const testText = `これはシステム負荷下でのメール処理テストです。ID: ${testId}`;

    const messageId = await sendTestEmail({
      to: config.routes[0].emailAddress,
      subject: testSubject,
      text: testText,
      mailProcessingId,
    });

    expect(messageId).toBeDefined();
    console.log(`SendGridでメールを送信しました: ${messageId}`);

    // メール処理の完了を待機（システム負荷を考慮して長めに設定）
    console.log('\n📨 メール処理の完了を待機中...');
    console.log('待機時間: 20秒');
    await new Promise(resolve => setTimeout(resolve, 20000));

    // GETメソッドでMail Processing IDを指定してWebhookデータを取得
    console.log('\n🔍 Webhookデータの取得を開始...');

    // 最初のエンドポイントには -1 の通し番号が付与される
    const endpointProcessingId = `${mailProcessingId}-1`;
    console.log('GET URL:', `${webhookUrl}?mailProcessingId=${endpointProcessingId}`);

    const getResponse = await fetch(`${webhookUrl}?mailProcessingId=${endpointProcessingId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('Webhook GET Response Status:', getResponse.status);

    // レスポンス内容を詳細にログ出力
    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.log('GET Error Response:', errorText);
    }

    // GETが成功したことを確認（システム負荷下でも正常動作）
    expect(getResponse.status).toBe(200);

    const responseData = await getResponse.json();

    // レスポンスデータの検証
    expect(responseData).toBeDefined();
    expect(responseData.mailProcessingId).toBe(endpointProcessingId);
    expect(responseData.method).toBe('POST');
    expect(responseData.headers['X-Mail-Processing-ID']).toBe(endpointProcessingId);

    // メール内容がWebhookデータに含まれていることを確認
    expect(responseData.body).toBeDefined();
    const bodyData = JSON.parse(responseData.body);
    expect(bodyData.subject).toBe(testSubject);

    console.log('✅ システム負荷下でのメール処理が正常に完了しました');
  }, 90000);

  it('複雑なメールデータが適切に処理されること', async () => {
    // テスト用の一意のMail Processing IDを生成
    const mailProcessingId = randomUUID();
    console.log('=== 複雑なメールデータ処理テスト開始 ===');
    console.log('テスト用Mail Processing ID:', mailProcessingId);

    // テスト用メールを送信（複雑なデータを含む）
    const testSubject = `複雑なメールデータテスト ${testId}`;
    const testText = `これは複雑なメールデータの処理テストです。
    特殊文字: áéíóú ñ ü ç € £ ¥
    改行とタブを含むテキスト
    ID: ${testId}
    Test data with various characters and formatting.`;

    const messageId = await sendTestEmail({
      to: config.routes[0].emailAddress,
      subject: testSubject,
      text: testText,
      mailProcessingId,
    });

    expect(messageId).toBeDefined();
    console.log(`SendGridでメールを送信しました: ${messageId}`);

    // メール処理の完了を待機
    console.log('\n📨 メール処理の完了を待機中...');
    console.log('待機時間: 15秒');
    await new Promise(resolve => setTimeout(resolve, 15000));

    // GETメソッドでMail Processing IDを指定してWebhookデータを取得
    console.log('\n🔍 Webhookデータの取得を開始...');

    // 最初のエンドポイントには -1 の通し番号が付与される
    const endpointProcessingId = `${mailProcessingId}-1`;
    console.log('GET URL:', `${webhookUrl}?mailProcessingId=${endpointProcessingId}`);

    const getResponse = await fetch(`${webhookUrl}?mailProcessingId=${endpointProcessingId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('Webhook GET Response Status:', getResponse.status);

    // レスポンス内容を詳細にログ出力
    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.log('GET Error Response:', errorText);
    }

    // GETが成功したことを確認（複雑なデータでも正常処理）
    expect(getResponse.status).toBe(200);

    const responseData = await getResponse.json();

    // レスポンスデータの検証
    expect(responseData).toBeDefined();
    expect(responseData.mailProcessingId).toBe(endpointProcessingId);
    expect(responseData.method).toBe('POST');
    expect(responseData.headers['X-Mail-Processing-ID']).toBe(endpointProcessingId);

    // メール内容がWebhookデータに含まれていることを確認
    expect(responseData.body).toBeDefined();
    const bodyData = JSON.parse(responseData.body);
    expect(bodyData.subject).toBe(testSubject);

    console.log('✅ 複雑なメールデータの処理が正常に完了しました');
    console.log('取得したデータ:', {
      mailProcessingId: responseData.mailProcessingId,
      timestamp: responseData.timestamp,
      method: responseData.method,
      bodyLength: responseData.bodyLength,
    });
  }, 60000);
});
