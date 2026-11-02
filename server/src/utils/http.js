class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) throw new ApiError(400, `Missing required field(s): ${missing.join(', ')}`);
}

const notImplemented = (owner) => (req, res) =>
  res.status(501).json({ error: `Not implemented yet (owner: ${owner})` });

module.exports = { ApiError, requireFields, notImplemented };
