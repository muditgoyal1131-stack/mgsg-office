/**
 * paths.ts — Centralised file-system path config
 *
 * On Railway: set UPLOAD_DIR=/data/uploads  (mounted Volume)
 * Locally:    defaults to  <repo>/server/uploads/
 */
import path from 'path';

export const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

export const VAULT_DIR = path.join(UPLOAD_DIR, 'client-vault');
