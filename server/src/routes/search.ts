import { Router } from 'express';
import { globalSearch } from '../controllers/searchController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, globalSearch);

export default router;
