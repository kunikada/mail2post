#!/usr/bin/env node

/**
 * テスト用Webhook APIのセットアップスクリプト
 *
 * このスクリプトは以下の処理を行います：
 * 1. テスト用APIのデプロイ
 * 2. エンドポイントURLの取得と表示
 * 3. テスト用設定ファイルの更新
 */

const { execSync } = require('child_process');
const { writeFileSync, existsSync } = require('fs');

const SERVERLESS_CONFIG = 'serverless-test-api.yml';
const TEST_CONFIG_PATH = 'config/test-api.json';

/**
 * コマンドを実行し、結果を表示
 */
function executeCommand(command, description) {
  console.log(`\n🔄 ${description}...`);
  console.log(`   実行中: ${command}`);

  try {
    const result = execSync(command, {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    console.log(`✅ ${description}が完了しました`);
    return result;
  } catch (error) {
    console.error(`❌ ${description}でエラーが発生しました:`);
    console.error(error.message);
    if (error.stdout) {
      console.error('STDOUT:', error.stdout);
    }
    if (error.stderr) {
      console.error('STDERR:', error.stderr);
    }
    throw error;
  }
}

/**
 * AWS CLIでStack出力値を取得
 */
function getStackOutput(stackName, outputKey) {
  try {
    const command = `aws cloudformation describe-stacks --region us-east-1 --stack-name ${stackName} --query 'Stacks[0].Outputs[?OutputKey==\`${outputKey}\`].OutputValue' --output text`;
    const result = execSync(command, { encoding: 'utf8' }).trim();

    if (!result || result === 'None') {
      throw new Error(`出力値 ${outputKey} が見つかりません`);
    }

    return result;
  } catch (error) {
    console.error(`AWS Stack出力値の取得に失敗: ${outputKey}`);
    throw error;
  }
}

/**
 * テスト用設定ファイルを更新
 */
function updateTestConfig(webhookUrl, apiId) {
  const bucketName = getStackOutput('mail2post-test-api-test', 'TestWebhookBucketName');

  const config = {
    webhook: {
      url: webhookUrl,
      apiId: apiId,
      bucketName: bucketName || 'mail2post-test-webhooks-test',
      headers: {
        'Content-Type': 'application/json',
        'X-Test-ID': '${TEST_ID}', // テスト実行時に置換される
      },
    },
    aws: {
      region: 'us-east-1',
    },
    test: {
      timeout: 30000,
      retryCount: 3,
      cleanupAfterTest: true,
    },
    lastUpdated: new Date().toISOString(),
  };

  // configディレクトリが存在しない場合は作成
  const configDir = 'config';
  if (!existsSync(configDir)) {
    executeCommand(`mkdir -p ${configDir}`, 'configディレクトリの作成');
  }

  writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`✅ テスト用設定ファイルを更新しました: ${TEST_CONFIG_PATH}`);
  console.log(`   Webhook URL: ${webhookUrl}`);
  console.log(`   API Gateway ID: ${apiId}`);
  console.log(`   S3 Bucket: ${bucketName || 'mail2post-test-webhooks-test'}`);
}

/**
 * メイン処理
 */
async function main() {
  console.log('🚀 Mail2Post テスト用Webhook APIのセットアップを開始します\n');

  try {
    // 1. AWS認証情報の確認
    console.log('🔐 AWS認証情報を確認中...');
    console.log(`   使用リージョン: us-east-1`);

    const identity = executeCommand('aws sts get-caller-identity', 'AWS認証情報の確認');
    const identityData = JSON.parse(identity);
    console.log(`   AWSアカウント: ${identityData.Account}`);
    console.log(`   IAMユーザー/ロール: ${identityData.Arn}`);

    // 2. 必要なファイルの存在確認
    if (!existsSync(SERVERLESS_CONFIG)) {
      throw new Error(`Serverless設定ファイルが見つかりません: ${SERVERLESS_CONFIG}`);
    }

    // 3. テスト用APIのビルド
    executeCommand('npm run build', 'アプリケーションのビルド');

    // 4. テスト用APIのデプロイ
    executeCommand(
      `serverless deploy --config ${SERVERLESS_CONFIG} --stage test`,
      'テスト用Webhook APIのデプロイ'
    );

    // 5. デプロイ結果の取得
    const stackName = 'mail2post-test-api-test';

    console.log('\n📡 デプロイされたリソース情報を取得中...');

    const webhookUrl = getStackOutput(stackName, 'WebhookApiUrl');
    const apiId = getStackOutput(stackName, 'WebhookApiId');

    console.log('\n✅ テスト用Webhook APIのセットアップが完了しました！\n');

    console.log('📊 デプロイされたリソース:');
    console.log(`   🌐 Webhook URL: ${webhookUrl}`);
    console.log(`   🔗 API Gateway ID: ${apiId}`);

    // 6. テスト用設定ファイルの更新
    updateTestConfig(webhookUrl, apiId);

    console.log('\n🎯 次のステップ:');
    console.log('   1. テストを実行: npm run test:integration');
    console.log('   2. APIの状態確認: npm run test:status');
    console.log('   3. ログの確認: npm run test:logs');
    console.log('   4. クリーンアップ: npm run test:cleanup:api');

    console.log('\n💡 ヒント:');
    console.log(`   - Webhook URLをテストで使用: ${webhookUrl}`);
    console.log('   - リクエスト/レスポンスの内容はLambdaログで確認できます');
    console.log('   - テスト実行時は "X-Test-ID" ヘッダーを設定してください');
  } catch (error) {
    console.error('\n❌ セットアップに失敗しました:');
    console.error(error.message);
    console.log('\n🔍 トラブルシューティング:');
    console.log('   - AWS認証情報が正しく設定されているか確認');
    console.log('   - 必要なIAM権限があるか確認');
    console.log('   - リージョンが正しく設定されているか確認');
    console.log('   - npm run test:cleanup:api でリソースをクリーンアップ');
    process.exit(1);
  }
}

// メイン処理を実行
main().catch(error => {
  console.error('予期しないエラーが発生しました:', error);
  process.exit(1);
});
