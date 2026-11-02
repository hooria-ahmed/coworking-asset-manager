// Helpers for Azlaan's modules (Assets, Maintenance): asset images and retiring an asset.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ApiError } = require('../../utils/http');
const { notify } = require('../../services/notify');
const C = require('../../config/constants');
const { fmtRange } = require('../requests/rules');

// Uploaded images live in server/uploads/ (git-ignored) and are served at /api/assets/images/<file>.
const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'uploads');
const IMAGE_URL_PREFIX = '/api/assets/images/';

// FR-AM-01: JPG or PNG only, checked by the file's first bytes (not just the name), at most 2 MB.
function detectImageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
}

// image from the form: undefined = keep the current one, null or '' = remove it,
// "data:image/png;base64,..." = a new upload, "https://..." = an image on the web,
// "/api/assets/images/x.png" = the image it already has (treated as "keep": an asset can never
// point at another asset's uploaded file, so deleting one asset cannot delete another's picture).
// Returns { path } with the value to store (or undefined to keep), and saves new uploads to disk.
function saveImage(image) {
  if (image === undefined) return { path: undefined };
  if (image === null || image === '') return { path: null };
  if (typeof image !== 'string') throw new ApiError(400, 'Image must be a JPG or PNG file');
  if (image.startsWith(IMAGE_URL_PREFIX)) return { path: undefined };
  if (/^https?:\/\//i.test(image)) {
    if (image.length > 255) throw new ApiError(400, 'Image link is too long (255 characters at most)');
    return { path: image };
  }
  const match = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=\s]+)$/i.exec(image);
  if (!match) throw new ApiError(400, 'Image must be a JPG or PNG file');
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > C.MAX_IMAGE_SIZE_BYTES) throw new ApiError(400, 'Image is larger than 2 MB. Please choose a smaller picture');
  const type = detectImageType(buf);
  if (!type) throw new ApiError(400, 'Image must be a JPG or PNG file');
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const file = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${type}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
  return { path: IMAGE_URL_PREFIX + file, file };
}

// Deletes an uploaded image file that is no longer used (web links are left alone).
function removeImageFile(imagePath) {
  if (!imagePath || !imagePath.startsWith(IMAGE_URL_PREFIX)) return;
  const file = path.basename(imagePath);
  fs.rm(path.join(UPLOAD_DIR, file), { force: true }, () => {});
}

// An asset that is retired can no longer be lent (FR-AM-06, FR-MT-04). Inside the caller's
// transaction: cancels its Pending requests and its Approved bookings that were not collected.
// Returns the cancelled requests so the caller can notify the members after the commit.
async function cancelBookingsForRetired(conn, assetId) {
  const [rows] = await conn.query(
    `SELECT r.request_id, r.user_id, r.status, r.start_date, r.end_date, a.name AS asset_name
       FROM asset_requests r JOIN assets a ON a.asset_id = r.asset_id
      WHERE r.asset_id = ? AND (r.status = 'Pending'
         OR (r.status = 'Approved' AND NOT EXISTS (SELECT 1 FROM borrow_records b WHERE b.request_id = r.request_id)))
      FOR UPDATE`,
    [assetId]
  );
  if (rows.length) {
    await conn.query(
      `UPDATE asset_requests SET status = ?, rejection_reason = 'Asset retired', decided_at = COALESCE(decided_at, NOW())
        WHERE request_id IN (?)`,
      [C.REQUEST_STATUS.CANCELLED, rows.map((r) => r.request_id)]
    );
  }
  return rows;
}

async function notifyCancelled(rows) {
  await Promise.all(rows.map((r) =>
    notify(r.user_id, 'request_cancelled',
      `Your ${r.status === 'Approved' ? 'booking' : 'request'} for ${r.asset_name} (${fmtRange(r.start_date, r.end_date)}) was cancelled because the asset was retired.`)
  ));
}

module.exports = { UPLOAD_DIR, IMAGE_URL_PREFIX, saveImage, removeImageFile, cancelBookingsForRetired, notifyCancelled };
