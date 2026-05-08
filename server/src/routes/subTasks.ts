import { Router } from 'express';
import {
  getAllSubTasks, updateSubTask, closeSubTask, deleteSubTask,
} from '../controllers/subTaskController';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/subtasks — all sub-tasks the user can see
router.get('/', authenticate, getAllSubTasks);

// Individual sub-task operations — /api/subtasks/:id
router.put('/:id/close', authenticate, closeSubTask);
router.put('/:id', authenticate, updateSubTask);
router.delete('/:id', authenticate, deleteSubTask);

export default router;
