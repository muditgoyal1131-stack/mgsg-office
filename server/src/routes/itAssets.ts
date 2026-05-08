import { Router } from 'express';
import { getITAssets, createITAsset, updateITAsset, deleteITAsset, assignITAsset, returnITAsset } from '../controllers/itAssetController';
import { authenticate } from '../middleware/auth';

const router = Router();
router.get('/', authenticate, getITAssets);
router.post('/', authenticate, createITAsset);
router.put('/:id', authenticate, updateITAsset);
router.delete('/:id', authenticate, deleteITAsset);
router.post('/:id/assign', authenticate, assignITAsset);
router.post('/:id/return', authenticate, returnITAsset);

export default router;
