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

  // ── Location fields ──────────────────────────────────────────────────────────
  address: { type: String, trim: true },          // Full display address
  city: { type: String, trim: true },
  locality: { type: String, trim: true },         // Neighbourhood / area
  state: { type: String, trim: true },
  pincode: { type: String, trim: true },
  latitude: { type: Number },
  longitude: { type: Number },

  // ── Listing / discovery fields ───────────────────────────────────────────────
  description: { type: String },                  // Public description for listing page
  bedrooms: { type: Number, min: 0 },
  bathrooms: { type: Number, min: 0 },
  areaSqFt: { type: Number, min: 0 },
  amenities: [{ type: String, trim: true }],      // e.g. ['Parking', 'WiFi', 'Gym']
  images: [{ type: String }],                     // Array of image file paths
  isFeatured: { type: Boolean, default: false },  // Show on homepage featured section
  isAvailableForListing: { type: Boolean, default: true }, // Show in public search

  history: [{ type: mongoose.Schema.Types.ObjectId, ref: 'History' }],
}, { timestamps: true });

// Index for location-based queries and search
ApartmentSchema.index({ city: 1, status: 1 });
ApartmentSchema.index({ locality: 1 });
ApartmentSchema.index({ monthlyRent: 1 });
ApartmentSchema.index({ bedrooms: 1 });

module.exports = mongoose.model('Apartment', ApartmentSchema);
