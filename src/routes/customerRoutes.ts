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

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const getCustomerLabels = async (req: AuthRequest, res: Response) => {
  const rawLabels = await Customer.distinct('label', { merchant: req.user?._id, label: { $nin: [null, ''] } });
  const uniqueLabels = new Set<string>();
  for (const item of rawLabels) {
    if (typeof item === 'string') {
      item.split(',').forEach((l) => {
        const trimmed = l.trim();
        if (trimmed) uniqueLabels.add(trimmed);
      });
    }
  }
  return res.json(Array.from(uniqueLabels).sort((a, b) => a.localeCompare(b)));
};

router.get('/customers/labels', getCustomerLabels);

const getCustomers = async (req: AuthRequest, res: Response) => {
  const filter: any = { merchant: req.user?._id };
  const { search, label, page, page_size, all } = req.query;

  if (label && String(label).trim() && label !== 'all') {
    const trimmedLabel = String(label).trim();
    const escapedLabel = escapeRegex(trimmedLabel);
    filter.label = { $regex: `(^|,\\s*)${escapedLabel}(,\\s*|$)`, $options: 'i' };
  }

  if (search) {
    const rawSearch = String(search).trim();
    if (rawSearch) {
      const escaped = escapeRegex(rawSearch);
      // Flexible regex allowing optional spaces/dashes/underscores between words, and between letter-digit boundaries
      const flexiblePattern = escaped
        .replace(/\s+/g, '[\\s\\-_]*')
        .replace(/([a-zA-Z])(?=\d)|(\d)(?=[a-zA-Z])/g, '$&[\\s\\-_]*');

      const orConditions: any[] = [
        { name: { $regex: flexiblePattern, $options: 'i' } },
        { label: { $regex: flexiblePattern, $options: 'i' } },
        { notes: { $regex: flexiblePattern, $options: 'i' } },
      ];

      if (flexiblePattern !== escaped) {
        orConditions.push(
          { name: { $regex: escaped, $options: 'i' } },
          { label: { $regex: escaped, $options: 'i' } },
          { notes: { $regex: escaped, $options: 'i' } }
        );
      }

      const digitsOnly = rawSearch.replace(/[^0-9]/g, '');
      if (digitsOnly.length > 0) {
        orConditions.push({ phone_number: { $regex: digitsOnly } });
        if (digitsOnly.startsWith('0') && digitsOnly.length > 3) {
          orConditions.push({ phone_number: { $regex: digitsOnly.replace(/^0+/, '') } });
        }
      } else {
        orConditions.push({ phone_number: { $regex: escaped, $options: 'i' } });
      }

      filter.$or = orConditions;
    }
  }

  const isAll = String(all).toLowerCase() === 'true';
  const hasPagination = !isAll && (page !== undefined || page_size !== undefined);

  if (hasPagination) {
    const pageNum = Math.max(1, parseInt(String(page || '1'), 10) || 1);
    const pageSizeNum = Math.max(1, parseInt(String(page_size || '20'), 10) || 20);
    const skip = (pageNum - 1) * pageSizeNum;

    const [total, customers] = await Promise.all([
      Customer.countDocuments(filter),
      Customer.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSizeNum),
    ]);

    const hasNext = skip + customers.length < total;
    const hasPrev = pageNum > 1;

    return res.json({
      count: total,
      next: hasNext ? `?page=${pageNum + 1}&page_size=${pageSizeNum}` : null,
      previous: hasPrev ? `?page=${pageNum - 1}&page_size=${pageSizeNum}` : null,
      page_size: pageSizeNum,
      results: customers.map(formatCustomer),
    });
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

  const cleanPhone = String(phone_number).replace(/[^0-9]/g, '');
  if (!cleanPhone) {
    return res.status(400).json({ error: 'Valid phone_number is required' });
  }

  const customer = await Customer.findOneAndUpdate(
    { merchant: req.user?._id, phone_number: cleanPhone },
    { name: name ? String(name).trim() : '', label: label ? String(label).trim() : '', notes, custom_data },
    { upsert: true, new: true }
  );

  return res.status(201).json(formatCustomer(customer));
};

router.post('/customers', createCustomer);

const importCustomers = async (req: AuthRequest, res: Response) => {
  try {
    const customers = req.body.customers || req.body;
    if (!Array.isArray(customers)) {
      return res.status(400).json({ error: 'customers array is required' });
    }

    const validCustomers = customers.filter((c) => {
      const p = c.phone_number || c.phone || c['Phone Number'] || c['Phone'];
      return p !== undefined && p !== null && String(p).trim() !== '';
    });
    const phones = validCustomers
      .map((c) => String(c.phone_number || c.phone || c['Phone Number'] || c['Phone']).replace(/[^0-9]/g, ''))
      .filter(Boolean);

    const existingCustomers = await Customer.find({ merchant: req.user?._id, phone_number: { $in: phones } });
    const existingMap = new Map(existingCustomers.map((c) => [c.phone_number, c]));

    const operations = [];

    for (const c of validCustomers) {
      const rawPhone = c.phone_number || c.phone || c['Phone Number'] || c['Phone'];
      const cleanPhone = String(rawPhone).replace(/[^0-9]/g, '');
      if (!cleanPhone) continue;

      const existing = existingMap.get(cleanPhone);
      const rawLabel = c.label || c.Label || c['TAG'] || c['tag'] || '';
      let finalLabel = rawLabel ? String(rawLabel).trim() : '';

      if (existing && existing.label) {
        const existingLabels = existing.label.split(',').map((s) => s.trim()).filter(Boolean);
        const newLabels = finalLabel ? finalLabel.split(',').map((s) => s.trim()).filter(Boolean) : [];
        finalLabel = Array.from(new Set([...existingLabels, ...newLabels])).join(', ');
      }

      const setFields: Record<string, any> = {
        label: finalLabel,
      };
      const setOnInsertFields: Record<string, any> = {};

      const rawName = c.name || c.Name || c['Full Name'] || '';
      if (rawName && String(rawName).trim()) {
        setFields.name = String(rawName).trim();
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
  } catch (err: any) {
    console.error('Error importing customers:', err);
    return res.status(500).json({ error: err.message || 'Failed to import customers' });
  }
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

