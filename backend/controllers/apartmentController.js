const Apartment = require('../models/Apartment');
const Tenant = require('../models/Tenant');
const History = require('../models/History');

async function getApartments(req, res, next) {
  try {
    const { search, status, type, sortBy, order } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { apartmentNumber: new RegExp(search, 'i') },
        { buildingDetails: new RegExp(search, 'i') },
        { floorDetails: new RegExp(search, 'i') },
      ];
    }

    if (status) query.status = status;
    if (type) query.apartmentType = type;

    let sort = { createdAt: -1 };
    if (sortBy) {
      sort = { [sortBy]: order === 'asc' ? 1 : -1 };
    }

    const apartments = await Apartment.find(query)
      .populate('currentTenant', 'fullName email phone')
      .sort(sort);
    res.json({ success: true, data: apartments });
  } catch (error) {
    next(error);
  }
}

async function getApartmentById(req, res, next) {
  try {
    const apartment = await Apartment.findById(req.params.id)
      .populate('currentTenant', 'fullName email phone')
      .populate({ path: 'history', populate: { path: 'tenant', select: 'fullName' } });
    if (!apartment) {
      const err = new Error('Apartment not found');
      err.statusCode = 404;
      return next(err);
    }
    res.json({ success: true, data: apartment });
  } catch (error) {
    next(error);
  }
}

async function createApartment(req, res, next) {
  try {
    const {
      apartmentNumber,
      buildingDetails,
      floorDetails,
      apartmentType,
      monthlyRent,
      securityDeposit,
      status,
    } = req.body;

    if (!apartmentNumber || !buildingDetails || !floorDetails || !apartmentType) {
      const err = new Error('Apartment number, building, floor and type are required');
      err.statusCode = 400;
      return next(err);
    }

    if (monthlyRent < 0 || securityDeposit < 0) {
      const err = new Error('Rent and deposit must be positive numbers');
      err.statusCode = 400;
      return next(err);
    }

    const apartment = await Apartment.create({
      apartmentNumber,
      buildingDetails,
      floorDetails,
      apartmentType,
      monthlyRent,
      securityDeposit,
      status: status || 'Empty',
    });

    await History.create({
      type: 'Apartment Created',
      title: `Apartment ${apartmentNumber} added`,
      description: `Created apartment ${apartmentNumber}`,
      apartment: apartment._id,
    });

    res.status(201).json({ success: true, data: apartment });
  } catch (error) {
    next(error);
  }
}

async function updateApartment(req, res, next) {
  try {
    const apartment = await Apartment.findById(req.params.id);
    if (!apartment) {
      const err = new Error('Apartment not found');
      err.statusCode = 404;
      return next(err);
    }

    const {
      apartmentNumber,
      buildingDetails,
      floorDetails,
      apartmentType,
      monthlyRent,
      securityDeposit,
      status,
      rentalPolicies,
      agreementDetails,
    } = req.body;

    if (monthlyRent < 0 || securityDeposit < 0) {
      const err = new Error('Rent and deposit must be positive numbers');
      err.statusCode = 400;
      return next(err);
    }

    if (status === 'Occupied' && !apartment.currentTenant) {
      const err = new Error('Cannot mark apartment occupied without tenant');
      err.statusCode = 400;
      return next(err);
    }

    Object.assign(apartment, {
      apartmentNumber: apartmentNumber ?? apartment.apartmentNumber,
      buildingDetails: buildingDetails ?? apartment.buildingDetails,
      floorDetails: floorDetails ?? apartment.floorDetails,
      apartmentType: apartmentType ?? apartment.apartmentType,
      monthlyRent: monthlyRent ?? apartment.monthlyRent,
      securityDeposit: securityDeposit ?? apartment.securityDeposit,
      status: status ?? apartment.status,
      rentalPolicies: rentalPolicies ?? apartment.rentalPolicies,
      agreementDetails: agreementDetails ?? apartment.agreementDetails,
    });

    await apartment.save();

    await History.create({
      type: 'Apartment Updated',
      title: `Apartment ${apartment.apartmentNumber} updated`,
      description: 'Updated apartment details',
      apartment: apartment._id,
    });

    res.json({ success: true, data: apartment });
  } catch (error) {
    next(error);
  }
}

async function deleteApartment(req, res, next) {
  try {
    const apartment = await Apartment.findById(req.params.id);
    if (!apartment) {
      const err = new Error('Apartment not found');
      err.statusCode = 404;
      return next(err);
    }

    if (apartment.status !== 'Empty' || apartment.currentTenant) {
      const err = new Error('Cannot delete apartment while it has an active tenant or non-empty status');
      err.statusCode = 400;
      return next(err);
    }

    await apartment.remove();

    await History.create({
      type: 'Apartment Deleted',
      title: `Apartment ${apartment.apartmentNumber} deleted`,
      description: 'Deleted apartment record',
      apartment: apartment._id,
    });

    res.json({ success: true, message: 'Apartment deleted successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = { getApartments, getApartmentById, createApartment, updateApartment, deleteApartment };