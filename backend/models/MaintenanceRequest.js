const mongoose = require('mongoose');

const MaintenanceRequestSchema = new mongoose.Schema({
  apartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment', required: true },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  requestDate: { type: Date, required: true },
  status: { type: String, enum: ['Pending', 'In Progress', 'Completed', 'Rejected'], default: 'Pending' },
  adminComments: { type: String },
  completedDate: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('MaintenanceRequest', MaintenanceRequestSchema);
