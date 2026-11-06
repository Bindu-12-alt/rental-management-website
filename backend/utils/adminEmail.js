function getAllowedAdminEmail() {
  return (process.env.ADMIN_EMAIL || 'bindusrikavuri@gmail.com').toLowerCase().trim();
}

module.exports = { getAllowedAdminEmail };
