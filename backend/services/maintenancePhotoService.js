const fs = require('fs');
const path = require('path');

const maintenanceUploadDir = path.resolve(__dirname, '../uploads/maintenance');

function resolveMaintenancePhoto(photo) {
  if (typeof photo !== 'string') return null;
  const filename = path.win32.basename(path.posix.basename(photo));
  if (!/^maint_[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(filename)) return null;
  const fullPath = path.resolve(maintenanceUploadDir, filename);
  if (!fullPath.startsWith(`${maintenanceUploadDir}${path.sep}`) || !fs.existsSync(fullPath)) return null;
  return fullPath;
}

function sendMaintenancePhoto(res, filePath, next) {
  res.set({
    'Content-Disposition': 'attachment',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  res.sendFile(filePath, (error) => {
    if (error && !res.headersSent) next(error);
  });
}

module.exports = { resolveMaintenancePhoto, sendMaintenancePhoto };
