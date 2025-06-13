# Amazon SES メール受信設定ガイド

このガイドでは、Mail2Postプロジェクトで使用するAmazon SES（Simple Email Service）のメール受信設定について詳しく説明します。

## 1. SESとは

Amazon SESは、AWSが提供するクラウドベースのメールサービスです。Mail2Postプロジェクトでは、以下の機能を利用します：

- **メール受信**: 指定したドメインのメールを受信
- **Lambdaトリガー**: 受信メールをトリガーにLambda関数を実行
- **メール保存**: 受信メールを一時的にS3に保存

## 2. 前提条件

### 2.1 AWSアカウント

- 有効なAWSアカウントが必要
- 適切なIAM権限が設定されていること

### 2.2 ドメインの準備

- メール受信用のドメインを所有していること
- DNSレコードの編集権限があること

### 2.3 SESサービスリージョン

SESのメール受信機能は、以下のリージョンで利用可能です：

#### メール受信対応リージョン
- **US East (N. Virginia)** - `us-east-1`
- **US West (Oregon)** - `us-west-2`
- **Europe (Ireland)** - `eu-west-1`
- **Europe (London)** - `eu-west-2`
- **Europe (Frankfurt)** - `eu-central-1`
- **Asia Pacific (Sydney)** - `ap-southeast-2`
- **Asia Pacific (Singapore)** - `ap-southeast-1`
- **Asia Pacific (Tokyo)** - `ap-northeast-1`
- **Canada (Central)** - `ca-central-1`

#### メール送信のみ対応リージョン
以下のリージョンではメール送信は可能ですが、**メール受信には対応していません**：
- US East (Ohio) - `us-east-2`
- US West (N. California) - `us-west-1`
- Asia Pacific (Mumbai) - `ap-south-1`
- South America (São Paulo) - `sa-east-1`

> **重要**: Mail2Postをデプロイするリージョンは、SESメール受信をサポートするリージョンである必要があります。最新の対応状況は[AWS SES リージョン一覧](https://docs.aws.amazon.com/general/latest/gr/ses.html)を確認してください。

## 3. SES設定手順

### 3.1 ドメインの検証

1. **AWSマネジメントコンソール**にログイン
2. **Amazon SES**サービスを開く
3. **Verified identities**（検証済みID）を選択
4. **Create identity**をクリック
5. **Domain**を選択し、メール受信用ドメインを入力
6. **Create identity**をクリック

### 3.2 DNS設定

ドメインの検証のため、以下のDNSレコードを設定します。設定方法はDNSプロバイダーによって異なりますが、ここではAWS Route53での設定方法も含めて説明します。

#### 必要なDNSレコード

**メール受信のみの場合、以下のDNSレコードが必要です：**

##### MXレコード（メール受信用・必須）
```
名前: yourdomain.com
値: 10 inbound-smtp.[リージョン].amazonaws.com
TTL: 1800
```

##### DKIMレコード（送信者認証用・推奨）
```
名前: [selector]._domainkey.yourdomain.com
値: [selector].dkim.amazonses.com
タイプ: CNAME
TTL: 1800
```

##### DMARCレコード（なりすまし防止用・推奨）
```
名前: _dmarc.yourdomain.com
値: v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com
タイプ: TXT
TTL: 1800
```

> **注意**: `_amazonses`のTXTレコード（ドメイン検証用）やSPFレコード（送信許可ドメイン）は、**メール送信時のみ必要**です。受信のみの場合は設定不要です。

**リージョン別MXレコード例：**
- `us-east-1`: `10 inbound-smtp.us-east-1.amazonaws.com`
- `us-west-2`: `10 inbound-smtp.us-west-2.amazonaws.com`
- `eu-west-1`: `10 inbound-smtp.eu-west-1.amazonaws.com`
- `eu-west-2`: `10 inbound-smtp.eu-west-2.amazonaws.com`
- `eu-central-1`: `10 inbound-smtp.eu-central-1.amazonaws.com`
- `ap-southeast-2`: `10 inbound-smtp.ap-southeast-2.amazonaws.com`
- `ap-southeast-1`: `10 inbound-smtp.ap-southeast-1.amazonaws.com`
- `ap-northeast-1`: `10 inbound-smtp.ap-northeast-1.amazonaws.com`
- `ca-central-1`: `10 inbound-smtp.ca-central-1.amazonaws.com`

#### AWS Route53での設定手順

AWS Route53を使用してドメインを管理している場合、以下の手順でDNSレコードを設定できます：

##### 3.2.1 Route53でのMXレコード設定

1. **AWSマネジメントコンソール**でRoute53サービスを開く
2. **Hosted zones**から対象ドメインを選択
3. **Create record**をクリック
4. 以下の設定を入力：
   - **Record name**: 空白（ルートドメインの場合）またはサブドメイン名
   - **Record type**: `MX`
   - **Value**: `10 inbound-smtp.[リージョン].amazonaws.com`
   - **TTL**: `300`（またはデフォルト値）
5. **Create records**をクリック

**例：** Tokyo リージョン（ap-northeast-1）の場合
```
Record name: (空白)
Record type: MX
Value: 10 inbound-smtp.ap-northeast-1.amazonaws.com
TTL: 300
```

##### 3.2.2 Route53でのDKIMレコード設定（推奨）

1. Route53のHosted zonesで対象ドメインを選択
2. **Create record**をクリック
3. 以下の設定を入力：
   - **Record name**: `[selector]._domainkey`
   - **Record type**: `CNAME`
   - **Value**: `[selector].dkim.amazonses.com`
   - **TTL**: `300`
4. **Create records**をクリック

> **DKIMセレクターの取得方法**: SESコンソール → Verified identities → ドメイン選択 → DKIM authentication で確認

##### 3.2.3 Route53でのDMARCレコード設定（推奨）

1. Route53のHosted zonesで対象ドメインを選択
2. **Create record**をクリック
3. 以下の設定を入力：
   - **Record name**: `_dmarc`
   - **Record type**: `TXT`
   - **Value**: `"v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com"`
   - **TTL**: `300`
4. **Create records**をクリック

##### 3.2.4 Route53 CLI での設定（オプション）

AWS CLIを使用してRoute53のレコードを設定することも可能です：

```bash
# HostedZone IDを取得
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones \
  --query "HostedZones[?Name=='yourdomain.com.'].Id" \
  --output text | cut -d'/' -f3)

# MXレコードの設定
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "yourdomain.com",
        "Type": "MX",
        "TTL": 300,
        "ResourceRecords": [{"Value": "10 inbound-smtp.ap-northeast-1.amazonaws.com"}]
      }
    }]
  }'

# DKIMレコードの設定（セレクターは事前にSESコンソールで確認）
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "selector123._domainkey.yourdomain.com",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "selector123.dkim.amazonses.com"}]
      }
    }]
  }'

# DMARCレコードの設定
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "_dmarc.yourdomain.com",
        "Type": "TXT",
        "TTL": 300,
        "ResourceRecords": [{"Value": "\"v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com\""}]
      }
    }]
  }'
```

##### 3.2.5 サブドメインでの受信設定

メール受信を特定のサブドメイン（例：`mail.yourdomain.com`）で行う場合：

```bash
# サブドメイン用MXレコード
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "mail.yourdomain.com",
        "Type": "MX",
        "TTL": 300,
        "ResourceRecords": [{"Value": "10 inbound-smtp.ap-northeast-1.amazonaws.com"}]
      }
    }]
  }'
```

この場合、設定ファイルでは以下のようにメールアドレスを指定します：

```json
{
  "ses": {
    "recipients": ["info@mail.yourdomain.com", "support@mail.yourdomain.com"]
  }
}
```

#### 他のDNSプロバイダーでの設定

Route53以外のDNSプロバイダー（CloudFlare、お名前.com、ムームードメインなど）を使用している場合は、そのプロバイダーの管理画面で同様のDNSレコードを設定してください。

**主要DNSプロバイダーでの設定例：**

##### CloudFlareでの設定
1. CloudFlareダッシュボード → DNS → Records
2. 各レコードタイプ（MX, CNAME, TXT）を追加

##### お名前.comでの設定
1. ドメイン設定 → DNS関連機能の設定 → DNSレコード設定
2. 各レコードを個別に追加

##### ムームードメインでの設定
1. ムームーDNS → カスタム設定
2. 各レコードタイプを設定

##### Aレコードについて

**メール受信のみの場合**: Aレコードは不要です。MXレコードのみで十分です。

**Webサイトとメール受信を併用する場合**: Aレコードが必要になります。

**パターン1: ルートドメインでWebサイトとメール受信を併用**
```
# Webサイト用
yourdomain.com.     A     [WebサーバーのIPアドレス]

# メール受信用  
yourdomain.com.     MX    10 inbound-smtp.ap-northeast-1.amazonaws.com

# DKIM認証用
selector._domainkey.yourdomain.com. CNAME selector.dkim.amazonses.com
```

**パターン2: サブドメインでメール受信を分離**
```
# Webサイト用
yourdomain.com.     A     [WebサーバーのIPアドレス]

# メール受信用（サブドメイン）
mail.yourdomain.com. MX   10 inbound-smtp.ap-northeast-1.amazonaws.com

# DKIM認証用（メールドメイン用）
selector._domainkey.mail.yourdomain.com. CNAME selector.dkim.amazonses.com
```

設定項目は同じですが、インターフェースが異なる場合があります。

### 3.3 メール受信ルールの設定

SESとLambdaの連携は、**メールアドレスの指定だけでは自動的に連携されません**。SES側で明示的に受信ルールを設定し、Lambda関数をアクションとして指定する必要があります。

Mail2Postプロジェクトでは、**Serverless Frameworkを使用して受信ルールが自動的に設定されます**。

#### 3.3.1 Serverless Frameworkでの自動設定

Mail2Postをデプロイする際、`serverless.yml`で以下の設定が自動的に作成されます：

- **SES受信ルールセット**: `mail2post-[stage]-ruleset`
- **SES受信ルール**: 指定したメールアドレスをLambda関数に転送
- **Lambda実行権限**: SESからLambda関数を呼び出す権限
- **S3バケット**: メール一時保存用

**重要**: 受信対象メールアドレスは環境別設定ファイル（`config/{stage}.json`）で設定します。

```json
{
  "aws": {
    "region": "us-east-1",
    "bucketName": "mail2post-dev"
  },
  "ses": {
    "recipients": ["info@dev.yourdomain.com", "support@dev.yourdomain.com"]
  },
  "routes": [
    {
      "emailAddress": "info@dev.yourdomain.com",
      "postEndpoint": "https://dev-webhook.yourdomain.com/api/info",
      "format": "json"
    },
    {
      "emailAddress": "support@dev.yourdomain.com",
      "postEndpoint": "https://dev-webhook.yourdomain.com/api/support",
      "format": "json"
    }
  ]
}
```



#### 3.3.2 ルールセットの有効化

**重要**: デプロイ後、作成されたルールセットを明示的に有効化する必要があります。

**なぜ自動化できないのか？**

CloudFormationの制限により、SESルールセットの作成はできますが、アクティブ化は手動で行う必要があります。

**リージョンの指定について**

AWS CLIでSESコマンドを実行する際は、必ずリージョンを指定してください。SESのメール受信機能は全リージョンで利用できるわけではないため、適切なリージョンを指定する必要があります。

```bash
# デプロイされたルールセットを有効化
aws ses set-active-receipt-rule-set --rule-set-name mail2post-dev-ruleset --region us-east-1

# または環境変数でリージョンを指定
export AWS_DEFAULT_REGION=us-east-1
aws ses set-active-receipt-rule-set --rule-set-name mail2post-dev-ruleset

# 本番環境の場合
aws ses set-active-receipt-rule-set --rule-set-name mail2post-prod-ruleset --region us-east-1
```

**使用するリージョンの確認方法:**

環境別設定ファイル（`config/{stage}.json`）で指定されているリージョンを確認し、同じリージョンを使用してください：

```bash
# 開発環境のリージョン確認
cat config/dev.json | grep -A 3 '"aws"'

# 設定例の出力:
# "aws": {
#   "region": "us-east-1",
#   "bucketName": "mail2post-dev"
# }
```

> **注意**: アクティブなルールセットは一度に1つだけです。既存のアクティブなルールセットがある場合は置き換えられます。

#### 3.3.3 設定の確認

### 3.4 重要な注意事項

#### 3.4.1 Serverless Frameworkでの自動化範囲

Mail2Postプロジェクトでは、以下がServerless Frameworkで自動化されます：

✅ **自動化される設定**
- SES受信ルールセットの作成
- SES受信ルールの作成
- Lambda関数の権限設定（SESからの呼び出し許可）
- S3バケットの作成とSESからの書き込み権限

❌ **手動で行う必要がある設定**
- MXレコードの設定
- DKIMレコードの設定（推奨）
- DMARCレコードの設定（推奨）
- ルールセットの有効化（*CloudFormationの制限により自動化不可）
- 環境別設定ファイル（`config/{stage}.json`）の作成・編集

#### 3.4.2 メールアドレス設定の変更

環境別設定ファイル（`config/{stage}.json`）を編集して再デプロイ：

```bash
# 開発環境の設定変更
vi config/dev.json
npm run deploy

# 本番環境の設定変更
vi config/prod.json
npm run deploy -- --stage prod
```

設定が正しく行われているかは以下の方法で確認できます：

##### AWS CLIでの確認
```bash
# アクティブなルールセットの確認
aws ses describe-active-receipt-rule-set --region us-east-1

# 特定のルールセットの詳細確認
aws ses describe-receipt-rule-set --rule-set-name mail2post-dev-ruleset --region us-east-1

# Lambda関数の権限確認
aws lambda get-policy --function-name mail2post-dev-processEmail --region us-east-1
```

##### AWSコンソールでの確認
1. **SES** → **Email receiving** → **Rule sets**
2. アクティブなルールセットに`mail2post-[stage]-ruleset`が表示されているか確認
3. ルール内容で適切なメールアドレスとLambda関数が設定されているか確認

> **注意**: Mail2Postプロジェクトでは、Serverless Frameworkを使用するため、通常はこれらの権限設定は自動的に行われます。

## 4. セキュリティ設定

### 4.1 受信制限

セキュリティを向上させるため、以下の制限を設定することを推奨します：

- **送信者制限**: 特定のドメインからのメールのみ受信
- **サイズ制限**: メールサイズの上限設定
- **レート制限**: 受信頻度の制限

## 5. トラブルシューティング

### 5.1 よくある問題

#### DNSレコードが反映されない
- DNS変更には最大48時間かかる場合があります
- `nslookup`や`dig`コマンドで確認してください

```bash
# MXレコードの確認
dig MX yourdomain.com

# DKIMレコードの確認
dig CNAME selector123._domainkey.yourdomain.com

# DMARCレコードの確認
dig TXT _dmarc.yourdomain.com
```

**Route53での確認方法：**
```bash
# Route53での設定確認
aws route53 list-resource-record-sets \
  --hosted-zone-id [HOSTED_ZONE_ID] \
  --query "ResourceRecordSets[?Type=='MX' || Type=='TXT' || Type=='CNAME']"

# DNSの伝播状況をオンラインツールで確認
# https://www.whatsmydns.net/ などで確認可能
```

#### メールが受信されない
1. **ドメイン検証が完了しているか確認**
   - AWSコンソール → SES → Verified identities でステータス確認
2. **MXレコードが正しく設定されているか確認**
   ```bash
   dig MX yourdomain.com
   ```
3. **SESルールセットがアクティブか確認**
   ```bash
   aws ses describe-active-receipt-rule-set --region us-east-1
   ```
4. **受信ルールの設定を確認**
   - Recipients（受信者）にメールアドレスが含まれているか
   - Lambda actionが正しく設定されているか
5. **CloudWatch Logsでエラーログを確認**

#### 環境別設定ファイルが見つからない場合
```bash
# 開発環境用設定ファイルの作成
cp config/staging.json config/dev.json

# 本番環境用設定ファイルの作成
cp config/staging.json config/prod.json
```

#### Route53のDNS設定に関する問題

##### HostedZone IDが見つからない場合
```bash
# HostedZone一覧の確認
aws route53 list-hosted-zones --query "HostedZones[].[Name,Id]" --output table

# 特定ドメインのHostedZone ID取得
aws route53 list-hosted-zones \
  --query "HostedZones[?Name=='yourdomain.com.'].Id" \
  --output text
```

##### DNSレコード設定の確認
```bash
# 現在のDNSレコード一覧表示
aws route53 list-resource-record-sets \
  --hosted-zone-id [HOSTED_ZONE_ID] \
  --output table

# MXレコードのみ表示
aws route53 list-resource-record-sets \
  --hosted-zone-id [HOSTED_ZONE_ID] \
  --query "ResourceRecordSets[?Type=='MX']"

# TXTレコードのみ表示  
aws route53 list-resource-record-sets \
  --hosted-zone-id [HOSTED_ZONE_ID] \
  --query "ResourceRecordSets[?Type=='TXT']"
```

##### DNSレコード削除（誤設定の修正）
```bash
# MXレコードの削除
aws route53 change-resource-record-sets \
  --hosted-zone-id [HOSTED_ZONE_ID] \
  --change-batch '{
    "Changes": [{
      "Action": "DELETE",
      "ResourceRecordSet": {
        "Name": "yourdomain.com",
        "Type": "MX",
        "TTL": 300,
        "ResourceRecords": [{"Value": "10 inbound-smtp.ap-northeast-1.amazonaws.com"}]
      }
    }]
  }'
```

#### 有効なメールアドレスが見つからない場合
環境別設定ファイル（`config/{stage}.json`）の`ses.recipients`配列にメールアドレスを設定。各ルートの`emailAddress`フィールドはローカル部分のみ指定。

#### Lambda関数が実行されない
1. SESルールセットがアクティブか確認
2. Lambda関数が正常にデプロイされているか確認
3. CloudWatch Logsでエラーログを確認

#### 連携の動作確認方法

```bash
# テストメール送信
echo "テストメール本文" | mail -s "テスト件名" info@yourdomain.com

# Lambda関数のログを確認
aws logs describe-log-streams \
  --log-group-name "/aws/lambda/mail2post-dev-processEmail" \
  --order-by LastEventTime --descending \
  --region us-east-1

# ルールセットの有効化状態確認
aws ses describe-active-receipt-rule-set --region us-east-1
```

### 5.2 デバッグ方法

```bash
# Lambda関数のログ確認
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/mail2post" --region us-east-1

# SES統計情報の確認
aws ses describe-receipt-rule-set --rule-set-name mail2post-dev-ruleset --region us-east-1

# Route53 DNS設定の詳細確認
aws route53 list-resource-record-sets --hosted-zone-id [HOSTED_ZONE_ID]

# DNSの伝播確認（外部ツール）
# https://www.whatsmydns.net/
# https://dnschecker.org/
```

## 6. コスト最適化

### 6.1 SES料金

- **受信メール**: 1,000通あたり$0.10
- **Lambda実行**: 実行時間とメモリ使用量に基づく
- **S3ストレージ**: メール保存用（オプション）

### 6.2 コスト削減のヒント

- 不要なメールのフィルタリング
- Lambda関数の実行時間最適化
- メールサイズの制限設定
- 古いメールデータの自動削除

## 7. 参考リンク

- [Amazon SES 開発者ガイド](https://docs.aws.amazon.com/ses/latest/dg/)
- [SES メール受信のセットアップ](https://docs.aws.amazon.com/ses/latest/dg/receiving-email.html)
- [Serverless Framework - SES Events](https://www.serverless.com/framework/docs/providers/aws/events/ses)
- [AWS SES 料金](https://aws.amazon.com/jp/ses/pricing/)

## 8. 次のステップ

SESの設定が完了したら、以下のドキュメントを参照して開発を進めてください：

- [技術仕様書](technical-specifications.md): 詳細な技術仕様
- [実装計画](implementation-plan.md): 開発の進め方
- [テスト戦略](testing-strategy.md): テストの実行方法
- [開発ガイド](../CONTRIBUTING_ja.md): 開発への参加方法
