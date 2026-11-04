const { OAuth2Client } = require('google-auth-library');
const Admin = require('../models/Admin');
const Tenant = require('../models/Tenant');
const { generateAdminToken, generateTenantToken } = require('../utils/authTokens');

function getGoogleConfig(req, res) {
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID || '' });
}

function authError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function loginWithGoogle(req, res, next) {
  try {
    const { credential, role } = req.body || {};
    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (!clientId) {
      return next(authError('Google sign-in is not configured on this server.', 503));
    }
    if (typeof credential !== 'string' || credential.length > 10000) {
      return next(authError('A valid Google credential is required.', 400));
    }
    if (role !== 'admin' && role !== 'tenant') {
      return next(authError('A valid account type is required.', 400));
    }

    const googleClient = new OAuth2Client(clientId);
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    const email = payload && typeof payload.email === 'string'
      ? payload.email.toLowerCase().trim()
      : '';
    const fullName = payload && typeof payload.name === 'string' ? payload.name.trim() : '';

    if (!payload || !payload.sub || !email || payload.email_verified !== true || !fullName) {
      return next(authError('Google could not verify the account details. Please try another account.', 401));
    }

    const model = role === 'admin' ? Admin : Tenant;
    const otherModel = role === 'admin' ? Tenant : Admin;
    const account = await model.findOne({ email });

    if (!account && role === 'admin') {
      const allowedEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
      if (!allowedEmail || email !== allowedEmail) {
        return next(authError('This Google email is not authorized to register as the admin.', 403));
      }
    }
    if (!account && await otherModel.exists({ email })) {
      return next(authError('This email belongs to a different RentEase account type. Use the matching sign-in page.', 403));
    }

    const googleAccount = await model.findOne({ googleId: payload.sub });
    if (googleAccount && (!account || String(googleAccount._id) !== String(account._id))) {
      return next(authError('This Google account is already linked to another RentEase account.', 409));
    }

    const isNewTenant = !account && role === 'tenant';
    const user = account || (role === 'admin'
      ? new Admin({ name: fullName, email, password: null })
      : new Tenant({
        fullName,
        email,
        phone: '',
        address: '',
        password: null,
      }));

    user.googleId = payload.sub;
    user.profilePicture = typeof payload.picture === 'string'
      && payload.picture.startsWith('https://')
      ? payload.picture
      : '';
    if (role === 'admin') {
      user.name = user.name || fullName;
      user.authProvider = user.password ? 'mixed' : 'google';
    } else {
      user.fullName = user.fullName || fullName;
      user.authProvider = user.password ? 'mixed' : 'google';
    }
    await user.save();

    if (isNewTenant) {
      const { sendEmail, templates } = require('../services/emailService');
      try {
        await sendEmail({
          to: email,
          ...templates.welcomeEmail({ fullName, email }),
        });
      } catch (emailError) {
        console.error('[Auth] Google welcome email failed:', emailError.message);
      }
    }

    if (role === 'admin') {
      return res.json({
        success: true,
        token: generateAdminToken(user._id),
        admin: { id: user._id, name: user.name, email: user.email },
      });
    }

    return res.json({
      success: true,
      token: generateTenantToken(user._id),
      tenant: { id: user._id, fullName: user.fullName, email: user.email },
    });
  } catch (error) {
    if (error.code === 11000) {
      return next(authError('This Google account is already linked to another RentEase account.', 409));
    }
    if (error.message && /token|audience|issuer/i.test(error.message)) {
      return next(authError('Google sign-in could not verify your account. Please try again.', 401));
    }
    return next(error);
  }
}

module.exports = { getGoogleConfig, loginWithGoogle };
