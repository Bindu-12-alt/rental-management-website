const Apartment = require('../models/Apartment');
const Tenant = require('../models/Tenant');
const History = require('../models/History');

function getPublicListingQuery() {
  return {
    status: { $in: ['Empty', 'Vacating Soon'] },
    $and: [
      {
        $or: [
          { isAvailableForListing: true },
          { isAvailableForListing: { $exists: false } },
        ],
      },
    ],
  };
}

function getLocationValidationError({ isPublic, address, city, latitude, longitude }) {
  if (isPublic && (!String(address || '').trim() || !String(city || '').trim())) {
    return 'Enter the full address and city before publishing this apartment.';
  }

  const hasLatitude = latitude !== undefined && latitude !== null && latitude !== '';
  const hasLongitude = longitude !== undefined && longitude !== null && longitude !== '';
  if (hasLatitude !== hasLongitude) {
    return 'Enter both map coordinates, or leave both blank.';
  }
  if (hasLatitude) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return 'Enter valid map coordinates (latitude -90 to 90 and longitude -180 to 180).';
    }
  }

  return null;
}

async function getApartments(req, res, next) {
  try {
    const { search, status, type, sortBy, order, city, locality, minRent, maxRent, bedrooms, featured } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { apartmentNumber: new RegExp(search, 'i') },
        { buildingDetails: new RegExp(search, 'i') },
        { floorDetails: new RegExp(search, 'i') },
        { city: new RegExp(search, 'i') },
        { locality: new RegExp(search, 'i') },
        { address: new RegExp(search, 'i') },
      ];
    }

    if (status) query.status = status;
    if (type) query.apartmentType = type;
    if (city) query.city = new RegExp(city, 'i');
    if (locality) query.locality = new RegExp(locality, 'i');
    if (bedrooms) query.bedrooms = Number(bedrooms);
    if (featured === 'true') query.isFeatured = true;

    if (minRent || maxRent) {
      query.monthlyRent = {};
      if (minRent) query.monthlyRent.$gte = Number(minRent);
      if (maxRent) query.monthlyRent.$lte = Number(maxRent);
    }

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

// Public endpoint — no auth required, returns listings data only
async function getPublicApartments(req, res, next) {
  try {
    const { search, city, locality, minRent, maxRent, bedrooms, type, sortBy, order } = req.query;
    const query = getPublicListingQuery();

    if (search) {
      query.$or = [
        { apartmentNumber: new RegExp(search, 'i') },
        { buildingDetails: new RegExp(search, 'i') },
        { city: new RegExp(search, 'i') },
        { locality: new RegExp(search, 'i') },
        { address: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
      ];
    }
    if (city) query.city = new RegExp(city, 'i');
    if (locality) query.locality = new RegExp(locality, 'i');
    if (bedrooms) query.bedrooms = Number(bedrooms);
    if (type) query.apartmentType = new RegExp(type, 'i');

    if (minRent || maxRent) {
      query.monthlyRent = {};
      if (minRent) query.monthlyRent.$gte = Number(minRent);
      if (maxRent) query.monthlyRent.$lte = Number(maxRent);
    }

    let sort = { isFeatured: -1, createdAt: -1 };
    if (sortBy === 'rent') sort = { monthlyRent: order === 'desc' ? -1 : 1 };
    if (sortBy === 'newest') sort = { createdAt: -1 };

    // Only expose safe public fields
    const apartments = await Apartment.find(query)
      .select('apartmentNumber buildingDetails floorDetails apartmentType monthlyRent securityDeposit status city locality address state pincode latitude longitude description bedrooms bathrooms areaSqFt amenities images isFeatured')
      .sort(sort)
      .limit(50);

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

// Public endpoint for listing detail page
async function getPublicApartmentById(req, res, next) {
  try {
    const apartment = await Apartment.findOne({ _id: req.params.id, ...getPublicListingQuery() })
      .select('apartmentNumber buildingDetails floorDetails apartmentType monthlyRent securityDeposit status city locality address state pincode latitude longitude description bedrooms bathrooms areaSqFt amenities images isFeatured rentalPolicies');
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
      apartmentNumber, buildingDetails, floorDetails, apartmentType,
      monthlyRent, securityDeposit, status, rentalPolicies, agreementDetails,
      address, city, locality, state, pincode, latitude, longitude,
      description, bedrooms, bathrooms, areaSqFt, amenities, isFeatured, isAvailableForListing,
    } = req.body;

    if (!apartmentNumber || !buildingDetails || !floorDetails || !apartmentType) {
      const err = new Error('Apartment number, building, floor and type are required');
      err.statusCode = 400;
      return next(err);
    }

    if (Number(monthlyRent) < 0 || Number(securityDeposit) < 0) {
      const err = new Error('Rent and deposit must be positive numbers');
      err.statusCode = 400;
      return next(err);
    }

    const willBePublic = isAvailableForListing !== false && isAvailableForListing !== 'false';
    const locationError = getLocationValidationError({
      isPublic: willBePublic,
      address,
      city,
      latitude,
      longitude,
    });
    if (locationError) {
      const err = new Error(locationError);
      err.statusCode = 400;
      return next(err);
    }

    const apartment = await Apartment.create({
      apartmentNumber, buildingDetails, floorDetails, apartmentType,
      monthlyRent: Number(monthlyRent), securityDeposit: Number(securityDeposit),
      status: status || 'Empty', rentalPolicies, agreementDetails,
      address, city, locality, state, pincode,
      latitude: latitude !== undefined && latitude !== null && latitude !== '' ? Number(latitude) : undefined,
      longitude: longitude !== undefined && longitude !== null && longitude !== '' ? Number(longitude) : undefined,
      description,
      bedrooms: bedrooms ? Number(bedrooms) : undefined,
      bathrooms: bathrooms ? Number(bathrooms) : undefined,
      areaSqFt: areaSqFt ? Number(areaSqFt) : undefined,
      amenities: Array.isArray(amenities) ? amenities : (amenities ? [amenities] : []),
      isFeatured: isFeatured === true || isFeatured === 'true',
      isAvailableForListing: isAvailableForListing !== false && isAvailableForListing !== 'false',
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
      apartmentNumber, buildingDetails, floorDetails, apartmentType,
      monthlyRent, securityDeposit, status, rentalPolicies, agreementDetails,
      address, city, locality, state, pincode, latitude, longitude,
      description, bedrooms, bathrooms, areaSqFt, amenities, isFeatured, isAvailableForListing,
    } = req.body;

    if (monthlyRent !== undefined && Number(monthlyRent) < 0) {
      const err = new Error('Rent must be a positive number');
      err.statusCode = 400;
      return next(err);
    }
    if (securityDeposit !== undefined && Number(securityDeposit) < 0) {
      const err = new Error('Security deposit must be a positive number');
      err.statusCode = 400;
      return next(err);
    }

    if (status === 'Occupied' && !apartment.currentTenant) {
      const err = new Error('Cannot mark apartment occupied without tenant');
      err.statusCode = 400;
      return next(err);
    }

    const willBePublic = isAvailableForListing === undefined
      ? apartment.isAvailableForListing !== false
      : isAvailableForListing === true || isAvailableForListing === 'true';
    const locationError = getLocationValidationError({
      isPublic: willBePublic,
      address: address === undefined ? apartment.address : address,
      city: city === undefined ? apartment.city : city,
      latitude: latitude === undefined ? apartment.latitude : latitude,
      longitude: longitude === undefined ? apartment.longitude : longitude,
    });
    if (locationError) {
      const err = new Error(locationError);
      err.statusCode = 400;
      return next(err);
    }

    const fields = {
      apartmentNumber, buildingDetails, floorDetails, apartmentType,
      rentalPolicies, agreementDetails, address, city, locality, state, pincode,
      description, status,
    };
    Object.entries(fields).forEach(([k, v]) => { if (v !== undefined) apartment[k] = v; });

    if (monthlyRent !== undefined) apartment.monthlyRent = Number(monthlyRent);
    if (securityDeposit !== undefined) apartment.securityDeposit = Number(securityDeposit);
    if (latitude !== undefined) apartment.latitude = latitude === null || latitude === '' ? undefined : Number(latitude);
    if (longitude !== undefined) apartment.longitude = longitude === null || longitude === '' ? undefined : Number(longitude);
    if (bedrooms !== undefined) apartment.bedrooms = Number(bedrooms);
    if (bathrooms !== undefined) apartment.bathrooms = Number(bathrooms);
    if (areaSqFt !== undefined) apartment.areaSqFt = Number(areaSqFt);
    if (amenities !== undefined) apartment.amenities = Array.isArray(amenities) ? amenities : [amenities];
    if (isFeatured !== undefined) apartment.isFeatured = isFeatured === true || isFeatured === 'true';
    if (isAvailableForListing !== undefined) apartment.isAvailableForListing = isAvailableForListing === true || isAvailableForListing === 'true';

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

    // FIX: Use deleteOne() instead of the deprecated .remove()
    await Apartment.deleteOne({ _id: apartment._id });

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

module.exports = { getApartments, getApartmentById, createApartment, updateApartment, deleteApartment, getPublicApartments, getPublicApartmentById };
