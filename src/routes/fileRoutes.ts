import { Router, Response } from 'express';
import multer from 'multer';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';
import { FileModel, FileType } from '../models/File.js';
import { uploadToS3 } from '../services/s3Service.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticateToken);

router.get('/files', async (req: AuthRequest, res: Response) => {
  const files = await FileModel.find({ user: req.user?._id }).sort({ createdAt: -1 });
  return res.json(files);
});

router.post('/files', upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    let fileType = FileType.DOCUMENT;
    const mime = req.file.mimetype;

    if (mime.startsWith('image/')) fileType = FileType.IMAGE;
    else if (mime.startsWith('video/')) fileType = FileType.VIDEO;
    else if (mime.startsWith('audio/')) fileType = FileType.AUDIO;

    const s3Url = await uploadToS3(req.file.buffer, req.file.originalname, mime);

    const fileDoc = await FileModel.create({
      user: req.user?._id,
      file_type: fileType,
      file_path: s3Url,
      file_name: req.file.originalname,
      mimetype: mime,
      caption: req.body.caption || '',
    });

    return res.status(201).json(fileDoc);
  } catch (err: any) {
    console.error('Error uploading file to S3:', err);
    return res.status(500).json({ error: err.message || 'Failed to upload file to S3' });
  }
});

export default router;
