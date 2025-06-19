import { beforeAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { randomUUID } from 'crypto';

interface Config {
  routes: Array<{
    emailAddress: string;
    postEndpoint: string;
    format: string;
    transformationOptions?: {
      includeAttachments?: boolean;
      attachmentReferences?: boolean;
    };
  }>;
}

describe('複数エンドポイント処理統合テスト', () => {
  const FROM_EMAIL = 'sender@mail2post.com';

  let transporter: Transporter;
  let config: Config;
  let sendgridConfig: {
    smtp: { host: string; port: number; auth: { user: string; pass: string } };
  };
  let multiRoutes: Config['routes'];
  let partialFailRoutes: Config['routes'];
  let webhookUrls: string[];
  // 部分失敗テスト用の変数
  let failRoute: Config['routes'][0];
  let successRoute: Config['routes'][0];

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

    // 複数エンドポイント用のルートを取得（2番目と3番目のルート）
    multiRoutes = [config.routes[1], config.routes[2]]; // インデックス1と2（2番目と3番目）
    if (multiRoutes.length < 2 || !multiRoutes[0] || !multiRoutes[1]) {
      throw new Error(
        '複数エンドポイント用のルート設定が不足しています（2番目と3番目のルートが必要）'
      );
    }

    // 部分失敗テスト用のルートを取得（4番目と5番目のルート）
    partialFailRoutes = [config.routes[3], config.routes[4]]; // インデックス3と4（4番目と5番目）
    if (partialFailRoutes.length < 2 || !partialFailRoutes[0] || !partialFailRoutes[1]) {
      throw new Error('部分失敗テスト用のルート設定が不足しています（4番目と5番目のルートが必要）');
    }

    // 失敗エンドポイントと成功エンドポイントを分ける
    // 4番目のルート（インデックス3）が失敗用、5番目のルート（インデックス4）が成功用
    failRoute = partialFailRoutes[0]; // 4番目のルート（失敗用）
    successRoute = partialFailRoutes[1]; // 5番目のルート（成功用）

    if (!failRoute || !successRoute) {
      throw new Error('部分失敗テスト用の成功・失敗ルートが見つかりません');
    }

    // AWS Webhook URLを取得（有効なエンドポイントのみ）
    // 重複排除を行わず、設定されたすべてのエンドポイントを使用
    webhookUrls = multiRoutes
      .filter(route => route.postEndpoint.includes('amazonaws.com'))
      .map(route => route.postEndpoint);

    if (webhookUrls.length === 0) {
      throw new Error('AWS Webhook URLが見つかりません');
    }

    console.log('テスト対象のWebhook URL:', webhookUrls);

    // SendGrid SMTPトランスポーターを設定
    transporter = nodemailer.createTransport({
      host: sendgridConfig.smtp.host,
      port: sendgridConfig.smtp.port,
      secure: false,
      auth: {
        user: sendgridConfig.smtp.auth.user,
        pass: sendgridConfig.smtp.auth.pass,
      },
    });

    // SMTP接続テスト
    try {
      await transporter.verify();
      console.log('✅ SendGrid SMTP接続テストが成功しました');
    } catch (error) {
      console.error('❌ SendGrid SMTP接続テストが失敗しました:', error);
      throw error;
    }
  });

  it('1つのメールが複数のエンドポイントに送信されること', async () => {
    // テスト用の一意のMail Processing IDを生成
    const mailProcessingId = randomUUID();
    console.log('=== 複数エンドポイント統合テスト開始 ===');
    console.log('テスト用Mail Processing ID:', mailProcessingId);
    console.log('宛先メールアドレス:', multiRoutes[0].emailAddress);
    console.log('設定されたエンドポイント数:', multiRoutes.length);

    // 複数エンドポイントが設定されていることを確認
    expect(multiRoutes.length).toBe(2);
    expect(webhookUrls.length).toBe(2); // 2つのエンドポイントがあるべき

    // テスト用のメール件名（テスト識別用）
    const testSubject = `複数エンドポイントテスト ${testId}`;
    const testTo = multiRoutes[0].emailAddress; // 2番目のルートのメールアドレスを使用

    // メール送信（X-Mail-Processing-IDヘッダーを付加）
    const mailOptions = {
      from: FROM_EMAIL,
      to: testTo,
      subject: testSubject,
      text: 'SendGrid → SES → Lambda → 複数Webhook の統合テストです。',
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
    console.log('待機時間: 20秒');
    await new Promise(resolve => setTimeout(resolve, 20000)); // 20秒待機

    // 各AWS Webhookエンドポイントからデータを取得して検証
    const verificationResults = [];
    for (let i = 0; i < webhookUrls.length; i++) {
      const webhookUrl = webhookUrls[i];
      // エンドポイントごとに通し番号が付与されたIDを使用
      const endpointProcessingId = `${mailProcessingId}-${i + 1}`;

      console.log(`\n🔍 Webhook ${i + 1}からデータを取得中...`);
      console.log('GET URL:', `${webhookUrl}?mailProcessingId=${endpointProcessingId}`);

      try {
        const getResponse = await fetch(`${webhookUrl}?mailProcessingId=${endpointProcessingId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        console.log(`Webhook ${i + 1} GET Response Status:`, getResponse.status);

        if (getResponse.ok) {
          const responseData = await getResponse.json();
          verificationResults.push({
            webhookIndex: i + 1,
            success: true,
            data: responseData,
          });

          // レスポンスデータの検証
          expect(responseData).toBeDefined();
          expect(responseData.mailProcessingId).toBe(endpointProcessingId);
          expect(responseData.method).toBe('POST');
          expect(responseData.headers['X-Mail-Processing-ID']).toBe(endpointProcessingId);

          // メール内容がWebhookデータに含まれていることを確認
          expect(responseData.body).toBeDefined();
          const bodyData = JSON.parse(responseData.body);
          expect(bodyData.subject).toBe(testSubject);

          console.log(`✅ Webhook ${i + 1}のデータ検証が成功しました`);
        } else {
          const errorText = await getResponse.text();
          console.log(`❌ Webhook ${i + 1} GET Error Response:`, errorText);
          verificationResults.push({
            webhookIndex: i + 1,
            success: false,
            error: errorText,
          });
        }
      } catch (error) {
        console.error(`❌ Webhook ${i + 1}へのリクエストでエラー:`, error);
        verificationResults.push({
          webhookIndex: i + 1,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // 少なくとも1つのWebhookが成功していることを確認
    const successfulWebhooks = verificationResults.filter(result => result.success);

    // Webhookデータが見つからない場合は、API連携が失敗している
    if (successfulWebhooks.length === 0) {
      console.error('\n❌ エラー: Webhookデータが見つかりませんでした。');
      console.error(
        'SESからLambdaへの連携、またはLambdaからWebhookへの送信が失敗している可能性があります。'
      );
      console.error('以下を確認してください:');
      console.error('1. SESのルール設定が正しいか');
      console.error('2. Lambda関数が実行されているか（CloudWatchログ）');
      console.error('3. S3バケットにデータが保存されているか');
    }

    // このテストは実際のAPI応答に基づいて成否を判定
    // 2つのエンドポイントが設定されていて、それぞれ処理されることを確認
    expect(successfulWebhooks.length).toBe(2); // 成功したWebhook数は2つ
    expect(verificationResults.length).toBe(2); // 全Webhook数は設定通り2つ

    console.log('\n📊 複数エンドポイント処理結果:');
    console.log('成功したWebhook数:', successfulWebhooks.length);
    console.log('全Webhook数:', verificationResults.length);

    console.log('✅ 複数エンドポイント処理統合テストが正常に完了しました');
  }, 60000); // タイムアウトを60秒に設定

  it('1つのエンドポイントが失敗しても他のエンドポイントは処理されること', async () => {
    // テスト用の一意のMail Processing IDを生成
    const mailProcessingId = randomUUID();

    console.log('=== 部分失敗統合テスト開始 ===');
    console.log('テスト用Mail Processing ID:', mailProcessingId);
    console.log('宛先メールアドレス:', partialFailRoutes[0].emailAddress);
    console.log('設定されたエンドポイント数:', partialFailRoutes.length);
    console.log('失敗用エンドポイント:', failRoute.postEndpoint);
    console.log('成功用エンドポイント:', successRoute.postEndpoint);

    // テスト用のメール件名（テスト識別用）
    const testSubject = `部分失敗テスト ${testId}`;
    const testTo = partialFailRoutes[0].emailAddress; // 4番目のルートのメールアドレスを使用

    // メール送信（X-Mail-Processing-IDヘッダーを付加）
    const mailOptions = {
      from: FROM_EMAIL,
      to: testTo,
      subject: testSubject,
      text: 'SendGrid → SES → Lambda → 部分失敗テスト の統合テストです。',
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
    console.log('待機時間: 30秒');
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30秒待機（十分な処理時間を確保）

    // 失敗エンドポイントには通し番号「1」が付与される
    // 成功エンドポイントには通し番号「2」が付与される
    const failProcessingId = `${mailProcessingId}-1`;
    const successProcessingId = `${mailProcessingId}-2`;

    // 失敗するエンドポイントの確認
    console.log('\n🔍 失敗するエンドポイント:', failRoute.postEndpoint);
    console.log('失敗用Mail Processing ID:', failProcessingId);

    // 成功するエンドポイントからデータを取得して検証
    console.log('\n🔍 成功するWebhookからデータを取得中...');
    console.log('GET URL:', `${successRoute.postEndpoint}?mailProcessingId=${successProcessingId}`);

    const getResponse = await fetch(
      `${successRoute.postEndpoint}?mailProcessingId=${successProcessingId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Success Webhook GET Response Status:', getResponse.status);

    // レスポンス内容を詳細にログ出力
    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.log('Success Webhook GET Error Response:', errorText);

      // APIからのエラーレスポンスを表示し、テストを失敗させる
      console.error('\n❌ エラー: Webhookデータが見つかりませんでした。');
      console.error(
        'SESからLambdaへの連携、またはLambdaからWebhookへの送信が失敗している可能性があります。'
      );
      console.error('以下を確認してください:');
      console.error('1. SESのルール設定が正しいか');
      console.error('2. Lambda関数が実行されているか（CloudWatchログ）');
      console.error('3. S3バケットにデータが保存されているか');

      // テストを失敗させる
      expect(getResponse.status).toBe(200);
      throw new Error('Webhook APIからデータを取得できませんでした');
    }

    const responseData = await getResponse.json();

    // レスポンスデータの検証
    expect(responseData).toBeDefined();
    expect(responseData.mailProcessingId).toBe(successProcessingId);
    expect(responseData.method).toBe('POST');
    expect(responseData.headers['X-Mail-Processing-ID']).toBe(successProcessingId);

    // メール内容がWebhookデータに含まれていることを確認
    expect(responseData.body).toBeDefined();
    const bodyData = JSON.parse(responseData.body);
    expect(bodyData.subject).toBe(testSubject);

    console.log('✅ 部分失敗時でも正常なエンドポイントが処理されることを確認しました');
    console.log('取得したデータ:', {
      mailProcessingId: responseData.mailProcessingId,
      originalId: mailProcessingId,
      timestamp: responseData.timestamp,
      method: responseData.method,
      bodyLength: responseData.bodyLength,
    });
  }, 60000); // タイムアウトを60秒に設定
});
