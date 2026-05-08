import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { UPLOAD_DIR } from '../config/paths';
import { extractReceipt } from '../controllers/ocrController';
import { authenticate } from '../middleware/auth';

const upload = multer({
  dest: path.join(UPLOAD_DIR, 'ocr-temp'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const router = Router();

router.post('/extract', authenticate, upload.single('receipt'), extractReceipt);

export default router;
