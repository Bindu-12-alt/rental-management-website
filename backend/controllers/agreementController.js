const RentalAgreement = require('../models/RentalAgreement');
const Tenant = require('../models/Tenant');
const Apartment = require('../models/Apartment');
const History = require('../models/History');
const { createNotification } = require('../services/notificationService');

function daysBetween(a, b) {
  return Math.ceil((b - a) / (1000 * 60 * 60 * 24));
}

async function getAgreements(req, res, next) {
  try {
    const { search, status, tenant, apartment } = req.query;
    const query = {};

    if (search) query.agreementId = new RegExp(search, 'i');
    if (status) query.status = status;
    if (tenant) query.tenant = tenant;
    if (apartment) query.apartment = apartment;

    const agreements = await RentalAgreement.find(query)
      .populate('tenant', 'fullName email')
      .populate('apartment', 'apartmentNumber')
      .sort({ startDate: -1 });
    res.json({ success: true, data: agreements });
  } catch (error) {
    next(error);
  }
}

async function getAgreementById(req, res, next) {
  try {
    const agreement = await RentalAgreement.findById(req.params.id)
      .populate('tenant', 'fullName email')
      .populate('apartment', 'apartmentNumber');
    if (!agreement) {
      const err = new Error('Agreement not found');
      err.statusCode = 404;
      return next(err);
    }
    res.json({ success: true, data: agreement });
  } catch (error) {
    next(error);
  }
}

async function createAgreement(req, res, next) {
  try {
    const { agreementId, tenant, apartment, startDate, expiryDate, rentalCycle, monthlyRent, agreementDetails } = req.body;
    if (!agreementId || !tenant || !apartment || !startDate || !expiryDate || !rentalCycle || monthlyRent == null) {
      const err = new Error('Agreement ID, tenant, apartment, dates, rental cycle, and monthly rent are required');
      err.statusCode = 400;
      return next(err);
    }
    if (monthlyRent < 0) {
      const err = new Error('Monthly rent must be a positive number');
      err.statusCode = 400;
      return next(err);
    }

    const apt = await Apartment.findById(apartment);
    if (!apt) {
      const err = new Error('Apartment not found');
      err.statusCode = 404;
      return next(err);
    }
    if (apt.status === 'Occupied' && String(apt.currentTenant) !== String(tenant)) {
      const err = new Error(`Apartment ${apt.apartmentNumber} is already occupied`);
      err.statusCode = 400;
      return next(err);
    }

    const agreement = await RentalAgreement.create({
      agreementId,
      tenant,
      apartment,
      startDate: new Date(startDate),
      expiryDate: new Date(expiryDate),
      rentalCycle,
      monthlyRent,
      agreementDetails,
      status: 'Active',
    });

    apt.currentTenant = tenant;
    apt.status = 'Occupied';
    apt.rentalStartDate = new Date(startDate);
    await apt.save();

    await History.create({
      type: 'Agreement Created',
      title: `Agreement ${agreementId} created`,
      description: `Created agreement for apartment ${apt.apartmentNumber}`,
      tenant,
      apartment,
      relatedAgreement: agreement._id,
    });

    const now = new Date();
    const daysToExpiry = daysBetween(now, agreement.expiryDate);
    if (daysToExpiry <= 30) {
      agreement.status = 'Expiring Soon';
      await agreement.save();
      await createNotification({
        type: 'Agreement Renewal',
        message: `Agreement ${agreementId} is expiring in ${daysToExpiry} days`,
        relatedTenant: tenant,
        relatedApartment: apartment,
        priority: 'High',
      });
    }

    res.status(201).json({ success: true, data: agreement });
  } catch (error) {
    next(error);
  }
}

async function updateAgreement(req, res, next) {
  try {
    const agreement = await RentalAgreement.findById(req.params.id);
    if (!agreement) {
      const err = new Error('Agreement not found');
      err.statusCode = 404;
      return next(err);
    }

    const { expiryDate, rentalCycle, monthlyRent, status, agreementDetails } = req.body;
    if (monthlyRent != null && monthlyRent < 0) {
      const err = new Error('Monthly rent must be positive');
      err.statusCode = 400;
      return next(err);
    }

    Object.assign(agreement, {
      expiryDate: expiryDate ? new Date(expiryDate) : agreement.expiryDate,
      rentalCycle: rentalCycle ?? agreement.rentalCycle,
      monthlyRent: monthlyRent ?? agreement.monthlyRent,
      status: status ?? agreement.status,
      agreementDetails: agreementDetails ?? agreement.agreementDetails,
    });

    await agreement.save();
    await History.create({
      type: 'Agreement Updated',
      title: `Agreement ${agreement.agreementId} updated`,
      description: 'Agreement details updated',
      tenant: agreement.tenant,
      apartment: agreement.apartment,
      relatedAgreement: agreement._id,
    });
    res.json({ success: true, data: agreement });
  } catch (error) {
    next(error);
  }
}

async function renewAgreement(req, res, next) {
  try {
    const agreement = await RentalAgreement.findById(req.params.id);
    if (!agreement) {
      const err = new Error('Agreement not found');
      err.statusCode = 404;
      return next(err);
    }
    if (agreement.status !== 'Active' && agreement.status !== 'Expiring Soon') {
      const err = new Error('Only active agreements can be renewed');
      err.statusCode = 400;
      return next(err);
    }

    const { newExpiryDate, newMonthlyRent, newRentalCycle } = req.body;
    if (!newExpiryDate || !newRentalCycle || newMonthlyRent == null) {
      const err = new Error('New expiry date, rental cycle, and monthly rent are required for renewal');
      err.statusCode = 400;
      return next(err);
    }
    if (newMonthlyRent < 0) {
      const err = new Error('Monthly rent must be positive');
      err.statusCode = 400;
      return next(err);
    }

    const renewedAgreement = await RentalAgreement.create({
      agreementId: `${agreement.agreementId}-R${Date.now()}`,
      tenant: agreement.tenant,
      apartment: agreement.apartment,
      startDate: agreement.expiryDate,
      expiryDate: new Date(newExpiryDate),
      rentalCycle: newRentalCycle,
      monthlyRent: newMonthlyRent,
      agreementDetails: agreement.agreementDetails,
      status: 'Renewed',
      renewals: [],
    });

    agreement.status = 'Renewed';
    agreement.renewals.push(renewedAgreement._id);
    await agreement.save();

    await History.create({
      type: 'Agreement Renewed',
      title: `Agreement ${agreement.agreementId} renewed`,
      description: `Renewed contract through ${newExpiryDate}`,
      tenant: agreement.tenant,
      apartment: agreement.apartment,
      relatedAgreement: renewedAgreement._id,
    });

    await createNotification({
      type: 'Agreement Renewed',
      message: `Agreement ${agreement.agreementId} renewed`,
      relatedTenant: agreement.tenant,
      relatedApartment: agreement.apartment,
      priority: 'Medium',
    });

    res.status(201).json({ success: true, data: renewedAgreement });
  } catch (error) {
    next(error);
  }
}

module.exports = { getAgreements, getAgreementById, createAgreement, updateAgreement, renewAgreement };