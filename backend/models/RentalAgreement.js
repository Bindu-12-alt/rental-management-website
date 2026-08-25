const mongoose = require('mongoose');

const RentalAgreementSchema = new mongoose.Schema({
  agreementId: { type: String, required: true, unique: true, trim: true },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  apartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment', required: true },
  startDate: { type: Date, required: true },
  expiryDate: { type: Date, required: true },
  rentalCycle: { type: String, required: true, trim: true },
  monthlyRent: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['Active', 'Expiring Soon', 'Expired', 'Ending', 'Renewed', 'Terminated'], default: 'Active' },
  agreementDetails: { type: String },
  renewals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RentalAgreement' }],
}, { timestamps: true });

module.exports = mongoose.model('RentalAgreement', RentalAgreementSchema);
