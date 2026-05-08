import { Router } from 'express';
import { login, updatePassword, getProfile } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/login', login);
router.get('/profile', authenticate, getProfile);
router.put('/password', authenticate, updatePassword);

export default router;
