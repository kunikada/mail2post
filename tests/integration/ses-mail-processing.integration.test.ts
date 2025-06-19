import { beforeAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { randomUUID } from 'crypto';

describe('SESメール処理統合テスト (SendGrid)', () => {
  const FROM_EMAIL = 'sender@mail2post.com';

  let transporter: Transporter;
  let config: { routes: { emailAddress: string; postEndpoint: string }[] };
  let sendgridConfig: {
    smtp: { host: string; port: number; auth: { user: string; pass: string } };
  };
  let testRoute: { emailAddress: string; postEndpoint: string } | undefined;
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
    testRoute = config.routes[0];
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

  it('SendGridでメール送信し、X-Mail-Processing-IDでWebhookデータを取得できること', async () => {
    // 設定が正しく読み込まれているかチェック
    if (!testRoute) {
      throw new Error('テストルート設定が読み込まれていません');
    }

    // テスト用の一意のMail Processing IDを生成
    const mailProcessingId = randomUUID();
    console.log('=== 統合テスト開始 ===');
    console.log('テスト用Mail Processing ID:', mailProcessingId);
    console.log('宛先メールアドレス:', testRoute.emailAddress);
    console.log('Webhook URL:', webhookUrl);

    // テスト用のメール件名（テスト識別用）
    const testSubject = `テストメール ${testId}`;
    const testTo = testRoute.emailAddress;

    // メール送信（X-Mail-Processing-IDヘッダーを付加）
    const mailOptions = {
      from: FROM_EMAIL,
      to: testTo,
      subject: testSubject,
      text: 'SendGrid → SES → Lambda → Webhook の統合テストです。',
      headers: {
        'X-Mail-Processing-ID': mailProcessingId,
      },
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('✅ SendGridからメールが送信されました');
      console.log('メッセージID:', info.messageId);
      console.log('送信先:', testTo);
      console.log('X-Mail-Processing-ID:', mailProcessingId);
      console.log('件名:', testSubject);
    } catch (error) {
      console.error('SendGridメール送信エラー:', error);
      throw error;
    }

    // メール処理の完了を待機
    console.log('\n📨 メール処理の完了を待機中...');
    console.log('待機時間: 15秒');
    await new Promise(resolve => setTimeout(resolve, 15000)); // 15秒待機

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
    console.log(
      'Webhook GET Response URL:',
      `${webhookUrl}?mailProcessingId=${endpointProcessingId}`
    );

    // レスポンス内容を詳細にログ出力
    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.log('GET Error Response:', errorText);
    }

    // GETが成功したことを確認
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

    console.log('✅ メール送信とX-Mail-Processing-IDによるデータ取得が正常に完了しました');
    console.log('取得したデータ:', {
      mailProcessingId: responseData.mailProcessingId,
      originalId: mailProcessingId,
      timestamp: responseData.timestamp,
      method: responseData.method,
      bodyLength: responseData.bodyLength,
    });
  }, 60000); // タイムアウトを60秒に設定
});
