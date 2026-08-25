const Tenant = require('../models/Tenant');
const Apartment = require('../models/Apartment');
const History = require('../models/History');

async function getTenants(req, res, next) {
  try {
    const { search, status, apartment } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { fullName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { phone: new RegExp(search, 'i') },
        { address: new RegExp(search, 'i') },
      ];
    }

    if (status) query.status = status;
    if (apartment) query.apartment = apartment;

    const tenants = await Tenant.find(query)
      .populate('apartment', 'apartmentNumber buildingDetails floorDetails')
      .populate('history')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: tenants });
  } catch (error) {
    next(error);
  }
}

async function getTenantById(req, res, next) {
  try {
    const tenant = await Tenant.findById(req.params.id)
      .populate('apartment', 'apartmentNumber buildingDetails floorDetails monthlyRent securityDeposit status')
      .populate('history');
    if (!tenant) {
      const err = new Error('Tenant not found');
      err.statusCode = 404;
      return next(err);
    }
    res.json({ success: true, data: tenant });
  } catch (error) {
    next(error);
  }
}

async function createTenant(req, res, next) {
  try {
    const {
      fullName,
      email,
      phone,
      address,
      identification,
      emergencyContact,
      apartment,
      rentalStartDate,
      status,
    } = req.body;

    if (!fullName || !email || !phone || !address) {
      const err = new Error('Full name, email, phone, and address are required');
      err.statusCode = 400;
      return next(err);
    }

    const existing = await Tenant.findOne({ email });
    if (existing) {
      const err = new Error('Tenant with this email already exists');
      err.statusCode = 400;
      return next(err);
    }

    if (apartment) {
      const apt = await Apartment.findById(apartment);
      if (!apt) {
        const err = new Error('Selected apartment does not exist');
        err.statusCode = 400;
        return next(err);
      }
      if (apt.status === 'Occupied' && apt.currentTenant) {
        const err = new Error(`Apartment ${apt.apartmentNumber} is already occupied`);
        err.statusCode = 400;
        return next(err);
      }
    }

    const tenant = await Tenant.create({
      fullName,
      email,
      phone,
      address,
      identification,
      emergencyContact,
      apartment: apartment || null,
      rentalStartDate: rentalStartDate || null,
      status: status || 'Active',
    });

    if (apartment) {
      const apt = await Apartment.findById(apartment);
      apt.currentTenant = tenant._id;
      apt.status = 'Occupied';
      apt.rentalStartDate = rentalStartDate || new Date();
      await apt.save();
    }

    await History.create({
      type: 'Tenant Created',
      title: `Tenant ${fullName} added`,
      description: `Added tenant ${fullName}`,
      tenant: tenant._id,
      apartment,
    });

    res.status(201).json({ success: true, data: tenant });
  } catch (error) {
    next(error);
  }
}

async function updateTenant(req, res, next) {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      const err = new Error('Tenant not found');
      err.statusCode = 404;
      return next(err);
    }

    const {
      fullName,
      email,
      phone,
      address,
      identification,
      emergencyContact,
      apartment,
      rentalStartDate,
      status,
    } = req.body;

    if (email && email !== tenant.email) {
      const emailTaken = await Tenant.findOne({ email });
      if (emailTaken) {
        const err = new Error('Email is already used by another tenant');
        err.statusCode = 400;
        return next(err);
      }
    }

    if (apartment && apartment !== String(tenant.apartment)) {
      const apt = await Apartment.findById(apartment);
      if (!apt) {
        const err = new Error('Selected apartment does not exist');
        err.statusCode = 400;
        return next(err);
      }
      if (apt.status === 'Occupied' && String(apt.currentTenant) !== String(tenant._id)) {
        const err = new Error(`Apartment ${apt.apartmentNumber} is already occupied`);
        err.statusCode = 400;
        return next(err);
      }

      if (tenant.apartment) {
        const oldApt = await Apartment.findById(tenant.apartment);
        if (oldApt) {
          oldApt.currentTenant = null;
          oldApt.status = 'Empty';
          oldApt.rentalStartDate = undefined;
          await oldApt.save();
        }
      }

      apt.currentTenant = tenant._id;
      apt.status = 'Occupied';
      apt.rentalStartDate = rentalStartDate || tenant.rentalStartDate || new Date();
      await apt.save();
    }

    Object.assign(tenant, {
      fullName: fullName ?? tenant.fullName,
      email: email ?? tenant.email,
      phone: phone ?? tenant.phone,
      address: address ?? tenant.address,
      identification: identification ?? tenant.identification,
      emergencyContact: emergencyContact ?? tenant.emergencyContact,
      apartment: apartment ?? tenant.apartment,
      rentalStartDate: rentalStartDate ?? tenant.rentalStartDate,
      status: status ?? tenant.status,
    });

    await tenant.save();

    await History.create({
      type: 'Tenant Updated',
      title: `Tenant ${tenant.fullName} updated`,
      description: 'Updated tenant details',
      tenant: tenant._id,
      apartment: tenant.apartment,
    });

    res.json({ success: true, data: tenant });
  } catch (error) {
    next(error);
  }
}

module.exports = { getTenants, getTenantById, createTenant, updateTenant };