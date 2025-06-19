#!/usr/bin/env node

const { execSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');

const TEST_CONFIG_PATH = 'config/test-api.json';

/**
 * コマンド実行ユーティリティ
 */
function executeCommand(command, description = '') {
  try {
    if (description) {
      console.log(`   実行中: ${description}`);
    }
    const result = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
    return result.trim();
  } catch (error) {
    console.error(`   ❌ エラー (${description}): ${error.message}`);
    return null;
  }
}

/**
 * テスト設定ファイルの読み込み
 */
function loadTestConfig() {
  if (!existsSync(TEST_CONFIG_PATH)) {
    throw new Error(
      `テスト用設定ファイルが見つかりません: ${TEST_CONFIG_PATH}\nnpm run test:setup:api を実行してください`
    );
  }

  const configData = readFileSync(TEST_CONFIG_PATH, 'utf8');
  return JSON.parse(configData);
}

/**
 * API Gateway の状態確認
 */
function checkApiGatewayStatus(apiId) {
  const result = executeCommand(
    `aws apigateway get-rest-api --region us-east-1 --rest-api-id ${apiId}`,
    'API Gateway の状態確認'
  );

  if (result) {
    const apiData = JSON.parse(result);
    console.log(`   API名: ${apiData.name}`);
    console.log(`   API ID: ${apiData.id}`);
    console.log(`   作成日: ${apiData.createdDate}`);
    return true;
  }
  return false;
}

/**
 * Lambda関数の状態確認
 */
function checkLambdaStatus() {
  const result = executeCommand(
    `aws lambda list-functions --region us-east-1 --query 'Functions[?contains(FunctionName, \`mail2post-test-api\`)].{Name:FunctionName,Runtime:Runtime,LastModified:LastModified}'`,
    'Lambda関数の状態確認'
  );

  if (result) {
    const functions = JSON.parse(result);
    if (functions.length > 0) {
      functions.forEach(func => {
        console.log(`   関数名: ${func.Name}`);
        console.log(`   ランタイム: ${func.Runtime}`);
        console.log(`   最終更新: ${func.LastModified}`);
      });
      return true;
    } else {
      console.log('   ❌ テスト用Lambda関数が見つかりません');
      return false;
    }
  }
  return false;
}

/**
 * Webhook APIの接続テスト
 */
function testWebhookConnection(webhookUrl) {
  console.log('\n🌐 Webhook API 接続テスト...');

  const testPayload = {
    test: true,
    timestamp: new Date().toISOString(),
  };

  const testCommand = `curl -s -X POST "${webhookUrl}" \\
    -H "Content-Type: application/json" \\
    -d '${JSON.stringify(testPayload)}'`;

  const result = executeCommand(testCommand, 'Webhook API 接続テスト');

  if (result) {
    try {
      const responseData = JSON.parse(result);
      if (responseData.success) {
        console.log('   ✅ Webhook API は正常に動作しています');
        console.log(`   📝 レスポンス時刻: ${responseData.timestamp}`);
        console.log(`   🔗 Request ID: ${responseData.received?.requestId || 'N/A'}`);
        console.log(
          `   📧 Mail Processing ID: ${responseData.received?.mailProcessingId || 'N/A'}`
        );
        console.log(`   📄 レスポンスボディ長: ${JSON.stringify(responseData).length} 文字`);
        return true;
      } else {
        console.log('   ❌ Webhook API がエラーを返しました');
        console.log(`   エラー: ${responseData.message || 'Unknown error'}`);
        return false;
      }
    } catch (parseError) {
      console.log('   ❌ レスポンスの解析に失敗しました');
      console.log(`   Raw response: ${result.substring(0, 200)}...`);
      console.log(`   エラー: ${parseError.message}`);
      return false;
    }
  }
  return false;
}

/**
 * Lambda関数の最近のログを表示
 */
function showRecentLogs() {
  console.log('\n📝 最近のLambdaログ (直近10分間):');

  const sinceTime = new Date(Date.now() - 10 * 60 * 1000).getTime(); // 10分前
  const logGroupName = '/aws/lambda/mail2post-test-api-test-webhookReceiver';

  const result = executeCommand(
    `aws logs filter-log-events --region us-east-1 --log-group-name "${logGroupName}" --start-time ${sinceTime} --limit 10 --query 'events[].message'`,
    'Lambda関数のログ取得'
  );

  if (result) {
    try {
      const logs = JSON.parse(result);
      if (logs.length > 0) {
        logs.forEach((log, index) => {
          console.log(`   ${index + 1}. ${log.substring(0, 100)}...`);
        });
      } else {
        console.log('   📭 最近のログはありません');
      }
    } catch (error) {
      console.log('   ❌ ログの取得に失敗しました');
      console.log(`   エラー: ${error.message}`);
    }
  }
}

/**
 * CloudFormationスタックの状態確認
 */
function checkStackStatus() {
  const stackName = 'mail2post-test-api-test';
  const result = executeCommand(
    `aws cloudformation describe-stacks --region us-east-1 --stack-name ${stackName} --query 'Stacks[0].{StackStatus:StackStatus,CreationTime:CreationTime,LastUpdatedTime:LastUpdatedTime}'`,
    'CloudFormationスタックの状態確認'
  );

  if (result) {
    const stackData = JSON.parse(result);
    console.log(`   スタック状態: ${stackData.StackStatus}`);
    console.log(`   作成日時: ${stackData.CreationTime}`);
    if (stackData.LastUpdatedTime) {
      console.log(`   最終更新: ${stackData.LastUpdatedTime}`);
    }
    return (
      stackData.StackStatus === 'CREATE_COMPLETE' || stackData.StackStatus === 'UPDATE_COMPLETE'
    );
  }
  return false;
}

/**
 * メイン処理
 */
async function main() {
  console.log('🔍 Mail2Post テスト用Webhook API の状態確認\n');

  try {
    // 1. AWS認証情報の確認
    console.log('🔐 AWS認証情報を確認中...');
    const identity = executeCommand('aws sts get-caller-identity', 'AWS認証情報の確認');
    if (identity) {
      const identityData = JSON.parse(identity);
      console.log(`   AWSアカウント: ${identityData.Account}`);
      console.log(`   リージョン: ${process.env.AWS_DEFAULT_REGION || 'default'}`);
    }

    // 2. テスト用設定ファイルの読み込み
    console.log('\n📋 テスト用設定の確認...');
    const config = loadTestConfig();
    console.log(`   設定ファイル: ${TEST_CONFIG_PATH}`);
    console.log(`   Webhook URL: ${config.webhook.url}`);
    console.log(`   API ID: ${config.webhook.apiId}`);
    console.log(`   最終更新: ${config.lastUpdated || 'N/A'}`);

    // 3. CloudFormationスタックの状態確認
    console.log('\n☁️ CloudFormationスタックの状態確認...');
    const stackOk = checkStackStatus();

    // 4. API Gatewayの状態確認
    console.log('\n🌐 API Gateway の状態確認...');
    const apiOk = checkApiGatewayStatus(config.webhook.apiId);

    // 5. Lambda関数の状態確認
    console.log('\n⚡ Lambda関数の状態確認...');
    const lambdaOk = checkLambdaStatus();

    // 6. Webhook APIの接続テスト
    const webhookOk = testWebhookConnection(config.webhook.url);

    // 7. 最近のログ表示
    showRecentLogs();

    // 8. 総合結果
    console.log('\n📊 ステータス概要:');
    console.log(`   CloudFormationスタック: ${stackOk ? '✅ 正常' : '❌ 異常'}`);
    console.log(`   API Gateway: ${apiOk ? '✅ 正常' : '❌ 異常'}`);
    console.log(`   Lambda関数: ${lambdaOk ? '✅ 正常' : '❌ 異常'}`);
    console.log(`   Webhook API: ${webhookOk ? '✅ 正常' : '❌ 異常'}`);

    const allOk = stackOk && apiOk && lambdaOk && webhookOk;
    console.log(`\n🎯 総合ステータス: ${allOk ? '✅ すべて正常' : '❌ 問題あり'}`);

    if (!allOk) {
      console.log('\n🔧 トラブルシューティング:');
      console.log('   1. npm run test:cleanup:api でリソースをクリーンアップ');
      console.log('   2. npm run test:setup:api で再セットアップ');
      console.log('   3. AWS CLIの認証情報を確認');
      console.log('   4. IAM権限を確認');
    }
  } catch (error) {
    console.error('\n❌ 状態確認に失敗しました:');
    console.error(error.message);
    console.log('\n🔍 トラブルシューティング:');
    console.log('   - npm run test:setup:api でテスト用APIをセットアップ');
    console.log('   - AWS認証情報が正しく設定されているか確認');
    console.log('   - リージョンが正しく設定されているか確認');
    process.exit(1);
  }
}

// メイン処理を実行
main().catch(error => {
  console.error('予期しないエラーが発生しました:', error);
  process.exit(1);
});
