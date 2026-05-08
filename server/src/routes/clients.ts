import { Router } from 'express';
import { getAllClients, createClient, updateClient, deleteClient } from '../controllers/clientController';
import { getClientGstins, createClientGstin, updateClientGstin, deleteClientGstin } from '../controllers/clientGstinController';
import {
  getClientDocuments, uploadClientDocument, deleteClientDocument, vaultUpload,
} from '../controllers/clientDocumentController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getAllClients);
router.post('/', authenticate, createClient);
router.put('/:id', authenticate, updateClient);
router.delete('/:id', authenticate, requireAdmin, deleteClient);

// GSTIN sub-routes
router.get('/:clientId/gstins', authenticate, getClientGstins);
router.post('/:clientId/gstins', authenticate, createClientGstin);
router.put('/:clientId/gstins/:id', authenticate, updateClientGstin);
router.delete('/:clientId/gstins/:id', authenticate, deleteClientGstin);

// Client Document Vault
router.get('/:clientId/vault', authenticate, getClientDocuments);
router.post('/:clientId/vault', authenticate, vaultUpload.single('file'), uploadClientDocument);
router.delete('/vault/:docId', authenticate, deleteClientDocument);

export default router;
