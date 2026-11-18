const jwt = require('jsonwebtoken');

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try { jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Please sign in again.' }); }
}
const isImage = s => typeof s === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(s);
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const makeRef = () => 'TD-' + Math.random().toString(36).slice(2, 8).toUpperCase();
module.exports = { requireAdmin, isImage, wrap, makeRef };
