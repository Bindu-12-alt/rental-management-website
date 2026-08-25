const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getApartments,
  getApartmentById,
  createApartment,
  updateApartment,
  deleteApartment,
} = require('../controllers/apartmentController');
const router = express.Router();

router.get('/', protect, getApartments);
router.get('/:id', protect, getApartmentById);
router.post('/', protect, createApartment);
router.put('/:id', protect, updateApartment);
router.delete('/:id', protect, deleteApartment);

module.exports = router;
