import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';

const s3Client = new S3Client({
  region: process.env.S3_REGION_NAME || 'ap-south-1',
  endpoint: `https://${process.env.S3_ENDPOINT_URL || 'ap-south-1.linodeobjects.com'}`,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  },
  forcePathStyle: true,
});

export async function uploadToS3(
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<string> {
  const timestamp = Date.now();
  const randomSuffix = Math.round(Math.random() * 1e9);
  const ext = path.extname(originalName);
  const key = `uploads/${timestamp}-${randomSuffix}${ext}`;
  const bucket = process.env.S3_BUCKET_NAME || 'x.neuronwww.com';
  const endpoint = process.env.S3_ENDPOINT_URL || 'ap-south-1.linodeobjects.com';

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
    ACL: 'public-read',
    CacheControl: 'public, max-age=31536000, immutable',
  });

  await s3Client.send(command);

  return `https://${endpoint}/${bucket}/${key}`;
}
