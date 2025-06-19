import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

// S3クライアントの初期化
const s3Client = new S3Client({ region: 'us-east-1' }); // リージョンを直接指定
const BUCKET_NAME = process.env.TEST_BUCKET_NAME || 'mail2post-test-webhooks';

/**
 * テスト用Webhook受信Lambda関数
 * POSTでS3に内容を保存し、GETで保存内容を取得する
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Webhook受信:', JSON.stringify(event, null, 2));

  try {
    const method = event.httpMethod;

    if (method === 'POST') {
      return await handlePost(event);
    } else if (method === 'GET') {
      return await handleGet(event);
    } else if (method === 'OPTIONS') {
      return handleOptions();
    } else {
      return {
        statusCode: 405,
        headers: getCorsHeaders(),
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }
  } catch (error) {
    console.error('Webhook処理エラー:', error);

    return {
      statusCode: 500,
      headers: getCorsHeaders(),
      body: JSON.stringify({
        success: false,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

/**
 * POSTリクエストの処理：S3にデータを保存
 */
async function handlePost(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const timestamp = new Date().toISOString();
  const mailProcessingId =
    event.headers['X-Mail-Processing-ID'] || event.headers['x-mail-processing-id'];
  const sourceIp = event.requestContext.identity.sourceIp;
  const apiGatewayRequestId = event.requestContext.requestId;

  // S3キーとしてはmailProcessingIdを優先、なければapiGatewayRequestIdを使用
  const s3KeyId = mailProcessingId || apiGatewayRequestId;

  console.log('POSTリクエストを受信:', {
    apiGatewayRequestId,
    mailProcessingId,
    s3KeyId,
    timestamp,
    contentType: event.headers['Content-Type'] || event.headers['content-type'],
  });

  // S3に保存するデータを構築
  const webhookData = {
    timestamp,
    mailProcessingId,
    s3KeyId,
    apiGatewayRequestId, // デバッグ用に両方のIDを保存
    method: event.httpMethod,
    path: event.path,
    sourceIp,
    headers: {
      'Content-Type': event.headers['Content-Type'] || event.headers['content-type'],
      'User-Agent': event.headers['User-Agent'] || event.headers['user-agent'],
      'X-Mail-Processing-ID': mailProcessingId,
    },
    queryStringParameters: event.queryStringParameters,
    body: event.body,
    bodyLength: event.body ? event.body.length : 0,
    isBase64Encoded: event.isBase64Encoded,
  };

  // S3にデータを保存
  const s3Key = `webhooks/${s3KeyId}.json`;

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: JSON.stringify(webhookData, null, 2),
        ContentType: 'application/json',
        Metadata: {
          'mail-processing-id': mailProcessingId || 'unknown',
          's3-key-id': s3KeyId,
          timestamp: timestamp,
        },
      })
    );

    console.log(`データをS3に保存しました: s3://${BUCKET_NAME}/${s3Key}`);

    const response = {
      success: true,
      message: 'Webhook received and saved successfully',
      timestamp,
      stored: {
        bucket: BUCKET_NAME,
        key: s3Key,
        mailProcessingId,
        s3KeyId,
      },
      received: webhookData,
    };

    return {
      statusCode: 200,
      headers: getCorsHeaders(),
      body: JSON.stringify(response, null, 2),
    };
  } catch (s3Error) {
    console.error('S3保存エラー:', s3Error);
    throw new Error(
      `Failed to save to S3: ${s3Error instanceof Error ? s3Error.message : 'Unknown error'}`
    );
  }
}

/**
 * GETリクエストの処理：S3からデータを取得
 */
async function handleGet(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // X-Mail-Processing-IDをヘッダーまたはクエリパラメータから取得
  const mailProcessingIdFromHeader =
    event.headers['X-Mail-Processing-ID'] || event.headers['x-mail-processing-id'];
  const mailProcessingIdFromQuery = event.queryStringParameters?.mailProcessingId;

  // POSTと同じロジック：mailProcessingIdを使用
  const s3KeyId = mailProcessingIdFromHeader || mailProcessingIdFromQuery;

  if (!s3KeyId) {
    return {
      statusCode: 400,
      headers: getCorsHeaders(),
      body: JSON.stringify({
        error: 'Missing required parameter: X-Mail-Processing-ID',
        usage: 'GET /webhook with X-Mail-Processing-ID header or ?mailProcessingId=<id>',
      }),
    };
  }

  console.log('GETリクエストを受信:', {
    mailProcessingIdFromHeader,
    mailProcessingIdFromQuery,
    s3KeyId,
  });

  try {
    // POSTと同じS3キー構造でデータを取得
    const s3Key = `webhooks/${s3KeyId}.json`;

    try {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: s3Key,
        })
      );

      const data = await response.Body?.transformToString('utf-8');

      console.log(`S3からデータを取得しました: s3://${BUCKET_NAME}/${s3Key}`);

      return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: data || '{}',
      };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
        console.log(`S3にデータが見つかりませんでした: s3://${BUCKET_NAME}/${s3Key}`);
        return {
          statusCode: 404,
          headers: getCorsHeaders(),
          body: JSON.stringify({
            error: 'Webhook data not found',
            s3KeyId,
            s3Key,
          }),
        };
      }
      throw error;
    }
  } catch (error) {
    console.error('GET処理エラー:', error);
    throw error;
  }
}

/**
 * OPTIONSリクエストの処理：CORS対応
 */
function handleOptions(): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: getCorsHeaders(),
    body: '',
  };
}

/**
 * CORSヘッダーを取得
 */
function getCorsHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Mail-Processing-ID',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
}
