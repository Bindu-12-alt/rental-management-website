const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const apartmentRoutes = require('./routes/apartmentRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const depositRoutes = require('./routes/depositRoutes');
const agreementRoutes = require('./routes/agreementRoutes');
const vacatingRoutes = require('./routes/vacatingRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const maintenanceRoutes = require('./routes/maintenanceRoutes');
const historyRoutes = require('./routes/historyRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const { errorHandler } = require('./middleware/errorMiddleware');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const tenantPortalRoutes = require('./routes/tenantPortalRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/apartments', apartmentRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/agreements', agreementRoutes);
app.use('/api/vacating', vacatingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/tenant-portal', tenantPortalRoutes);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  });
