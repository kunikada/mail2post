/**
 * Serverless Framework用の動的設定ファイル
 */

const fs = require('fs');
const path = require('path');

// stage の取得（環境変数やprocess.argvから）
function getStage() {
  // process.argvから--stageオプションを検索
  const args = process.argv;
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === '--stage') {
      return args[i + 1];
    }
  }

  // 環境変数から取得
  return process.env.SERVERLESS_STAGE || process.env.STAGE || process.env.NODE_ENV || 'dev';
}

const stage = getStage();
const configPath = path.join(__dirname, 'config', `${stage}.json`);

if (!fs.existsSync(configPath)) {
  throw new Error(`Config file not found: ${configPath}`);
}

const configRaw = fs.readFileSync(configPath, 'utf-8');
const config = JSON.parse(configRaw);

// SES受信者リストを生成
const recipients = config.routes ? config.routes.map(route => route.emailAddress) : [];

// エクスポート用の設定オブジェクト
module.exports = {
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
    routesConfigSource: config.system.routesConfigSource || 'file',
    notificationEmail: config.system.notificationEmail,
  },
};
