import express from 'express';
import { 
  getInvoices, 
  getInvoice, 
  createInvoice, 
  updateInvoice, 
  deleteInvoice,
  updatePaymentStatus 
} from '../controllers/invoiceController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getInvoices)
  .post(authorize('ADMIN', 'MANAGER'), createInvoice);

router.route('/:id')
  .get(getInvoice)
  .put(authorize('ADMIN', 'MANAGER'), updateInvoice)
  .delete(authorize('ADMIN'), deleteInvoice);

router.put('/:id/payment-status', authorize('ADMIN', 'MANAGER'), updatePaymentStatus);

export default router;