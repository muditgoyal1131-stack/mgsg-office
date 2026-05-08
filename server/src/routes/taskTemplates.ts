import { Router } from 'express';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '../controllers/taskTemplateController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getTemplates);
router.post('/', authenticate, createTemplate);
router.put('/:id', authenticate, updateTemplate);
router.delete('/:id', authenticate, deleteTemplate);

export default router;
