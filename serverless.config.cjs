/**
 * Serverless Framework用のJSONベース設定読み込みスクリプト
 */

const fs = require('fs');
const path = require('path');

/**
 * 環境に応じたJSONファイルを読み込み、設定オブジェクトを返す
 */
function loadServerlessConfig(stage = 'dev') {
  // JSONファイルのパス
  const configPath = path.join(__dirname, 'config', `${stage}.json`);

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  // JSONファイルを読み込み
  const configRaw = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(configRaw);

  // routes.emailAddressからses.recipientsを動的に生成
  const recipients = config.routes ? config.routes.map(route => route.emailAddress) : [];

  return {
    aws: {
      region: config.aws.region,
      bucketName: config.aws.bucketName,
    },
    ses: {
      recipients: recipients,
    },
    system: {
      logLevel: config.system.logLevel,
      lambdaMemorySize: config.system.lambdaMemorySize,
      lambdaTimeout: config.system.lambdaTimeout,
      notificationEmail: config.system.notificationEmail,
    },
  };
}

module.exports = { loadServerlessConfig };
