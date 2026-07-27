import { Router, Response } from 'express';
import multer from 'multer';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';
import { FileModel, FileType, IFile } from '../models/File.js';
import { uploadToS3 } from '../services/s3Service.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticateToken);

function formatFile(f: IFile | any) {
  const obj = f.toObject ? f.toObject() : f;
  const { _id, __v, ...rest } = obj;
  return {
    id: _id ? _id.toString() : obj.id,
    ...rest,
  };
}

const getFiles = async (req: AuthRequest, res: Response) => {
  const files = await FileModel.find({ user: req.user?._id }).sort({ createdAt: -1 });
  return res.json(files.map(formatFile));
};

router.get('/files', getFiles);

const createFile = async (req: AuthRequest, res: Response) => {
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
      file_size: req.file.size,
      mimetype: mime,
      caption: req.body.caption || '',
    });

    return res.status(201).json(formatFile(fileDoc));
  } catch (err: any) {
    console.error('Error uploading file to S3:', err);
    return res.status(500).json({ error: err.message || 'Failed to upload file to S3' });
  }
};

router.post('/files', upload.single('file'), createFile);

const deleteFile = async (req: AuthRequest, res: Response) => {
  await FileModel.deleteOne({ _id: req.params.id, user: req.user?._id });
  return res.json({ success: true });
};

router.delete('/files/:id', deleteFile);

export default router;
