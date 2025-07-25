/**
 * S3からメールデータを取得するサービス
 */

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ParsedEmail } from '@/types';
import { SimpleEmailParser } from './email/SimpleEmailParser';

export class S3EmailService {
  private s3Client: S3Client;

  constructor(region: string) {
    this.s3Client = new S3Client({ region });
  }

  /**
   * S3からメールデータを取得してパースする
   * @param bucketName S3バケット名
   * @param objectKey S3オブジェクトキー
   * @returns ParsedEmail パースされたメールデータ
   */
  async getEmailFromS3(bucketName: string, objectKey: string): Promise<ParsedEmail> {
    try {
      // S3からメールデータを取得
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new Error('S3からメールデータを取得できませんでした');
      }

      // ストリームをバッファに変換
      const chunks: Uint8Array[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // メールをパース
      const parsedMail = await SimpleEmailParser.parse(buffer);
      return parsedMail;
    } catch (error) {
      console.error('S3からのメール取得エラー:', error);
      throw new Error(
        `S3からメールを取得できませんでした: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * SESイベントからS3オブジェクトキーを生成
   * @param messageId メッセージID
   * @returns S3オブジェクトキー
   */
  generateS3Key(messageId: string): string {
    return `emails/${messageId}`;
  }
}
