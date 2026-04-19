import { Router } from 'express';
import {
  createTransaction,
  deleteTransaction,
  listTransactions
} from '../controllers/transactionController.js';

const router = Router();

router.get('/', listTransactions);
router.post('/', createTransaction);
router.delete('/:id', deleteTransaction);

export default router;
