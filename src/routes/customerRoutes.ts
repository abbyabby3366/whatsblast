import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';
import { Customer } from '../models/Customer.js';

const router = Router();

router.use(authenticateToken);

router.get('/customers', async (req: AuthRequest, res: Response) => {
  const customers = await Customer.find({ merchant: req.user?._id }).sort({ createdAt: -1 });
  return res.json(customers);
});

router.post('/customers', async (req: AuthRequest, res: Response) => {
  const { phone_number, name, notes, custom_data } = req.body;
  if (!phone_number) {
    return res.status(400).json({ error: 'phone_number is required' });
  }

  const cleanPhone = phone_number.replace(/[^0-9]/g, '');
  const customer = await Customer.findOneAndUpdate(
    { merchant: req.user?._id, phone_number: cleanPhone },
    { name, notes, custom_data },
    { upsert: true, new: true }
  );

  return res.status(201).json(customer);
});

router.post('/customers/bulk', async (req: AuthRequest, res: Response) => {
  const { customers } = req.body;
  if (!Array.isArray(customers)) {
    return res.status(400).json({ error: 'customers array is required' });
  }

  const operations = customers
    .filter((c) => c.phone_number)
    .map((c) => ({
      updateOne: {
        filter: { merchant: req.user?._id, phone_number: c.phone_number.replace(/[^0-9]/g, '') },
        update: { $set: { name: c.name || '', notes: c.notes || '', custom_data: c.custom_data || {} } },
        upsert: true,
      },
    }));

  if (operations.length > 0) {
    await Customer.bulkWrite(operations);
  }

  const all = await Customer.find({ merchant: req.user?._id });
  return res.json({ success: true, count: operations.length, total: all.length });
});

router.delete('/customers/:id', async (req: AuthRequest, res: Response) => {
  await Customer.deleteOne({ _id: req.params.id, merchant: req.user?._id });
  return res.json({ success: true });
});

export default router;
