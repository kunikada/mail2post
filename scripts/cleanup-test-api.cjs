#!/usr/bin/env node

/**
 * テスト用Webhook APIのクリーンアップスクリプト
 *
 * このスクリプトは以下の処理を行います：
 * 1. S3バケットの中身を削除
 * 2. テスト用APIスタックの削除
 * 3. テスト用設定ファイルの削除
 */

const { execSync } = require('child_process');
const { unlinkSync, existsSync } = require('fs');

const SERVERLESS_CONFIG = 'serverless-test-api.yml';
const TEST_CONFIG_PATH = 'config/test-api.json';
const TEST_BUCKET_NAME = 'mail2post-test-webhooks-test';

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
    console.error(`⚠️ ${description}でエラーが発生しました:`);
    console.error(error.message);
    // クリーンアップ処理ではエラーがあっても継続
    return null;
  }
}

/**
 * S3バケットの中身を削除
 */
function cleanupS3Bucket() {
  console.log(`\n🗑️ S3バケットのクリーンアップ: ${TEST_BUCKET_NAME}`);

  // バケットが存在するかチェック
  const bucketExists = executeCommand(
    `aws s3api head-bucket --bucket ${TEST_BUCKET_NAME} 2>/dev/null || echo "not-found"`,
    'S3バケット存在確認'
  );

  if (bucketExists && !bucketExists.includes('not-found')) {
    // バケットの中身を削除
    executeCommand(
      `aws s3 rm s3://${TEST_BUCKET_NAME} --recursive`,
      'S3バケット内オブジェクトの削除'
    );

    // バケットのバージョンオブジェクトも削除（バージョニングが有効な場合）
    executeCommand(
      `aws s3api list-object-versions --bucket ${TEST_BUCKET_NAME} --query 'Versions[].{Key:Key,VersionId:VersionId}' --output text | while read key version; do aws s3api delete-object --bucket ${TEST_BUCKET_NAME} --key "$key" --version-id "$version" 2>/dev/null || true; done`,
      'S3バケット内バージョンオブジェクトの削除'
    );

    // 削除マーカーも削除
    executeCommand(
      `aws s3api list-object-versions --bucket ${TEST_BUCKET_NAME} --query 'DeleteMarkers[].{Key:Key,VersionId:VersionId}' --output text | while read key version; do aws s3api delete-object --bucket ${TEST_BUCKET_NAME} --key "$key" --version-id "$version" 2>/dev/null || true; done`,
      'S3バケット内削除マーカーの削除'
    );

    console.log(`✅ S3バケット ${TEST_BUCKET_NAME} の中身を削除しました`);
  } else {
    console.log(`⚠️ S3バケット ${TEST_BUCKET_NAME} が見つかりません（既に削除済みの可能性）`);
  }
}

/**
 * 削除後の残存リソース確認
 */
function verifyCleanup() {
  console.log('\n🔍 クリーンアップ後の残存リソース確認...');

  // S3バケットの確認
  console.log('\n📦 S3バケットの確認:');
  executeCommand(
    `aws s3api head-bucket --bucket ${TEST_BUCKET_NAME} 2>/dev/null && echo "⚠️ バケットが残存しています" || echo "✅ バケットは削除されています"`,
    'S3バケット残存確認'
  );

  // CloudFormationスタックの確認
  console.log('\n☁️ CloudFormationスタックの確認:');
  executeCommand(
    `aws cloudformation describe-stacks --stack-name mail2post-test-api-test --region us-east-1 --query 'Stacks[0].StackStatus' --output text 2>/dev/null && echo "⚠️ スタックが残存しています" || echo "✅ スタックは削除されています"`,
    'CloudFormationスタック残存確認'
  );

  // Lambda Log Groupの確認
  console.log('\n📝 Lambda Log Groupの確認:');
  executeCommand(
    `aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/mail2post-test-api-test" --region us-east-1 --query 'logGroups[].logGroupName' --output text 2>/dev/null | grep -q "mail2post-test-api-test" && echo "⚠️ Log Groupが残存しています" || echo "✅ Log Groupは削除されています"`,
    'Lambda Log Group残存確認'
  );

  // API Gatewayの確認
  console.log('\n🌐 API Gatewayの確認:');
  executeCommand(
    `aws apigateway get-rest-apis --query 'items[?name==\`mail2post-test-api\`].id' --output text --region us-east-1 | grep -q . && echo "⚠️ API Gatewayが残存しています" || echo "✅ API Gatewayは削除されています"`,
    'API Gateway残存確認'
  );
}

/**
 * メイン処理
 */
async function main() {
  console.log('🧹 Mail2Post テスト用Webhook APIのクリーンアップを開始します\n');

  try {
    // 1. AWS認証情報の確認
    console.log('🔐 AWS認証情報を確認中...');
    console.log(`   使用リージョン: us-east-1`);

    const identity = executeCommand('aws sts get-caller-identity', 'AWS認証情報の確認');

    if (identity) {
      const identityData = JSON.parse(identity);
      console.log(`   AWSアカウント: ${identityData.Account}`);
    }

    // 2. S3バケットのクリーンアップ（Serverlessスタック削除前に実行）
    cleanupS3Bucket();

    // 3. Serverlessスタックの削除
    if (existsSync(SERVERLESS_CONFIG)) {
      executeCommand(
        `serverless remove --config ${SERVERLESS_CONFIG} --stage test`,
        'テスト用Webhook APIスタックの削除'
      );
    } else {
      console.log(`⚠️ Serverless設定ファイルが見つかりません: ${SERVERLESS_CONFIG}`);
    }

    // 4. テスト用設定ファイルの削除
    if (existsSync(TEST_CONFIG_PATH)) {
      unlinkSync(TEST_CONFIG_PATH);
      console.log(`✅ テスト用設定ファイルを削除しました: ${TEST_CONFIG_PATH}`);
    } else {
      console.log(`⚠️ テスト用設定ファイルが見つかりません: ${TEST_CONFIG_PATH}`);
    }

    // 5. CloudFormationスタックの状態確認
    console.log('\n📊 CloudFormationスタックの状態確認...');
    executeCommand(
      'aws cloudformation list-stacks --region us-east-1 --stack-status-filter DELETE_COMPLETE DELETE_IN_PROGRESS',
      'スタック削除状態の確認'
    );

    // 6. 削除後の残存リソース確認
    verifyCleanup();

    console.log('\n✅ テスト用Webhook APIのクリーンアップが完了しました！\n');

    console.log('🎯 確認事項:');
    console.log(`   - S3バケット "${TEST_BUCKET_NAME}" の中身が削除されました`);
    console.log('   - CloudFormationスタック "mail2post-test-api-test" が削除されました');
    console.log('   - Lambda Log Group が削除されました');
    console.log('   - API Gateway が削除されました');
    console.log(`   - テスト用設定ファイル "${TEST_CONFIG_PATH}" が削除されました`);

    console.log('\n💡 次回のテスト実行時:');
    console.log('   npm run test:setup:api でテスト用APIを再セットアップしてください');
  } catch (error) {
    console.error('\n❌ クリーンアップでエラーが発生しました:');
    console.error(error.message);
    console.log('\n🔍 手動クリーンアップが必要な場合:');
    console.log('   1. CloudFormation コンソールで "mail2post-test-api-test" スタックを確認');
    console.log('   2. API Gateway コンソールでテスト用APIを確認');
    process.exit(1);
  }
}

// メイン処理を実行
main().catch(error => {
  console.error('予期しないエラーが発生しました:', error);
  process.exit(1);
});
