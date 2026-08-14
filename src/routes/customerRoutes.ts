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

const getCustomerLabels = async (req: AuthRequest, res: Response) => {
  const labels = await Customer.distinct('label', { merchant: req.user?._id, label: { $nin: [null, ''] } });
  return res.json(labels);
};

router.get('/customers/labels', getCustomerLabels);

const getCustomers = async (req: AuthRequest, res: Response) => {
  const filter: any = { merchant: req.user?._id };
  const { search, label } = req.query;

  if (label && String(label).trim() && label !== 'all') {
    filter.label = String(label).trim();
  }

  if (search) {
    filter.$or = [
      { name: { $regex: String(search), $options: 'i' } },
      { phone_number: { $regex: String(search), $options: 'i' } },
      { label: { $regex: String(search), $options: 'i' } },
      { notes: { $regex: String(search), $options: 'i' } },
    ];
  }

  const customers = await Customer.find(filter).sort({ createdAt: -1 });
  return res.json(customers.map(formatCustomer));
};

router.get('/customers', getCustomers);

const createCustomer = async (req: AuthRequest, res: Response) => {
  const { phone_number, name, label, notes, custom_data } = req.body;
  if (!phone_number) {
    return res.status(400).json({ error: 'phone_number is required' });
  }

  const cleanPhone = phone_number.replace(/[^0-9]/g, '');
  const customer = await Customer.findOneAndUpdate(
    { merchant: req.user?._id, phone_number: cleanPhone },
    { name, label, notes, custom_data },
    { upsert: true, new: true }
  );

  return res.status(201).json(formatCustomer(customer));
};

router.post('/customers', createCustomer);

const importCustomers = async (req: AuthRequest, res: Response) => {
  const customers = req.body.customers || req.body;
  if (!Array.isArray(customers)) {
    return res.status(400).json({ error: 'customers array is required' });
  }

  const validCustomers = customers.filter((c) => c.phone_number);
  const phones = validCustomers.map((c) => String(c.phone_number).replace(/[^0-9]/g, '')).filter(Boolean);

  const existingCustomers = await Customer.find({ merchant: req.user?._id, phone_number: { $in: phones } });
  const existingMap = new Map(existingCustomers.map((c) => [c.phone_number, c]));

  const operations = [];

  for (const c of validCustomers) {
    const cleanPhone = String(c.phone_number).replace(/[^0-9]/g, '');
    if (!cleanPhone) continue;

    const existing = existingMap.get(cleanPhone);
    let finalLabel = c.label ? String(c.label).trim() : '';

    if (existing && existing.label) {
      const existingLabels = existing.label.split(',').map((s) => s.trim()).filter(Boolean);
      const newLabels = finalLabel ? finalLabel.split(',').map((s) => s.trim()).filter(Boolean) : [];
      finalLabel = Array.from(new Set([...existingLabels, ...newLabels])).join(', ');
    }

    const setFields: Record<string, any> = {
      label: finalLabel,
    };
    const setOnInsertFields: Record<string, any> = {};

    if (c.name) {
      setFields.name = c.name;
    } else {
      setOnInsertFields.name = '';
    }

    if (c.notes !== undefined && c.notes !== null) {
      setFields.notes = c.notes;
    } else {
      setOnInsertFields.notes = '';
    }

    if (c.custom_data !== undefined && c.custom_data !== null) {
      setFields.custom_data = c.custom_data;
    } else {
      setOnInsertFields.custom_data = {};
    }

    const updateDoc: Record<string, any> = {
      $set: setFields,
    };
    if (Object.keys(setOnInsertFields).length > 0) {
      updateDoc.$setOnInsert = setOnInsertFields;
    }

    operations.push({
      updateOne: {
        filter: { merchant: req.user?._id, phone_number: cleanPhone },
        update: updateDoc,
        upsert: true,
      },
    });
  }

  if (operations.length > 0) {
    await Customer.bulkWrite(operations);
  }

  const all = await Customer.find({ merchant: req.user?._id });
  return res.json({ success: true, imported: operations.length, count: operations.length, total: all.length });
};

router.post('/customers/import', importCustomers);
router.post('/customers/bulk', importCustomers);

const bulkDeleteCustomers = async (req: AuthRequest, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: 'ids array is required' });
  }

  const result = await Customer.deleteMany({ _id: { $in: ids }, merchant: req.user?._id });
  return res.json({ success: true, deleted: result.deletedCount });
};

router.post('/customers/bulk-delete', bulkDeleteCustomers);

const deleteCustomer = async (req: AuthRequest, res: Response) => {
  await Customer.deleteOne({ _id: req.params.id, merchant: req.user?._id });
  return res.json({ success: true });
};

router.delete('/customers/:id', deleteCustomer);

const updateCustomer = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { phone_number, name, label, notes, custom_data } = req.body;

  const existing = await Customer.findOne({ _id: id, merchant: req.user?._id });
  if (!existing) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const updateFields: any = {};
  if (name !== undefined) updateFields.name = name;
  if (label !== undefined) updateFields.label = label;
  if (notes !== undefined) updateFields.notes = notes;
  if (custom_data !== undefined) updateFields.custom_data = custom_data;

  if (phone_number !== undefined) {
    const cleanPhone = String(phone_number).replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      return res.status(400).json({ error: 'phone_number cannot be empty' });
    }

    const duplicate = await Customer.findOne({
      merchant: req.user?._id,
      phone_number: cleanPhone,
      _id: { $ne: id },
    });
    if (duplicate) {
      return res.status(400).json({ error: 'Phone number already exists for another customer' });
    }
    updateFields.phone_number = cleanPhone;
  }

  const updatedCustomer = await Customer.findOneAndUpdate(
    { _id: id, merchant: req.user?._id },
    { $set: updateFields },
    { new: true }
  );

  return res.json(formatCustomer(updatedCustomer));
};

router.put('/customers/:id', updateCustomer);
router.patch('/customers/:id', updateCustomer);

export default router;

