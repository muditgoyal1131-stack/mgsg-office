import { Router } from 'express';
import { authenticate, requireAdmin, requireHR } from '../middleware/auth';
import {
  getProfitCentres, createProfitCentre, updateProfitCentre, deleteProfitCentre,
  assignPartnerToProfitCentre, removePartnerFromProfitCentre,
  getCategories, createCategory, updateCategory, deleteCategory,
  getBillingEntities, createBillingEntity, updateBillingEntity, deleteBillingEntity,
} from '../controllers/masterController';

const router = Router();

router.use(authenticate);

router.get('/profit-centres', getProfitCentres);
router.post('/profit-centres', requireAdmin, createProfitCentre);
router.put('/profit-centres/:id', requireAdmin, updateProfitCentre);
router.delete('/profit-centres/:id', requireAdmin, deleteProfitCentre);
// Partner access management for profit centres (Admin + HR)
router.post('/profit-centres/:id/partners', requireHR, assignPartnerToProfitCentre);
router.delete('/profit-centres/:id/partners/:staffId', requireHR, removePartnerFromProfitCentre);

router.get('/categories', getCategories);
router.post('/categories', requireAdmin, createCategory);
router.put('/categories/:id', requireAdmin, updateCategory);
router.delete('/categories/:id', requireAdmin, deleteCategory);

router.get('/billing-entities', getBillingEntities);
router.post('/billing-entities', requireAdmin, createBillingEntity);
router.put('/billing-entities/:id', requireAdmin, updateBillingEntity);
router.delete('/billing-entities/:id', requireAdmin, deleteBillingEntity);

export default router;
