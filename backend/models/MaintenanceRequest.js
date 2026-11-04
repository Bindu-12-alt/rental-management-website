const mongoose = require('mongoose');

const MaintenanceRequestSchema = new mongoose.Schema({
  apartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment', required: true },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ['Plumbing', 'Electrical', 'Cleaning', 'Security', 'Appliance', 'Structural', 'HVAC', 'Other'],
    default: 'Other',
  },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  requestDate: { type: Date, required: true },
  status: { type: String, enum: ['Pending', 'In Progress', 'Resolved', 'Closed', 'Rejected'], default: 'Pending' },
  assignedTo: { type: String, trim: true },      // Name/contact of technician
  adminComments: { type: String },
  resolutionDetails: { type: String },
  completedDate: { type: Date },
  // Photos uploaded by tenant (stored as file paths)
  photos: [{ type: String }],
}, { timestamps: true });

MaintenanceRequestSchema.index({ tenant: 1, status: 1 });
MaintenanceRequestSchema.index({ apartment: 1, status: 1 });

module.exports = mongoose.model('MaintenanceRequest', MaintenanceRequestSchema);
