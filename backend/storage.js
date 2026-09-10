const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Ensure environment variables are loaded if .env exists
try {
  require('dotenv').config();
} catch (e) {}

// Check Cloudflare R2 Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '61aa28c5ab3cb4b879f03388f47e1a0d';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || 'e887340c72d9befe14858b9d03905ba5';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || 'b65cf53b88c9109f94acc528b712038c4b7a9d379126ecfd9c6d46fcebe42060';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'kpi-storage';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || 'https://pub-4d4bf6bd5965404abc61975dcb16c02a.r2.dev').replace(/\/$/, '');

const isR2Configured = Boolean(
  R2_ACCOUNT_ID && 
  R2_ACCESS_KEY_ID && 
  R2_SECRET_ACCESS_KEY && 
  R2_BUCKET_NAME
);

let s3Client = null;
if (isR2Configured) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  console.log(`[Storage] Cloudflare R2 Object Storage is ACTIVATED (Bucket: ${R2_BUCKET_NAME})`);
} else {
  console.log('[Storage] Cloudflare R2 not configured. Using local disk storage fallback (/uploads).');
}

// Local fallback upload directory
const localUploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(localUploadDir)) {
  fs.mkdirSync(localUploadDir, { recursive: true });
}

// Multer memory storage (holds file in RAM buffer for instant dispatch to R2 or local disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
});

/**
 * Upload a file (from multer req.file buffer) to Cloudflare R2 or Local Fallback
 * @param {Object} file - req.file object from multer
 * @param {string} folder - target folder prefix (e.g. 'evidence', 'documents')
 * @returns {Promise<{ file_url: string, file_name: string, key: string, is_r2: boolean }>}
 */
async function saveUploadedFile(file, folder = 'attachments') {
  if (!file) return null;

  const ext = path.extname(file.originalname);
  const safeBaseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
  const fileKey = `${folder}/${Date.now()}-${uuidv4().substring(0, 8)}-${safeBaseName}${ext}`;

  if (isR2Configured && s3Client) {
    // 1. Upload directly to Cloudflare R2
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileKey,
      Body: file.buffer,
      ContentType: file.mimetype || 'application/octet-stream',
    });
    await s3Client.send(command);

    // If R2_PUBLIC_URL is provided, return direct CDN URL.
    // Otherwise fallback to backend proxy /api/storage/:key
    const publicUrl = R2_PUBLIC_URL 
      ? `${R2_PUBLIC_URL}/${fileKey}` 
      : `/api/storage/${fileKey}`;

    return {
      file_url: publicUrl,
      file_name: file.originalname,
      key: fileKey,
      is_r2: true
    };
  } else {
    // 2. Local disk fallback
    const localFileName = `${Date.now()}-${uuidv4()}${ext}`;
    const targetPath = path.join(localUploadDir, localFileName);
    fs.writeFileSync(targetPath, file.buffer);

    return {
      file_url: `/uploads/${localFileName}`,
      file_name: file.originalname,
      key: localFileName,
      is_r2: false
    };
  }
}

/**
 * Delete a file from Cloudflare R2 or local disk
 * @param {string} fileUrl - URL of file to delete
 */
async function deleteUploadedFile(fileUrl) {
  if (!fileUrl) return;

  try {
    if (fileUrl.startsWith('/uploads/')) {
      const filename = path.basename(fileUrl);
      const localPath = path.join(localUploadDir, filename);
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    } else if (isR2Configured && s3Client) {
      let key = fileUrl;
      if (R2_PUBLIC_URL && fileUrl.startsWith(R2_PUBLIC_URL)) {
        key = fileUrl.replace(`${R2_PUBLIC_URL}/`, '');
      } else if (fileUrl.startsWith('/api/storage/')) {
        key = fileUrl.replace('/api/storage/', '');
      }
      const command = new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key
      });
      await s3Client.send(command);
    }
  } catch (err) {
    console.warn('[Storage] Could not delete file:', fileUrl, err.message);
  }
}

module.exports = {
  upload,
  saveUploadedFile,
  deleteUploadedFile,
  isR2Configured,
  s3Client,
  R2_BUCKET_NAME,
  localUploadDir
};
