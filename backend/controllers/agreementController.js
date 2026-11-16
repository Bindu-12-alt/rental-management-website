const RentalAgreement = require('../models/RentalAgreement');
const Tenant = require('../models/Tenant');
const Apartment = require('../models/Apartment');
const History = require('../models/History');
const { createNotification } = require('../services/notificationService');
const { sendEmail, templates, verifyEmailConnection, getEmailConfiguration } = require('../services/emailService');
const { generateAgreementPdf } = require('../services/agreementPdfService');
const docusignService = require('../services/docusignService');

function isNonNegativeAmount(value) {
  return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
    && Number.isFinite(Number(value)) && Number(value) >= 0;
}

async function getAgreementPdfBuffer(agreement) {
  if (agreement.documentData) return Buffer.from(agreement.documentData);
  const tenant = agreement.tenantSnapshot || await Tenant.findById(agreement.tenant)
    .select('fullName email phone address identification');
  const apartment = agreement.apartmentSnapshot || await Apartment.findById(agreement.apartment)
    .select('apartmentNumber buildingDetails floorDetails apartmentType address city locality state pincode');
  if (!tenant || !apartment) throw new Error('Agreement tenant or apartment no longer exists');
  return generateAgreementPdf(agreement, tenant, apartment);
}

async function ensureStoredAgreementPdf(agreement) {
  if (agreement.status === 'Draft') agreement.status = 'Generated';
  if (agreement.documentData) return getAgreementPdfBuffer(agreement);
  const pdf = await getAgreementPdfBuffer(agreement);
  agreement.documentData = pdf;
  agreement.documentOriginalName = `${agreement.agreementId}.pdf`;
  agreement.documentSource = 'generated';
  try {
    await agreement.save();
  } catch (error) {
    agreement.documentData = undefined;
    throw error;
  }
  return pdf;
}

function getSignatureResponseData(agreement) {
  return {
    signatureProvider: agreement.signatureProvider,
    signatureStatus: agreement.signatureStatus,
    signatureSentAt: agreement.signatureSentAt,
    signatureCompletedAt: agreement.signatureCompletedAt,
    signatureLastCheckedAt: agreement.signatureLastCheckedAt,
    signatureDocumentAvailable: agreement.signatureDocumentAvailable,
    signatureAttempts: agreement.signatureAttempts,
  };
}

async function sendAgreementEmail(agreementId, event = 'created') {
  const now = new Date();
  const agreement = await RentalAgreement.findOneAndUpdate(
    {
      _id: agreementId,
      $or: [
        { emailDeliveryStatus: { $nin: ['sending', 'sent'] } },
        { emailDeliveryStatus: 'sending', emailSendingAt: { $lt: new Date(now.getTime() - 10 * 60 * 1000) } },
        { emailDeliveryStatus: 'sending', emailSendingAt: null },
      ],
    },
    {
      $set: { emailDeliveryStatus: 'sending', emailSendingAt: now, emailError: null },
      $inc: { emailAttempts: 1 },
    },
    { new: true },
  );
  if (!agreement) {
    const current = await RentalAgreement.findById(agreementId).select('emailDeliveryStatus emailSentAt emailError');
    if (!current) return { status: 'not_found' };
    return {
      status: current.emailDeliveryStatus,
      sentAt: current.emailSentAt,
      error: current.emailError,
      duplicatePrevented: current.emailDeliveryStatus === 'sent' || current.emailDeliveryStatus === 'sending',
    };
  }

  try {
    const tenant = await Tenant.findById(agreement.tenant).select('fullName email');
    const apartment = await Apartment.findById(agreement.apartment).select('apartmentNumber');
    if (!tenant || !tenant.email) throw new Error('Agreement tenant has no deliverable email address');

    const configuration = getEmailConfiguration();
    const result = await sendEmail({
      to: tenant.email,
      ...templates.agreementCreatedEmail({
        fullName: tenant.fullName,
        agreementId: agreement.agreementId,
        startDate: agreement.startDate.toLocaleDateString(),
        expiryDate: agreement.expiryDate.toLocaleDateString(),
        monthlyRent: agreement.monthlyRent,
        apartmentNumber: apartment?.apartmentNumber || '—',
        status: agreement.status,
        event: event === 'renewed' ? 'renewed' : agreement.emailAttempts > 1 ? 'updated' : event,
      }),
      attachments: [{
        filename: `${agreement.agreementId}.pdf`,
        content: await ensureStoredAgreementPdf(agreement),
        contentType: 'application/pdf',
      }],
    });

    agreement.emailDeliveryStatus = result.success ? 'sent' : result.notConfigured ? 'not_configured' : 'failed';
    agreement.emailSendingAt = null;
    agreement.emailError = result.success ? undefined : result.error;
    agreement.emailSentAt = result.success ? new Date() : undefined;
    agreement.emailMessageId = result.success ? result.messageId : undefined;
    await agreement.save();

    if (result.success) {
      try {
        await createNotification({
          type: 'Agreement Delivered',
          message: `Rental agreement ${agreement.agreementId} was emailed to ${tenant.email}`,
          relatedTenant: tenant._id,
          relatedApartment: agreement.apartment,
          priority: 'Medium',
          eventKey: `agreement-delivered-${agreement._id}`,
        });
      } catch (notificationError) {
        console.error('[Agreement] Delivery notification could not be recorded:', notificationError.message);
      }
    }

    return {
      status: agreement.emailDeliveryStatus,
      sentAt: agreement.emailSentAt,
      error: agreement.emailError,
      messageId: agreement.emailMessageId,
      configured: configuration.configured,
    };
  } catch (error) {
    agreement.emailDeliveryStatus = 'failed';
    agreement.emailSendingAt = null;
    agreement.emailError = error.message;
    await agreement.save();
    console.error('[Agreement] Email delivery failed:', error.message);
    return { status: 'failed', error: error.message };
  }
}

async function emailConfiguration(req, res, next) {
  try {
    const result = await verifyEmailConnection();
    res.json({
      success: true,
      data: {
        configured: result.configured,
        devMode: result.devMode,
        verified: result.verified,
        host: result.host,
        fromAddress: result.fromAddress,
        error: result.error,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function signatureConfiguration(req, res) {
  res.json({ success: true, data: docusignService.getConfigurationStatus() });
}

async function sendAgreementForSignature(req, res, next) {
  let agreement;
  try {
    const configuration = docusignService.getConfigurationStatus();
    if (!configuration.configured) {
      return res.status(503).json({
        success: false,
        data: configuration,
        error: 'DocuSign sandbox is not configured; no signature request was sent.',
      });
    }

    agreement = await RentalAgreement.findById(req.params.id)
      .select('+signatureEnvelopeId +signatureTransactionId +signatureSendingAt +signatureError');
    if (!agreement) {
      const err = new Error('Agreement not found');
      err.statusCode = 404;
      return next(err);
    }
    if (!['Draft', 'Generated', 'Pending Signature'].includes(agreement.status)) {
      return res.status(409).json({ success: false, error: 'Only draft or generated agreements can be sent for signature.' });
    }
    if (agreement.signatureEnvelopeId) {
      return res.status(409).json({
        success: false,
        data: getSignatureResponseData(agreement),
        error: 'A DocuSign envelope already exists; refresh its status instead of sending a duplicate.',
      });
    }

    const now = new Date();
    const staleSendingAt = new Date(now.getTime() - 10 * 60 * 1000);
    agreement = await RentalAgreement.findOneAndUpdate(
      {
        _id: req.params.id,
        signatureEnvelopeId: { $in: [null, ''] },
        $or: [
          { signatureStatus: { $in: ['not_started', 'failed'] } },
          { signatureStatus: 'sending', signatureSendingAt: { $lt: staleSendingAt } },
          { signatureStatus: 'sending', signatureSendingAt: null },
        ],
      },
      {
        $set: {
          signatureProvider: 'docusign',
          signatureStatus: 'sending',
          signatureSendingAt: now,
          signatureError: null,
          signatureTransactionId: `rentease-${req.params.id}`,
        },
        $inc: { signatureAttempts: 1 },
      },
      { new: true },
    ).select('+signatureEnvelopeId +signatureTransactionId +signatureSendingAt +signatureError');

    if (!agreement) {
      const current = await RentalAgreement.findById(req.params.id);
      return res.status(409).json({
        success: false,
        data: current ? getSignatureResponseData(current) : undefined,
        error: 'A signature request is already in progress or this agreement is not eligible.',
      });
    }

    const tenant = await Tenant.findById(agreement.tenant).select('fullName email');
    if (!tenant || !tenant.email || !req.admin?.email) {
      throw new Error('A valid tenant and current admin email are required for signing');
    }
    const pdfBuffer = await ensureStoredAgreementPdf(agreement);
    const envelope = await docusignService.sendSignatureEnvelope({
      agreement,
      tenant,
      admin: req.admin,
      pdfBuffer,
    });

    agreement.signatureEnvelopeId = envelope.envelopeId;
    agreement.signatureStatus = envelope.status;
    agreement.signatureSendingAt = undefined;
    agreement.signatureSentAt = new Date();
    agreement.signatureLastCheckedAt = new Date();
    agreement.signatureError = undefined;
    agreement.status = 'Pending Signature';
    await agreement.save();

    res.json({
      success: true,
      data: getSignatureResponseData(agreement),
      message: 'DocuSign sandbox sent the test agreement to the tenant, then the current admin. Production signature status is unchanged.',
    });
  } catch (error) {
    if (agreement && agreement.signatureStatus === 'sending') {
      agreement.signatureStatus = 'failed';
      agreement.signatureSendingAt = undefined;
      agreement.signatureError = error.message;
      await agreement.save();
      return res.status(502).json({
        success: false,
        data: getSignatureResponseData(agreement),
        error: error.message,
      });
    }
    next(error);
  }
}

async function refreshAgreementSignature(req, res, next) {
  try {
    const configuration = docusignService.getConfigurationStatus();
    if (!configuration.configured) {
      return res.status(503).json({
        success: false,
        data: configuration,
        error: 'DocuSign sandbox is not configured; signature status was not checked.',
      });
    }
    const agreement = await RentalAgreement.findById(req.params.id)
      .select('+signatureEnvelopeId +signatureError +signedDocumentData');
    if (!agreement) {
      const err = new Error('Agreement not found');
      err.statusCode = 404;
      return next(err);
    }
    if (agreement.signatureProvider !== 'docusign' || !agreement.signatureEnvelopeId) {
      return res.status(409).json({ success: false, error: 'This agreement has no DocuSign envelope to refresh.' });
    }

    const providerStatus = await docusignService.getEnvelopeStatus(agreement.signatureEnvelopeId);
    agreement.signatureStatus = providerStatus;
    agreement.signatureLastCheckedAt = new Date();
    agreement.signatureError = undefined;
    if (providerStatus === 'completed') {
      agreement.signatureStatus = 'sandbox_completed';
      agreement.signatureCompletedAt = agreement.signatureCompletedAt || new Date();
      if (!agreement.signedDocumentData) {
        try {
          const signedPdf = await docusignService.downloadCompletedPdf(agreement.signatureEnvelopeId);
          if (!signedPdf.subarray(0, 5).equals(Buffer.from('%PDF-'))
            || !signedPdf.subarray(-2048).includes(Buffer.from('%%EOF'))) {
            throw new Error('DocuSign returned a file that is not a valid signed PDF');
          }
          agreement.signedDocumentData = signedPdf;
          agreement.signatureDocumentAvailable = true;
        } catch (error) {
          agreement.signatureError = error.message;
          await agreement.save();
          return res.status(502).json({
            success: false,
            data: getSignatureResponseData(agreement),
            error: 'DocuSign confirmed signing, but the signed PDF could not be retrieved. Refresh status to retry.',
          });
        }
      }
    }

    await agreement.save();
    res.json({
      success: true,
      data: getSignatureResponseData(agreement),
      message: providerStatus === 'completed'
        ? 'DocuSign sandbox completed both test signatures; this test agreement remains pending production signature.'
        : `DocuSign status refreshed: ${providerStatus}.`,
    });
  } catch (error) {
    next(error);
  }
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
      .select('-documentData')
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
      .select('-documentData')
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
    const {
      agreementId, tenant, apartment, startDate, expiryDate, rentalCycle, monthlyRent, status,
      maintenanceCharges = 0, securityDeposit, agreementDetails, renewalTerms, legalConditions,
    } = req.body;
    if (!agreementId || !tenant || !apartment || !startDate || !expiryDate || !rentalCycle || monthlyRent == null) {
      const err = new Error('Agreement ID, tenant, apartment, dates, rental cycle, and monthly rent are required');
      err.statusCode = 400;
      return next(err);
    }
    if (status === 'Signed') {
      const err = new Error('Agreements can be marked signed only after DocuSign confirms both signatures.');
      err.statusCode = 409;
      return next(err);
    }
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(agreementId)) {
      const err = new Error('Agreement ID may contain only letters, numbers, dots, underscores, and hyphens');
      err.statusCode = 400;
      return next(err);
    }
    if (!isNonNegativeAmount(monthlyRent)
      || !isNonNegativeAmount(maintenanceCharges)
      || (securityDeposit !== undefined && !isNonNegativeAmount(securityDeposit))) {
      const err = new Error('Rent, maintenance charges, and security deposit must be valid non-negative amounts');
      err.statusCode = 400;
      return next(err);
    }

    const apt = await Apartment.findById(apartment);
    if (!apt) {
      const err = new Error('Apartment not found');
      err.statusCode = 404;
      return next(err);
    }
    if (apt.currentTenant && String(apt.currentTenant) !== String(tenant)) {
      const err = new Error(`Apartment ${apt.apartmentNumber} is already occupied`);
      err.statusCode = 400;
      return next(err);
    }
    if (apt.status === 'Occupied' && !apt.currentTenant) {
      const err = new Error(`Apartment ${apt.apartmentNumber} has an inconsistent occupied assignment`);
      err.statusCode = 409;
      return next(err);
    }
    const tenantDoc = await Tenant.findById(tenant).select('fullName email phone address identification apartment');
    if (!tenantDoc) {
      const err = new Error('Tenant not found');
      err.statusCode = 404;
      return next(err);
    }
    if (tenantDoc.apartment && String(tenantDoc.apartment) !== String(apartment)) {
      const err = new Error('Selected tenant is assigned to a different apartment');
      err.statusCode = 400;
      return next(err);
    }
    const starts = new Date(startDate);
    const expires = new Date(expiryDate);
    if (Number.isNaN(starts.getTime()) || Number.isNaN(expires.getTime()) || expires <= starts) {
      const err = new Error('A valid expiry date after the start date is required');
      err.statusCode = 400;
      return next(err);
    }
    const daysToExpiry = Math.ceil((expires - new Date()) / (1000 * 60 * 60 * 24));
    const initialStatus = status === 'Draft'
      ? 'Draft'
      : daysToExpiry >= 0 && daysToExpiry <= 30 ? 'Expiring Soon' : 'Generated';
    const overlappingAgreement = await RentalAgreement.findOne({
      tenant,
      apartment,
      expiryDate: { $gt: starts },
      status: { $nin: ['Expired', 'Renewed', 'Terminated'] },
    }).select('_id agreementId');
    if (overlappingAgreement) {
      const err = new Error(`Tenant already has an unexpired agreement (${overlappingAgreement.agreementId}) for this apartment`);
      err.statusCode = 409;
      return next(err);
    }

    const agreement = await RentalAgreement.create({
      agreementId,
      tenant,
      apartment,
      startDate: starts,
      expiryDate: expires,
      rentalCycle,
      monthlyRent: Number(monthlyRent),
      maintenanceCharges: Number(maintenanceCharges),
      securityDeposit: securityDeposit === undefined ? apt.securityDeposit : Number(securityDeposit),
      agreementDetails,
      renewalTerms: renewalTerms || apt.rentalPolicies || '',
      legalConditions: legalConditions || apt.agreementDetails || '',
      tenantSnapshot: {
        fullName: tenantDoc.fullName,
        email: tenantDoc.email,
        phone: tenantDoc.phone,
        address: tenantDoc.address,
        identification: tenantDoc.identification,
      },
      apartmentSnapshot: {
        apartmentNumber: apt.apartmentNumber,
        buildingDetails: apt.buildingDetails,
        floorDetails: apt.floorDetails,
        apartmentType: apt.apartmentType,
        address: apt.address,
        city: apt.city,
        locality: apt.locality,
        state: apt.state,
        pincode: apt.pincode,
      },
      status: initialStatus,
    });

    if (agreement.status !== 'Draft') {
      try {
        await ensureStoredAgreementPdf(agreement);
      } catch (error) {
        await RentalAgreement.deleteOne({ _id: agreement._id });
        throw error;
      }
    }

    apt.currentTenant = tenant;
    apt.status = 'Occupied';
    apt.rentalStartDate = starts;
    await apt.save();
    tenantDoc.apartment = apt._id;
    tenantDoc.rentalStartDate = starts;
    await tenantDoc.save();

    await History.create({
      type: 'Agreement Created',
      title: `Agreement ${agreementId} created`,
      description: `Created agreement for apartment ${apt.apartmentNumber}`,
      tenant,
      apartment,
      relatedAgreement: agreement._id,
    });

    if (agreement.status === 'Expiring Soon') {
      await createNotification({
        type: 'Agreement Renewal',
        message: `Agreement ${agreementId} is expiring in ${daysToExpiry} days`,
        relatedTenant: tenant,
        relatedApartment: apartment,
        priority: 'High',
      });
    }

    const email = agreement.status === 'Draft'
      ? { status: 'not_sent', error: 'Draft agreements are not emailed' }
      : await sendAgreementEmail(agreement._id);
    const savedAgreement = await RentalAgreement.findById(agreement._id)
      .select('-documentData')
      .populate('tenant', 'fullName email')
      .populate('apartment', 'apartmentNumber');

    res.status(201).json({
      success: true,
      data: savedAgreement,
      email,
      message: email.status === 'sent'
        ? 'Agreement generated and emailed to the tenant.'
        : agreement.status === 'Draft'
          ? 'Draft saved. Generate the PDF and send it after the agreement is ready.'
          : 'Agreement generated. Email was not delivered; review the delivery status and retry after configuring SMTP.',
    });
  } catch (error) {
    next(error);
  }
}

async function updateAgreement(req, res, next) {
  try {
    const agreement = await RentalAgreement.findById(req.params.id)
      .select('-documentData +signatureEnvelopeId +signatureTransactionId +signatureSendingAt');
    if (!agreement) {
      const err = new Error('Agreement not found');
      err.statusCode = 404;
      return next(err);
    }

    const {
      expiryDate, rentalCycle, monthlyRent, maintenanceCharges, securityDeposit,
      status, agreementDetails, renewalTerms, legalConditions,
    } = req.body;
    if (status === 'Signed' && agreement.signatureStatus !== 'completed') {
      const err = new Error('Agreements can be marked signed only after DocuSign confirms both signatures.');
      err.statusCode = 409;
      return next(err);
    }
    if ([monthlyRent, maintenanceCharges, securityDeposit].some((value) => value != null && !isNonNegativeAmount(value))) {
      const err = new Error('Rent, maintenance charges, and security deposit must be valid non-negative amounts');
      err.statusCode = 400;
      return next(err);
    }
    if (expiryDate && (!Number.isFinite(new Date(expiryDate).getTime()) || new Date(expiryDate) <= agreement.startDate)) {
      const err = new Error('Expiry date must be valid and after the start date');
      err.statusCode = 400;
      return next(err);
    }

    const updatedFields = {
      expiryDate, rentalCycle, monthlyRent, maintenanceCharges, securityDeposit,
      status, agreementDetails, renewalTerms, legalConditions,
    };
    const contractFieldsChanged = Object.entries(updatedFields).some(([field, value]) => {
      if (value === undefined || value === null || (field === 'expiryDate' && value === '')) return false;
      if (field === 'expiryDate') {
        return new Date(value).getTime() !== new Date(agreement.expiryDate).getTime();
      }
      return String(value) !== String(agreement[field] ?? '');
    });
    if (contractFieldsChanged && agreement.signatureAttempts > 0) {
      const err = new Error('An agreement with a DocuSign signing attempt cannot be edited; create a new agreement for revised terms.');
      err.statusCode = 409;
      return next(err);
    }
    if (contractFieldsChanged && agreement.emailDeliveryStatus === 'sending') {
      const err = new Error('Agreement email delivery is in progress; try editing again after it completes');
      err.statusCode = 409;
      return next(err);
    }

    Object.assign(agreement, {
      expiryDate: expiryDate ? new Date(expiryDate) : agreement.expiryDate,
      rentalCycle: rentalCycle ?? agreement.rentalCycle,
      monthlyRent: monthlyRent ?? agreement.monthlyRent,
      maintenanceCharges: maintenanceCharges ?? agreement.maintenanceCharges,
      securityDeposit: securityDeposit ?? agreement.securityDeposit,
      status: status ?? agreement.status,
      agreementDetails: agreementDetails ?? agreement.agreementDetails,
      renewalTerms: renewalTerms ?? agreement.renewalTerms,
      legalConditions: legalConditions ?? agreement.legalConditions,
    });
    if (contractFieldsChanged) {
      agreement.emailDeliveryStatus = 'not_sent';
      agreement.emailSentAt = undefined;
      agreement.emailMessageId = undefined;
      agreement.emailError = undefined;
      if (agreement.documentSource === 'generated') {
        agreement.documentData = undefined;
        agreement.documentOriginalName = undefined;
        agreement.documentSource = undefined;
      }
    }

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

// FIX: Route registration is POST; updated route file to match. Frontend also updated.
async function renewAgreement(req, res, next) {
  try {
    const agreement = await RentalAgreement.findById(req.params.id).select('-documentData');
    if (!agreement) {
      const err = new Error('Agreement not found');
      err.statusCode = 404;
      return next(err);
    }
    if (!['Active', 'Expiring Soon', 'Signed'].includes(agreement.status)) {
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
    if (!isNonNegativeAmount(newMonthlyRent)) {
      const err = new Error('Monthly rent must be a valid non-negative number');
      err.statusCode = 400;
      return next(err);
    }
    const renewedExpiry = new Date(newExpiryDate);
    if (!Number.isFinite(renewedExpiry.getTime()) || renewedExpiry <= agreement.expiryDate) {
      const err = new Error('Renewal expiry date must be after the current agreement expiry date');
      err.statusCode = 400;
      return next(err);
    }

    const renewedAgreement = await RentalAgreement.create({
      agreementId: `${agreement.agreementId}-R${Date.now()}`,
      tenant: agreement.tenant,
      apartment: agreement.apartment,
      startDate: agreement.expiryDate,
      expiryDate: renewedExpiry,
      rentalCycle: newRentalCycle,
      monthlyRent: Number(newMonthlyRent),
      maintenanceCharges: agreement.maintenanceCharges,
      securityDeposit: agreement.securityDeposit,
      agreementDetails: agreement.agreementDetails,
      renewalTerms: agreement.renewalTerms,
      legalConditions: agreement.legalConditions,
      tenantSnapshot: agreement.tenantSnapshot,
      apartmentSnapshot: agreement.apartmentSnapshot,
      status: 'Pending Signature',
      renewals: [],
    });

    agreement.status = 'Renewed';
    agreement.renewals.push(renewedAgreement._id);
    await agreement.save();

    await History.create({
      type: 'Agreement Renewed',
      title: `Agreement ${agreement.agreementId} renewed`,
      description: `Renewed contract through ${renewedExpiry.toISOString().split('T')[0]}`,
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
    const email = await sendAgreementEmail(renewedAgreement._id, 'renewed');

    res.status(201).json({
      success: true,
      data: renewedAgreement,
      email,
      message: email.status === 'sent'
        ? 'Agreement renewed and the tenant email was accepted by SMTP.'
        : 'Agreement renewed, but the tenant email was not delivered.',
    });
  } catch (error) {
    next(error);
  }
}

async function emailAgreement(req, res, next) {
  try {
    const agreement = await RentalAgreement.findById(req.params.id).select('-documentData');
    if (!agreement) {
      const err = new Error('Agreement not found');
      err.statusCode = 404;
      return next(err);
    }
    const result = await sendAgreementEmail(agreement._id);
    const data = await RentalAgreement.findById(agreement._id).select('emailDeliveryStatus emailSentAt emailError emailAttempts');
    const statusCode = result.status === 'failed' ? 502 : result.status === 'not_configured' ? 503 : result.status === 'sending' ? 409 : 200;
    const message = result.status === 'sent'
      ? result.duplicatePrevented
        ? 'Agreement was already accepted by SMTP; no duplicate email was sent.'
        : 'Agreement email accepted by the SMTP server.'
      : result.status === 'not_configured'
        ? 'Email delivery is not configured; no email was sent.'
        : result.error || 'Agreement email was not sent.';
    res.status(statusCode).json({
      success: result.status === 'sent',
      data,
      message,
      ...(result.status === 'sent' ? {} : { error: message }),
    });
  } catch (error) {
    next(error);
  }
}

async function sendAgreementPdf(agreement, res) {
  if (agreement.signatureProvider === 'docusign'
    && agreement.signatureStatus === 'sandbox_completed'
    && !agreement.signedDocumentData) {
    const err = new Error('The DocuSign sandbox test PDF is not available yet. Ask an admin to refresh signature status.');
    err.statusCode = 503;
    throw err;
  }
  if (agreement.status === 'Draft') {
    agreement.status = 'Generated';
    await agreement.save();
  }
  const isSigned = agreement.signatureProvider === 'docusign'
    && agreement.signatureStatus === 'sandbox_completed'
    && agreement.signedDocumentData;
  const pdf = isSigned ? Buffer.from(agreement.signedDocumentData) : await ensureStoredAgreementPdf(agreement);
  const filename = `${agreement.agreementId}${isSigned ? '-sandbox-test' : ''}.pdf`
    .replace(/[^a-zA-Z0-9._-]/g, '_');
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': pdf.length,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(pdf);
}

async function downloadAgreement(req, res, next) {
  try {
    const agreement = await RentalAgreement.findById(req.params.id).select('+signedDocumentData');
    if (!agreement) {
      const err = new Error('Agreement not found');
      err.statusCode = 404;
      return next(err);
    }
    await sendAgreementPdf(agreement, res);
  } catch (error) {
    next(error);
  }
}

async function downloadTenantAgreement(req, res, next) {
  try {
    const agreement = await RentalAgreement.findOne({
      _id: req.params.id,
      tenant: req.tenant._id,
    }).select('+signedDocumentData');
    if (!agreement) {
      const err = new Error('Agreement not found');
      err.statusCode = 404;
      return next(err);
    }
    await sendAgreementPdf(agreement, res);
  } catch (error) {
    next(error);
  }
}

async function uploadAgreement(req, res, next) {
  try {
    if (!req.file || !req.file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))
      || !req.file.buffer.subarray(-2048).includes(Buffer.from('%%EOF'))) {
      const err = new Error('Please upload a valid PDF rental agreement');
      err.statusCode = 400;
      return next(err);
    }
    const agreement = await RentalAgreement.findById(req.params.id);
    if (!agreement) {
      const err = new Error('Agreement not found');
      err.statusCode = 404;
      return next(err);
    }
    if (agreement.signatureAttempts > 0) {
      const err = new Error('This agreement has a DocuSign signing attempt and cannot be replaced. Create a new agreement for a different document.');
      err.statusCode = 409;
      return next(err);
    }
    agreement.documentData = req.file.buffer;
    agreement.documentOriginalName = req.file.originalname.replace(/[\\/]/g, '_').slice(0, 160);
    agreement.documentSource = 'uploaded';
    agreement.status = 'Generated';
    agreement.emailDeliveryStatus = 'not_sent';
    agreement.emailSentAt = undefined;
    agreement.emailMessageId = undefined;
    agreement.emailError = undefined;
    await agreement.save();
    await History.create({
      type: 'Agreement Document Uploaded',
      title: `Agreement ${agreement.agreementId} uploaded`,
      description: 'Existing PDF agreement uploaded by admin',
      tenant: agreement.tenant,
      apartment: agreement.apartment,
      relatedAgreement: agreement._id,
    });
    const data = await RentalAgreement.findById(agreement._id).select('-documentData');
    res.json({ success: true, data, message: 'Agreement PDF uploaded and stored privately.' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAgreements,
  getAgreementById,
  createAgreement,
  updateAgreement,
  renewAgreement,
  emailAgreement,
  downloadAgreement,
  uploadAgreement,
  emailConfiguration,
  signatureConfiguration,
  sendAgreementForSignature,
  refreshAgreementSignature,
  getAgreementPdfBuffer,
  downloadTenantAgreement,
};
