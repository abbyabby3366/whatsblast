import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware.js';
import { Customer } from '../models/Customer.js';

const router = Router();

router.use(authenticateToken);

function formatCustomer(c: any) {
  const obj = c.toObject ? c.toObject() : c;
  const { _id, __v, ...rest } = obj;
  return {
    id: _id ? _id.toString() : obj.id,
    ...rest,
  };
}

const getCustomers = async (req: AuthRequest, res: Response) => {
  const filter: any = { merchant: req.user?._id };
  const { search } = req.query;

  if (search) {
    filter.$or = [
      { name: { $regex: String(search), $options: 'i' } },
      { phone_number: { $regex: String(search), $options: 'i' } },
      { notes: { $regex: String(search), $options: 'i' } },
    ];
  }

  const customers = await Customer.find(filter).sort({ createdAt: -1 });
  return res.json(customers.map(formatCustomer));
};

router.get('/customers', getCustomers);
router.get('/customers/', getCustomers);

const createCustomer = async (req: AuthRequest, res: Response) => {
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

  return res.status(201).json(formatCustomer(customer));
};

router.post('/customers', createCustomer);
router.post('/customers/', createCustomer);

const importCustomers = async (req: AuthRequest, res: Response) => {
  const customers = req.body.customers || req.body;
  if (!Array.isArray(customers)) {
    return res.status(400).json({ error: 'customers array is required' });
  }

  const operations = customers
    .filter((c) => c.phone_number)
    .map((c) => ({
      updateOne: {
        filter: { merchant: req.user?._id, phone_number: String(c.phone_number).replace(/[^0-9]/g, '') },
        update: { $set: { name: c.name || '', notes: c.notes || '', custom_data: c.custom_data || {} } },
        upsert: true,
      },
    }));

  if (operations.length > 0) {
    await Customer.bulkWrite(operations);
  }

  const all = await Customer.find({ merchant: req.user?._id });
  return res.json({ success: true, imported: operations.length, count: operations.length, total: all.length });
};

router.post('/customers/import', importCustomers);
router.post('/customers/import/', importCustomers);
router.post('/customers/bulk', importCustomers);
router.post('/customers/bulk/', importCustomers);

const bulkDeleteCustomers = async (req: AuthRequest, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: 'ids array is required' });
  }

  const result = await Customer.deleteMany({ _id: { $in: ids }, merchant: req.user?._id });
  return res.json({ success: true, deleted: result.deletedCount });
};

router.post('/customers/bulk-delete', bulkDeleteCustomers);
router.post('/customers/bulk-delete/', bulkDeleteCustomers);

const deleteCustomer = async (req: AuthRequest, res: Response) => {
  await Customer.deleteOne({ _id: req.params.id, merchant: req.user?._id });
  return res.json({ success: true });
};

router.delete('/customers/:id', deleteCustomer);
router.delete('/customers/:id/', deleteCustomer);

export default router;
