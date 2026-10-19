import express from 'express';
import {
  getOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
  getOrderStats
} from '../controllers/orderController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

// Stats route before /:id
router.get('/stats', authorize('ADMIN', 'MANAGER'), getOrderStats);

router.route('/')
  .get(getOrders)
  .post(createOrder);

router.route('/:id')
  .get(getOrder)
  .put(authorize('ADMIN', 'MANAGER'), updateOrder)
  .delete(authorize('ADMIN'), deleteOrder);

export default router;