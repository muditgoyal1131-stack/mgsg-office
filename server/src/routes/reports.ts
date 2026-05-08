import { Router } from 'express';
import {
  getStaffUtilization, getWIPAging, getProfitability,
  getClientBillingHistory, getDashboardKPIs,
  getMonthlyRevenue, getClientFees, getStaffKPIs, getWIPReport,
  getBillingSummary, triggerDueAlerts,
} from '../controllers/reportsController';
import { authenticate } from '../middleware/auth';
import { runDueReminders } from '../services/reminderService';

const router = Router();

router.get('/kpis', authenticate, getDashboardKPIs);
router.get('/utilization', authenticate, getStaffUtilization);
router.get('/wip-aging', authenticate, getWIPAging);
router.get('/profitability', authenticate, getProfitability);
router.get('/client-billing', authenticate, getClientBillingHistory);
router.get('/monthly-revenue', authenticate, getMonthlyRevenue);
router.get('/client-fees', authenticate, getClientFees);
router.get('/staff-kpis', authenticate, getStaffKPIs);
router.get('/wip', authenticate, getWIPReport);
router.get('/billing-summary', authenticate, getBillingSummary);
router.post('/trigger-due-alerts', authenticate, triggerDueAlerts);
router.post('/send-due-reminders', authenticate, async (req, res) => {
  try {
    await runDueReminders();
    res.json({ message: 'Due-date reminder emails sent' });
  } catch {
    res.status(500).json({ message: 'Failed to send reminders' });
  }
});

export default router;
