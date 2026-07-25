import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';
import { MessageTemplate } from '../models/MessageTemplate.js';

const router = Router();

router.use(authenticateToken);

router.get('/message-templates', async (req: AuthRequest, res: Response) => {
  const templates = await MessageTemplate.find({ user: req.user?._id }).populate('file').sort({ createdAt: -1 });
  return res.json(templates);
});

router.post('/message-templates', async (req: AuthRequest, res: Response) => {
  const { name, text, type, file, payload } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Template name is required' });
  }

  const template = await MessageTemplate.create({
    user: req.user?._id,
    name,
    type: type || 'text',
    text,
    file,
    payload: payload || {},
  });

  return res.status(201).json(template);
});

router.put('/message-templates/:id', async (req: AuthRequest, res: Response) => {
  const { name, text, type, file, payload } = req.body;
  const template = await MessageTemplate.findOneAndUpdate(
    { _id: req.params.id, user: req.user?._id },
    { name, text, type, file, payload },
    { new: true }
  );

  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  return res.json(template);
});

router.delete('/message-templates/:id', async (req: AuthRequest, res: Response) => {
  await MessageTemplate.deleteOne({ _id: req.params.id, user: req.user?._id });
  return res.json({ success: true });
});

export default router;
