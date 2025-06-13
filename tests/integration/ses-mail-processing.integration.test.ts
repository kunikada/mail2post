import { beforeAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

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

    // Webhook URLを設定
    webhookUrl = testRoute.postEndpoint.replace('/webhook', '');
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

  it('SendGridでメール送信し、SES→Lambda→Webhook処理が正常に動作すること', async () => {
    // 設定が正しく読み込まれているかチェック
    if (!testRoute) {
      throw new Error('テストルート設定が読み込まれていません');
    }

    // テスト用のメール件名（テスト識別用）
    const testSubject = `テストメール ${testId}`;
    const testTo = testRoute.emailAddress; // dev.jsonから取得
    const requestId = `test-request-${testId}`;

    // メール送信
    const mailOptions = {
      from: FROM_EMAIL,
      to: testTo,
      subject: testSubject,
      text: [
        'これはSendGridから送信されたテストメールです。',
        `テストID: ${testId}`,
        `RequestID: ${requestId}`,
        '',
        'SendGrid → SES → Lambda → Webhook の統合テストです。',
      ].join('\n'),
      headers: {
        'X-Test-ID': testId,
        'X-Request-ID': requestId,
      },
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('SendGridからメールが送信されました:', {
        messageId: info.messageId,
        response: info.response,
      });
    } catch (error) {
      console.error('SendGridメール送信エラー:', error);
      throw error;
    }

    // SESからLambda、Webhookへのリクエストまでしばらく待機
    console.log('メール処理の完了を待機中...');
    await new Promise(resolve => setTimeout(resolve, 15000)); // 15秒待機

    // Webhook APIのGETメソッドでデータを取得
    // dev.jsonから取得したWebhook URLを使用
    try {
      const getResponse = await fetch(
        `${webhookUrl}/webhook?testId=${testId}&requestId=${requestId}`
      );

      console.log('GET API Response Status:', getResponse.status);

      if (getResponse.ok) {
        const savedData = await getResponse.json();
        console.log('保存されたWebhookデータを取得しました:', {
          timestamp: savedData.timestamp,
          testId: savedData.testId,
          requestId: savedData.requestId,
          subject: savedData.subject,
          bodyLength: savedData.body?.length || 0,
        });

        // データの検証
        expect(savedData.testId).toBe(testId);
        expect(savedData.subject).toBe(testSubject);
        expect(savedData.from).toContain(FROM_EMAIL);
        expect(savedData.to).toContain(testTo);
        expect(savedData.body).toContain(`テストID: ${testId}`);
        expect(savedData.headers?.['X-Test-ID']).toBe(testId);
        expect(savedData.headers?.['X-Request-ID']).toBe(requestId);

        console.log('✅ SendGrid→SES→Lambda→Webhook→データ検証が全て正常に完了しました');
      } else {
        const errorText = await getResponse.text();
        console.error('GET API Error Response:', errorText);
        throw new Error(`GET API failed with status ${getResponse.status}: ${errorText}`);
      }
    } catch (fetchError) {
      console.error('GET機能テストエラー:', fetchError);
      throw fetchError;
    }
  }, 60000); // タイムアウトを60秒に設定
});
