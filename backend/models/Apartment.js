const mongoose = require('mongoose');

const ApartmentSchema = new mongoose.Schema({
  apartmentNumber: { type: String, required: true, trim: true },
  buildingDetails: { type: String, required: true, trim: true },
  floorDetails: { type: String, required: true, trim: true },
  apartmentType: { type: String, required: true, trim: true },
  monthlyRent: { type: Number, required: true, min: 0 },
  securityDeposit: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['Empty', 'Occupied', 'Vacating Soon'], default: 'Empty' },
  currentTenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
  rentalStartDate: { type: Date },
  rentalPolicies: { type: String },
  agreementDetails: { type: String },
  history: [{ type: mongoose.Schema.Types.ObjectId, ref: 'History' }],
}, { timestamps: true });

module.exports = mongoose.model('Apartment', ApartmentSchema);
