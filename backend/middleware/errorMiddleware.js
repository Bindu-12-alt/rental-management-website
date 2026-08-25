function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Server Error';
  res.status(statusCode).json({ success: false, error: message });
}

module.exports = { errorHandler };
