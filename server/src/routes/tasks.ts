import { Router } from 'express';
import {
  getAllTasks, getTask, createTask, updateTask, deleteTask,
  addExpense, deleteExpense, bulkUpdateTasks,
  confirmArchive, freezeTask, unfreezeTask,
} from '../controllers/taskController';
import { getSubTasks, createSubTask } from '../controllers/subTaskController';
import { getTaskComments, createTaskComment, deleteTaskComment } from '../controllers/taskCommentController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getAllTasks);
router.post('/', authenticate, createTask);

// Specific named sub-paths MUST come before /:id to avoid being swallowed
router.post('/bulk-update', authenticate, bulkUpdateTasks);
router.delete('/expenses/:id', authenticate, deleteExpense);
router.delete('/comments/:commentId', authenticate, deleteTaskComment);
router.post('/:taskId/expenses', authenticate, addExpense);
router.post('/:id/confirm-archive', authenticate, confirmArchive);
router.post('/:id/freeze', authenticate, freezeTask);
router.post('/:id/unfreeze', authenticate, unfreezeTask);

// Sub-tasks nested under tasks
router.get('/:taskId/subtasks', authenticate, getSubTasks);
router.post('/:taskId/subtasks', authenticate, createSubTask);

// Comments nested under tasks
router.get('/:taskId/comments', authenticate, getTaskComments);
router.post('/:taskId/comments', authenticate, createTaskComment);

// Parameterised routes last
router.get('/:id', authenticate, getTask);
router.put('/:id', authenticate, updateTask);
router.delete('/:id', authenticate, deleteTask);

export default router;
