#!/usr/bin/env node

/* eslint-env node */

/**
 * mail2postのすべてのAWSリソースをクリーンアップするスクリプト（環境特有設定対応版）
 * - CloudFormationスタックのDELETE_FAILED状態を解決
 * - S3バケットの中身を空にする
 * - SESルールセットを非アクティブ化
 * - SESアイデンティティを削除
 */

// 環境特有の設定ファイルを読み込む
const fs = require('fs');
const path = require('path');

function loadConfig(stage = 'dev') {
  const configPath = path.join(__dirname, '..', 'config', `${stage}.json`);
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(configContent);
  } else {
    console.warn(`設定ファイル ${configPath} が見つかりません`);
    return {};
  }
}

const { S3Client, ListObjectVersionsCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

const {
  SESClient,
  ListReceiptRuleSetsCommand,
  DescribeActiveReceiptRuleSetCommand,
  SetActiveReceiptRuleSetCommand,
  DeleteReceiptRuleSetCommand,
} = require('@aws-sdk/client-ses');

const {
  CloudFormationClient,
  DescribeStacksCommand,
  DeleteStackCommand,
  ListStackResourcesCommand,
} = require('@aws-sdk/client-cloudformation');

const {
  CloudWatchLogsClient,
  DeleteLogGroupCommand,
  DescribeLogGroupsCommand,
} = require('@aws-sdk/client-cloudwatch-logs');

const {
  IAMClient,
  DeleteRoleCommand,
  DetachRolePolicyCommand,
  ListAttachedRolePoliciesCommand,
  DeleteRolePolicyCommand,
  ListRolePoliciesCommand,
  ListRolesCommand,
} = require('@aws-sdk/client-iam');

const {
  LambdaClient,
  DeleteFunctionCommand,
  ListFunctionsCommand,
} = require('@aws-sdk/client-lambda');

// 環境変数からステージとリージョンを取得
const stage = process.argv[2] || 'dev';

// 設定ファイルを読み込み
const config = loadConfig(stage);
const region = config.aws?.region || 'ap-northeast-1';
const bucketName = process.env.SLS_BUCKET_NAME || config.aws?.bucketName || `mail2post-${stage}`;
const ruleSetName = `mail2post-${stage}-ruleset`;
const stackName = `mail2post-${stage}`;

console.log(`🧹 リソースクリーンアップを開始します - ステージ: ${stage}, リージョン: ${region}`);
console.log(`🗑️ 対象バケット: ${bucketName}`);
console.log(`🗑️ 対象SESルールセット: ${ruleSetName}`);
console.log(`🗑️ 対象CloudFormationスタック: ${stackName}`);

/**
 * CloudFormationスタックの状態を確認し、DELETE_FAILEDの場合は強制削除を試行
 */
async function handleCloudFormationStack() {
  try {
    console.log('\n🏗️ CloudFormationスタックの状態確認...');
    const cfClient = new CloudFormationClient({ region });

    try {
      const { Stacks } = await cfClient.send(new DescribeStacksCommand({ StackName: stackName }));
      const stack = Stacks[0];

      if (!stack) {
        console.log(`ℹ️ スタック ${stackName} は存在しません`);
        return;
      }

      console.log(`📊 現在のスタック状態: ${stack.StackStatus}`);

      if (stack.StackStatus === 'DELETE_FAILED') {
        console.log('⚠️ DELETE_FAILED状態のスタックが検出されました。リソースを確認します...');

        // スタックリソースを確認
        const { StackResourceSummaries } = await cfClient.send(
          new ListStackResourcesCommand({ StackName: stackName })
        );

        console.log('📋 スタック内のリソース:');
        StackResourceSummaries.forEach(resource => {
          console.log(`  - ${resource.LogicalResourceId}: ${resource.ResourceStatus}`);
        });

        // スタックの強制削除を試行
        console.log('🔄 スタックの強制削除を試行します...');
        await cfClient.send(new DeleteStackCommand({ StackName: stackName }));

        // 削除完了まで待機
        let attempts = 0;
        const maxAttempts = 60; // 最大10分待機
        while (attempts < maxAttempts) {
          try {
            const { Stacks: checkStacks } = await cfClient.send(
              new DescribeStacksCommand({ StackName: stackName })
            );
            const currentStack = checkStacks[0];

            if (currentStack.StackStatus === 'DELETE_IN_PROGRESS') {
              console.log(`⏳ 削除進行中... (${attempts + 1}/${maxAttempts})`);
            } else if (currentStack.StackStatus === 'DELETE_COMPLETE') {
              console.log('✅ スタック削除が完了しました');
              return;
            } else if (currentStack.StackStatus === 'DELETE_FAILED') {
              console.log('❌ スタック削除が再び失敗しました');
              console.log('💡 手動でAWSコンソールからスタックの問題リソースを確認してください');
              return;
            }
          } catch (err) {
            if (err.name === 'ValidationError' && err.message.includes('does not exist')) {
              console.log('✅ スタック削除が完了しました');
              return;
            }
          }

          await new Promise(resolve => setTimeout(resolve, 10000)); // 10秒待機
          attempts++;
        }

        console.log('⏰ タイムアウト: スタック削除の完了を確認できませんでした');
      } else {
        console.log(`ℹ️ スタック状態は ${stack.StackStatus} です`);
      }
    } catch (err) {
      if (err.name === 'ValidationError' && err.message.includes('does not exist')) {
        console.log(`ℹ️ スタック ${stackName} は存在しません`);
      } else {
        throw err;
      }
    }
  } catch (error) {
    console.error('❌ CloudFormationスタックの処理中にエラーが発生しました:', error);
    throw error;
  }
}

/**
 * S3バケットを空にする
 */
async function emptyBucket() {
  try {
    console.log(`\n📦 S3バケット ${bucketName} の中身を削除中...`);
    const s3Client = new S3Client({ region });

    let isTruncated = true;
    let keyMarker;

    while (isTruncated) {
      const { Versions, DeleteMarkers, IsTruncated, NextKeyMarker } = await s3Client.send(
        new ListObjectVersionsCommand({
          Bucket: bucketName,
          KeyMarker: keyMarker,
        })
      );

      if (!Versions?.length && !DeleteMarkers?.length) {
        console.log('📭 バケットは既に空です');
        break;
      }

      const objectsToDelete = [
        ...(Versions || []).map(v => ({ Key: v.Key, VersionId: v.VersionId })),
        ...(DeleteMarkers || []).map(d => ({ Key: d.Key, VersionId: d.VersionId })),
      ];

      if (objectsToDelete.length > 0) {
        await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: { Objects: objectsToDelete },
          })
        );
        console.log(`🗑️ 削除したオブジェクト: ${objectsToDelete.length}個`);
      }

      isTruncated = IsTruncated;
      keyMarker = NextKeyMarker;
    }

    console.log('✅ S3バケットの中身を削除しました');
  } catch (error) {
    console.error('❌ S3バケットの削除中にエラーが発生しました:', error);
    // エラーを投げるのではなく、次のクリーンアップ処理に進むためにreturnする
    return;
  }
}

/**
 * SESルールセットを非アクティブ化して削除
 */
async function cleanupSESRules() {
  try {
    console.log('\n📧 SESルールセットのクリーンアップ開始...');
    const sesClient = new SESClient({ region });

    // アクティブなルールセットを確認
    try {
      const activeRuleSetResponse = await sesClient.send(
        new DescribeActiveReceiptRuleSetCommand({})
      );
      const activeRuleSet = activeRuleSetResponse.Metadata?.Name;

      // 対象のルールセットがアクティブな場合は非アクティブ化
      if (activeRuleSet === ruleSetName) {
        await sesClient.send(new SetActiveReceiptRuleSetCommand({ RuleSetName: null }));
        console.log('✅ ルールセットを非アクティブ化しました');
      } else {
        console.log(`ℹ️ ルールセット ${ruleSetName} は現在アクティブではありません`);
      }
    } catch (error) {
      console.log('ℹ️ アクティブなルールセットは設定されていません');
    }

    // ルールセットの削除を試行
    try {
      const ruleSetListResponse = await sesClient.send(new ListReceiptRuleSetsCommand({}));
      const ruleSets = ruleSetListResponse.RuleSets || [];

      // 対象のルールセットが存在するか確認
      const targetRuleSetExists = ruleSets.some(rs => rs.Name === ruleSetName);

      if (targetRuleSetExists) {
        await sesClient.send(new DeleteReceiptRuleSetCommand({ RuleSetName: ruleSetName }));
        console.log(`✅ ルールセット ${ruleSetName} を削除しました`);
      } else {
        console.log(`ℹ️ ルールセット ${ruleSetName} は存在しません`);
      }
    } catch (err) {
      console.error(`❌ ルールセット削除エラー: ${err.message}`);
    }
  } catch (error) {
    console.error('❌ SESルールセットのクリーンアップ中にエラーが発生しました:', error);
  }
}

/**
 * CloudWatch Logsのロググループを削除
 * ※ CloudFormationスタック削除時に自動削除されるため通常は不要
 */
async function cleanupCloudWatchLogs() {
  try {
    console.log('\n📝 CloudWatch Logsのクリーンアップ開始...');
    const logsClient = new CloudWatchLogsClient({ region });

    // ロググループのプレフィックスを設定
    const logGroupPrefix = `/aws/lambda/${stackName}`;

    // ロググループをリストアップ
    const logGroups = await logsClient.send(
      new DescribeLogGroupsCommand({
        LogGroupNamePrefix: logGroupPrefix,
      })
    );

    // 対象のロググループを削除
    for (const logGroup of logGroups.logGroups) {
      if (logGroup.logGroupName.startsWith(logGroupPrefix)) {
        await logsClient.send(new DeleteLogGroupCommand({ LogGroupName: logGroup.logGroupName }));
        console.log(`✅ ロググループ ${logGroup.logGroupName} を削除しました`);
      }
    }
  } catch (error) {
    console.error('❌ CloudWatch Logsのクリーンアップ中にエラーが発生しました:', error);
  }
}

/**
 * IAMロールとポリシーの削除
 * ※ CloudFormationスタック削除時に自動削除されるため通常は不要
 */
async function cleanupIAMRoles() {
  try {
    console.log('\n🔑 IAMロールとポリシーのクリーンアップ開始...');
    const iamClient = new IAMClient({ region });

    // スタック名に関連するIAMロールをリストアップ
    const roles = await iamClient.send(new ListRolesCommand({}));

    for (const role of roles.Roles) {
      if (role.RoleName.startsWith(stackName)) {
        // アタッチされているポリシーをデタッチ
        const attachedPolicies = await iamClient.send(
          new ListAttachedRolePoliciesCommand({ RoleName: role.RoleName })
        );
        for (const policy of attachedPolicies.AttachedPolicies) {
          await iamClient.send(
            new DetachRolePolicyCommand({ RoleName: role.RoleName, PolicyArn: policy.PolicyArn })
          );
          console.log(
            `✅ ポリシー ${policy.PolicyName} をロール ${role.RoleName} からデタッチしました`
          );
        }

        // インラインポリシーを削除
        const inlinePolicies = await iamClient.send(
          new ListRolePoliciesCommand({ RoleName: role.RoleName })
        );
        for (const policy of inlinePolicies.PolicyNames) {
          await iamClient.send(
            new DeleteRolePolicyCommand({ RoleName: role.RoleName, PolicyName: policy })
          );
          console.log(`✅ インラインポリシー ${policy} をロール ${role.RoleName} から削除しました`);
        }

        // ロールを削除
        await iamClient.send(new DeleteRoleCommand({ RoleName: role.RoleName }));
        console.log(`✅ ロール ${role.RoleName} を削除しました`);
      }
    }
  } catch (error) {
    console.error('❌ IAMロールとポリシーのクリーンアップ中にエラーが発生しました:', error);
  }
}

/**
 * Lambda関数の削除
 * ※ CloudFormationスタック削除時に自動削除されるため通常は不要
 */
async function cleanupLambdaFunctions() {
  try {
    console.log('\nλ Lambda関数のクリーンアップ開始...');
    const lambdaClient = new LambdaClient({ region });

    // スタック名に関連するLambda関数をリストアップ
    const functions = await lambdaClient.send(new ListFunctionsCommand({}));

    for (const func of functions.Functions) {
      if (func.FunctionName.startsWith(stackName)) {
        // Lambda関数を削除
        await lambdaClient.send(new DeleteFunctionCommand({ FunctionName: func.FunctionName }));
        console.log(`✅ Lambda関数 ${func.FunctionName} を削除しました`);
      }
    }
  } catch (error) {
    console.error('❌ Lambda関数のクリーンアップ中にエラーが発生しました:', error);
  }
}

/**
 * 削除後の残存リソース確認
 */
async function checkRemainingResources() {
  console.log('\n🔍 削除後の残存リソース確認...');

  try {
    const cfClient = new CloudFormationClient({ region });

    // CloudFormationスタックの確認
    try {
      const { Stacks } = await cfClient.send(new DescribeStacksCommand({ StackName: stackName }));
      if (Stacks && Stacks.length > 0) {
        console.log(
          `⚠️ CloudFormationスタック ${stackName} がまだ存在します (状態: ${Stacks[0].StackStatus})`
        );

        // スタック内のリソースを確認
        const { StackResourceSummaries } = await cfClient.send(
          new ListStackResourcesCommand({ StackName: stackName })
        );
        console.log('📋 残存リソース:');
        StackResourceSummaries.forEach(resource => {
          console.log(
            `  - ${resource.LogicalResourceId}: ${resource.ResourceStatus} (${resource.ResourceType})`
          );
        });
      } else {
        console.log('✅ CloudFormationスタックは正常に削除されました');
      }
    } catch (err) {
      if (err.name === 'ValidationError' && err.message.includes('does not exist')) {
        console.log('✅ CloudFormationスタックは正常に削除されました');
      } else {
        console.log(`⚠️ CloudFormationスタック確認エラー: ${err.message}`);
      }
    }

    // S3バケットの確認
    try {
      const s3Client = new S3Client({ region });
      const { Versions, DeleteMarkers } = await s3Client.send(
        new ListObjectVersionsCommand({ Bucket: bucketName })
      );

      if ((Versions && Versions.length > 0) || (DeleteMarkers && DeleteMarkers.length > 0)) {
        console.log(`⚠️ S3バケット ${bucketName} にまだオブジェクトが残存しています`);
        console.log(`  - バージョン: ${Versions?.length || 0}個`);
        console.log(`  - 削除マーカー: ${DeleteMarkers?.length || 0}個`);
      } else {
        console.log(`✅ S3バケット ${bucketName} は空です`);
      }
    } catch (err) {
      if (err.name === 'NoSuchBucket') {
        console.log(`✅ S3バケット ${bucketName} は正常に削除されました`);
      } else {
        console.log(`⚠️ S3バケット確認エラー: ${err.message}`);
      }
    }

    // SESルールセットの確認
    try {
      const sesClient = new SESClient({ region });
      const ruleSetListResponse = await sesClient.send(new ListReceiptRuleSetsCommand({}));
      const ruleSets = ruleSetListResponse.RuleSets || [];
      const targetRuleSetExists = ruleSets.some(rs => rs.Name === ruleSetName);

      if (targetRuleSetExists) {
        console.log(`⚠️ SESルールセット ${ruleSetName} がまだ存在します`);
      } else {
        console.log(`✅ SESルールセット ${ruleSetName} は正常に削除されました`);
      }
    } catch (err) {
      console.log(`⚠️ SESルールセット確認エラー: ${err.message}`);
    }
  } catch (error) {
    console.error('❌ 残存リソース確認中にエラーが発生しました:', error);
  }
}

/**
 * リソースクリーンアップの実行
 */
async function cleanupAllResources() {
  try {
    console.log('='.repeat(50));
    console.log('🧹 Mail2Post リソースクリーンアップ開始');
    console.log('='.repeat(50));

    // 順序重要: 先にS3とSESをクリーンアップしてからCloudFormationを処理
    await emptyBucket();
    await cleanupSESRules();
    await handleCloudFormationStack();

    // 削除後の残存リソース確認
    await checkRemainingResources();

    console.log('\n' + '='.repeat(50));
    console.log('✅ クリーンアップが完了しました');
    console.log('='.repeat(50));
  } catch (error) {
    console.error('❌❌❌ リソースクリーンアップ中にエラーが発生しました:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  cleanupAllResources();
}

module.exports = {
  emptyBucket,
  cleanupSESRules,
  handleCloudFormationStack,
  cleanupAllResources,
  checkRemainingResources,
  cleanupCloudWatchLogs,
  cleanupIAMRoles,
  cleanupLambdaFunctions,
};
