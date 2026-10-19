import express from 'express';
import { 
  getEmployees, 
  getEmployee, 
  createEmployee, 
  updateEmployee, 
  deleteEmployee 
} from '../controllers/employeeController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getEmployees)
  .post(authorize('ADMIN', 'MANAGER'), createEmployee);

router.route('/:id')
  .get(getEmployee)
  .put(authorize('ADMIN', 'MANAGER'), updateEmployee)
  .delete(authorize('ADMIN'), deleteEmployee);

export default router;