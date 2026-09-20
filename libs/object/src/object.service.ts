import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Trace } from '@gsainfoteam/nest-observability';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Service for using AWS S3.
 */
@Injectable()
@Trace()
export class ObjectService {
  private readonly logger = new Logger(ObjectService.name);
  private readonly s3Client: S3Client;
  constructor(private readonly configService: ConfigService) {
    this.s3Client = new S3Client({
      region: configService.getOrThrow('AWS_S3_REGION'),
      credentials: {
        accessKeyId: configService.getOrThrow('AWS_ACCESS_KEY_ID'),
        secretAccessKey: configService.getOrThrow('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  getUrl(key: string): string {
    return `https://${this.configService.getOrThrow<string>('AWS_S3_BUCKET')}.s3.${this.configService.getOrThrow<string>('AWS_S3_REGION')}.amazonaws.com/${key}`;
  }

  /**
   * create a presigned URL for an object in the S3 bucket
   * @param key the key of the object to create a presigned URL for (usually the filename or path)
   * @returns presigned URL
   */
  async createPresignedUrl(key: string, length: number): Promise<string> {
    this.logger.debug(`Creating presigned URL for ${key}`);
    const command = new PutObjectCommand({
      Bucket: this.configService.getOrThrow<string>('AWS_S3_BUCKET'),
      Key: key,
      ContentLength: length,
    });
    const expiresIn =
      this.configService.get<number>('AWS_PRESIGNED_URL_EXPIRES_IN') || 15 * 60; // 15 minutes default
    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * delete an object from the S3 bucket
   * @param key the key of the object to delete
   */
  async deleteObject(key: string): Promise<void> {
    this.logger.debug(`Deleting object ${key}`);
    const command = new DeleteObjectCommand({
      Bucket: this.configService.getOrThrow<string>('AWS_S3_BUCKET'),
      Key: key,
    });
    await this.s3Client.send(command);
  }
}
