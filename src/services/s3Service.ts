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

function getS3Bucket(): string {
  return process.env.S3_BUCKET_NAME || 'x.neuronwww.com';
}

function getS3Endpoint(): string {
  return process.env.S3_ENDPOINT_URL || 'ap-south-1.linodeobjects.com';
}

// Uploaded files are served public-read from our bucket, so only allow types that browsers
// will not execute as active content in the bucket's origin.
const BLOCKED_MIME_TYPES = new Set([
  'text/html',
  'image/svg+xml',
  'application/xhtml+xml',
  'application/xml',
  'text/xml',
  'application/javascript',
  'application/x-javascript',
  'application/ecmascript',
  'text/javascript',
  'text/ecmascript',
]);

const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

// Fallback when the browser sends no type / application/octet-stream (e.g. .docx on a
// machine without Office installed).
const EXTENSION_MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.3gp': 'video/3gpp',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.amr': 'audio/amr',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function isInlineMediaMime(mime: string): boolean {
  return mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/');
}

/**
 * Normalises and validates an upload's MIME type against the allowlist.
 * Returns the MIME type to store, or null if the file type is not allowed.
 */
export function resolveUploadMimeType(rawMime: string | undefined, originalName: string): string | null {
  let mime = String(rawMime || '').split(';')[0].trim().toLowerCase();

  if (!mime || mime === 'application/octet-stream') {
    const ext = path.extname(originalName || '').toLowerCase();
    mime = EXTENSION_MIME_TYPES[ext] || '';
  }

  if (!mime || BLOCKED_MIME_TYPES.has(mime)) return null;
  // Catch variants like image/svg+xml, */*+xml, x-html, *script (note: must not match "openxmlformats").
  if (/(^|[/+.-])(x?html|xml|svg)\b|script/.test(mime)) return null;
  if (isInlineMediaMime(mime) || ALLOWED_DOCUMENT_MIME_TYPES.has(mime)) return mime;
  return null;
}

/**
 * True if the URL points at an object in this app's own S3 bucket (path-style or
 * virtual-hosted-style on the configured endpoint).
 */
export function isOwnS3Url(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const host = parsed.hostname.toLowerCase();
  const endpoint = getS3Endpoint().toLowerCase();
  const bucket = getS3Bucket().toLowerCase();
  if (host === endpoint) {
    return parsed.pathname.toLowerCase().startsWith(`/${bucket}/`);
  }
  return host === `${bucket}.${endpoint}`;
}

export async function uploadToS3(
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<string> {
  const contentType = resolveUploadMimeType(mimeType, originalName);
  if (!contentType) {
    throw new Error(`File type not allowed: ${mimeType || 'unknown'}`);
  }

  const timestamp = Date.now();
  const randomSuffix = Math.round(Math.random() * 1e9);
  // Keep only a short alphanumeric extension from the client-supplied name.
  const rawExt = path.extname(originalName || '').toLowerCase();
  const ext = /^\.[a-z0-9]{1,10}$/.test(rawExt) ? rawExt : '';
  const key = `uploads/${timestamp}-${randomSuffix}${ext}`;
  const bucket = getS3Bucket();
  const endpoint = getS3Endpoint();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
    // Non-media files (pdf, office docs, text) are downloaded rather than rendered inline.
    ...(isInlineMediaMime(contentType) ? {} : { ContentDisposition: 'attachment' }),
    ACL: 'public-read',
    CacheControl: 'public, max-age=31536000, immutable',
  });

  await s3Client.send(command);

  return `https://${endpoint}/${bucket}/${key}`;
}
