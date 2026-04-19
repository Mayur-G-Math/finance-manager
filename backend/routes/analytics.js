import { Router } from 'express';
import {
  getAnalyticsOverview,
  getDashboardSummary,
  upsertBudget
} from '../controllers/analyticsController.js';

const router = Router();

router.get('/dashboard', getDashboardSummary);
router.get('/overview', getAnalyticsOverview);
router.post('/budgets', upsertBudget);

export default router;
