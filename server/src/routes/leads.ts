import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getLeads, getLead, createLead, updateLead, deleteLead,
  addNote, deleteNote, convertToClient, getLeadStats,
} from '../controllers/leadController';

const router = Router();
router.use(authenticate);

// Specific named paths BEFORE /:id to avoid shadowing
router.get('/stats',            getLeadStats);
router.delete('/notes/:noteId', deleteNote);

router.get('/',    getLeads);
router.post('/',   createLead);
router.get('/:id', getLead);
router.put('/:id', updateLead);
router.delete('/:id', deleteLead);
router.post('/:id/notes',   addNote);
router.post('/:id/convert', convertToClient);

export default router;
