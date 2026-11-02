function errorHandler(err, req, res, next) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This record already exists' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}

module.exports = errorHandler;
