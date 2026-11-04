const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getApartments, getApartmentById, createApartment, updateApartment, deleteApartment,
  getPublicApartments, getPublicApartmentById,
} = require('../controllers/apartmentController');
const router = express.Router();

// Public routes (no auth required — for homepage/search)
router.get('/public', getPublicApartments);
router.get('/public/:id', getPublicApartmentById);

// Admin protected routes
router.get('/', protect, getApartments);
router.get('/:id', protect, getApartmentById);
router.post('/', protect, createApartment);
router.put('/:id', protect, updateApartment);
router.delete('/:id', protect, deleteApartment);

module.exports = router;
