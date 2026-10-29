import { Router } from 'express';
import { imageUploadController } from '../controllers/image-upload.controller.js';
import { receiveImage } from '../middleware/image-upload.js';
import { requireAdmin } from '../middleware/require-admin.js';

export const adminUploadRouter = Router();

adminUploadRouter.post('/', requireAdmin, receiveImage, imageUploadController);
