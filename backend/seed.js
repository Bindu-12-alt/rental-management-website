const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const Admin = require('./models/Admin');
const Apartment = require('./models/Apartment');
const Tenant = require('./models/Tenant');
const RentalAgreement = require('./models/RentalAgreement');
const Payment = require('./models/Payment');
const SecurityDeposit = require('./models/SecurityDeposit');
const VacatingRequest = require('./models/VacatingRequest');
const Notification = require('./models/Notification');
const MaintenanceRequest = require('./models/MaintenanceRequest');
const History = require('./models/History');

dotenv.config();

async function seed() {
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  await Promise.all([
    Admin.deleteMany(),
    Apartment.deleteMany(),
    Tenant.deleteMany(),
    RentalAgreement.deleteMany(),
    Payment.deleteMany(),
    SecurityDeposit.deleteMany(),
    VacatingRequest.deleteMany(),
    Notification.deleteMany(),
    MaintenanceRequest.deleteMany(),
    History.deleteMany(),
  ]);

  const adminPassword = await bcrypt.hash('SRI@12', 10);
  const admin = await Admin.create({ name: 'RentEase Admin', email: 'bindusrikavuri@gmail.com', password: adminPassword });

  const apartments = await Apartment.create([
    { apartmentNumber: '101', buildingDetails: 'Blue Tower', floorDetails: 'Floor 1', apartmentType: 'Studio', monthlyRent: 1200, securityDeposit: 1200, status: 'Occupied' },
    { apartmentNumber: '102', buildingDetails: 'Blue Tower', floorDetails: 'Floor 1', apartmentType: '1BHK', monthlyRent: 1600, securityDeposit: 1600, status: 'Occupied' },
    { apartmentNumber: '103', buildingDetails: 'Blue Tower', floorDetails: 'Floor 1', apartmentType: '2BHK', monthlyRent: 1900, securityDeposit: 1900, status: 'Empty' },
    { apartmentNumber: '201', buildingDetails: 'Blue Tower', floorDetails: 'Floor 2', apartmentType: '1BHK', monthlyRent: 1550, securityDeposit: 1550, status: 'Vacating Soon' },
    { apartmentNumber: '202', buildingDetails: 'Blue Tower', floorDetails: 'Floor 2', apartmentType: '2BHK', monthlyRent: 2100, securityDeposit: 2100, status: 'Occupied' },
    { apartmentNumber: '301', buildingDetails: 'Skyline View', floorDetails: 'Floor 3', apartmentType: 'Studio', monthlyRent: 1300, securityDeposit: 1300, status: 'Empty' },
    { apartmentNumber: '302', buildingDetails: 'Skyline View', floorDetails: 'Floor 3', apartmentType: '1BHK', monthlyRent: 1700, securityDeposit: 1700, status: 'Empty' },
    { apartmentNumber: '303', buildingDetails: 'Skyline View', floorDetails: 'Floor 3', apartmentType: '2BHK', monthlyRent: 2200, securityDeposit: 2200, status: 'Occupied' },
    { apartmentNumber: '401', buildingDetails: 'Skyline View', floorDetails: 'Floor 4', apartmentType: 'Studio', monthlyRent: 1250, securityDeposit: 1250, status: 'Empty' },
    { apartmentNumber: '402', buildingDetails: 'Skyline View', floorDetails: 'Floor 4', apartmentType: '2BHK', monthlyRent: 2300, securityDeposit: 2300, status: 'Occupied' },
  ]);

  const tenants = await Tenant.create([
    { fullName: 'Alicia Rivers', email: 'alicia@example.com', phone: '+15551234567', address: '415 Maple Street', identification: 'ID-0291', emergencyContact: 'George Rivers - +15559876543', apartment: apartments[0]._id, rentalStartDate: new Date('2024-10-01'), status: 'Active' },
    { fullName: 'Marcus Lee', email: 'marcus@example.com', phone: '+15557654321', address: '102 Pine Avenue', identification: 'ID-1324', emergencyContact: 'Hannah Lee - +15550987654', apartment: apartments[1]._id, rentalStartDate: new Date('2024-09-15'), status: 'Active' },
    { fullName: 'Priya Shah', email: 'priya@example.com', phone: '+15559871234', address: '220 Cedar Drive', identification: 'ID-4587', emergencyContact: 'Rohan Shah - +15553456789', apartment: apartments[4]._id, rentalStartDate: new Date('2024-11-01'), status: 'Active' },
    { fullName: 'Ethan Wells', email: 'ethan@example.com', phone: '+15552345678', address: '88 Oak Lane', identification: 'ID-6682', emergencyContact: 'Sara Wells - +15554567890', apartment: apartments[7]._id, rentalStartDate: new Date('2024-10-10'), status: 'Active' },
    { fullName: 'Jasmine Torres', email: 'jasmine@example.com', phone: '+15556789012', address: '555 Birch Road', identification: 'ID-9912', emergencyContact: 'Lucas Torres - +15551234987', apartment: null, status: 'Former' },
  ]);

  await Apartment.updateOne({ _id: apartments[0]._id }, { currentTenant: tenants[0]._id });
  await Apartment.updateOne({ _id: apartments[1]._id }, { currentTenant: tenants[1]._id });
  await Apartment.updateOne({ _id: apartments[4]._id }, { currentTenant: tenants[2]._id });
  await Apartment.updateOne({ _id: apartments[7]._id }, { currentTenant: tenants[3]._id });

  const agreements = await RentalAgreement.create([
    { agreementId: 'AGR-1001', tenant: tenants[0]._id, apartment: apartments[0]._id, startDate: new Date('2024-10-01'), expiryDate: new Date('2025-09-30'), rentalCycle: 'Monthly', monthlyRent: 1200, status: 'Active', agreementDetails: 'Standard 12-month lease.' },
    { agreementId: 'AGR-1002', tenant: tenants[1]._id, apartment: apartments[1]._id, startDate: new Date('2024-09-15'), expiryDate: new Date('2025-08-15'), rentalCycle: 'Monthly', monthlyRent: 1600, status: 'Expiring Soon', agreementDetails: '12-month agreement with early renewal option.' },
    { agreementId: 'AGR-1003', tenant: tenants[2]._id, apartment: apartments[4]._id, startDate: new Date('2024-11-01'), expiryDate: new Date('2025-10-31'), rentalCycle: 'Monthly', monthlyRent: 2100, status: 'Active', agreementDetails: 'Includes utilities package.' },
    { agreementId: 'AGR-1004', tenant: tenants[3]._id, apartment: apartments[7]._id, startDate: new Date('2024-10-10'), expiryDate: new Date('2025-10-09'), rentalCycle: 'Monthly', monthlyRent: 2200, status: 'Active', agreementDetails: '2BHK premium unit.' },
  ]);

  const payments = await Payment.create([
    { tenant: tenants[0]._id, apartment: apartments[0]._id, amount: 1200, paymentDate: new Date('2025-03-01'), dueDate: new Date('2025-03-05'), method: 'Bank Transfer', transactionId: 'TXN1001', status: 'Paid' },
    { tenant: tenants[1]._id, apartment: apartments[1]._id, amount: 1600, paymentDate: new Date('2025-04-05'), dueDate: new Date('2025-04-01'), method: 'Credit Card', transactionId: 'TXN1002', status: 'Overdue' },
    { tenant: tenants[2]._id, apartment: apartments[4]._id, amount: 2100, paymentDate: new Date('2025-04-01'), dueDate: new Date('2025-04-05'), method: 'Bank Transfer', transactionId: 'TXN1003', status: 'Paid' },
    { tenant: tenants[3]._id, apartment: apartments[7]._id, amount: 2200, paymentDate: new Date('2025-04-06'), dueDate: new Date('2025-04-05'), method: 'Debit Card', transactionId: 'TXN1004', status: 'Overdue' },
  ]);

  const deposits = await SecurityDeposit.create([
    { tenant: tenants[0]._id, apartment: apartments[0]._id, amount: 1200, paidDate: new Date('2024-10-01'), paymentStatus: 'Paid', refundStatus: 'Pending', conditionDetails: 'Move-in condition standard.' },
    { tenant: tenants[1]._id, apartment: apartments[1]._id, amount: 1600, paidDate: new Date('2024-09-15'), paymentStatus: 'Paid', refundStatus: 'Pending', conditionDetails: 'Move-in condition good.' },
    { tenant: tenants[2]._id, apartment: apartments[4]._id, amount: 2100, paidDate: new Date('2024-11-01'), paymentStatus: 'Paid', refundStatus: 'Pending', conditionDetails: 'Move-in condition good.' },
  ]);

  const vacatingRequests = await VacatingRequest.create([
    { tenant: tenants[2]._id, apartment: apartments[4]._id, requestDate: new Date('2025-05-01'), expectedVacatingDate: new Date('2025-07-01'), noticePeriodDays: 61, status: 'Approved', adminComments: 'Approved with final inspection scheduled.', earliestValidDate: new Date('2025-06-30') },
  ]);

  const maintenanceRequests = await MaintenanceRequest.create([
    { apartment: apartments[0]._id, tenant: tenants[0]._id, title: 'Leaky Faucet', description: 'Kitchen faucet drips constantly.', priority: 'High', requestDate: new Date('2025-03-15'), status: 'Completed', adminComments: 'Replaced faucet cartridge.', completedDate: new Date('2025-03-17') },
    { apartment: apartments[4]._id, tenant: tenants[2]._id, title: 'Heating not working', description: 'Heating turned off in living area.', priority: 'Medium', requestDate: new Date('2025-04-05'), status: 'Pending' },
  ]);

  const notifications = await Notification.create([
    { type: 'Overdue Payment', message: 'Rent payment overdue for apartment 102', relatedTenant: tenants[1]._id, relatedApartment: apartments[1]._id, priority: 'High' },
    { type: 'Agreement Renewal', message: 'Agreement AGR-1002 expiring soon', relatedTenant: tenants[1]._id, relatedApartment: apartments[1]._id, priority: 'High' },
    { type: 'Vacating Request', message: 'Vacating request submitted for apartment 202', relatedTenant: tenants[2]._id, relatedApartment: apartments[4]._id, priority: 'High' },
    { type: 'Maintenance Request', message: 'New maintenance request created for apartment 101', relatedTenant: tenants[0]._id, relatedApartment: apartments[0]._id, priority: 'Medium' },
  ]);

  await History.create([
    { type: 'Apartment History', title: 'Apartment 101 occupied', description: 'Tenant Alicia Rivers moved in', tenant: tenants[0]._id, apartment: apartments[0]._id },
    { type: 'Tenant History', title: 'Tenant created', description: 'Alicia Rivers active tenant', tenant: tenants[0]._id, apartment: apartments[0]._id },
    { type: 'Payment History', title: 'Payment recorded', description: 'TXN1001 recorded', tenant: tenants[0]._id, apartment: apartments[0]._id, relatedPayment: payments[0]._id },
    { type: 'Agreement History', title: 'Agreement created', description: 'AGR-1001 created for Alicia', tenant: tenants[0]._id, apartment: apartments[0]._id, relatedAgreement: agreements[0]._id },
  ]);

  console.log('Database seeded successfully');
  await mongoose.disconnect();
}

seed().catch((error) => {
  console.error('Seed error:', error);
  process.exit(1);
});