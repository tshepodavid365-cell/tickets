const router = require('express').Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Event, Order, Gallery, MenuItem, Setting, getSettings, DEFAULTS } = require('../models');
const { requireAdmin, isImage, wrap } = require('../middleware');
const { withAvailability } = require('../stock');
const { MAX_VIDEO_BYTES, MAX_PILLAR_VIDEO_BYTES, VIDEO_TYPES, PILLARS, pillarKey, getBucket } = require('../video');

router.post('/login', (req, res) => {
  if (!process.env.ADMIN_PASSWORD || req.body.password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password.' });
  res.json({ token: jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: '12h' }) });
});
router.use(requireAdmin);

const clean = (body, fields) => {
  const out = {};
  fields.forEach(f => { if (body[f] !== undefined) out[f] = body[f]; });
  if ('image' in out && out.image && !isImage(out.image)) delete out.image; // keep old image if value is not a new upload
  return out;
};

// Generic list / create / update / delete for Event, MenuItem, Gallery
function crud(path, Model, fields, sort) {
  router.get(path, wrap(async (_req, res) => {
    const rows = await Model.find().sort(sort);
    res.json(Model === Event ? await Promise.all(rows.map(withAvailability)) : rows);
  }));
  router.post(path, wrap(async (req, res) => res.json(await Model.create(clean(req.body, fields)))));
  router.put(path + '/:id', wrap(async (req, res) => {
    const data = clean(req.body, fields);
    if (req.body.image === '') data.image = '';
    res.json(await Model.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true }));
  }));
  router.delete(path + '/:id', wrap(async (req, res) => { await Model.findByIdAndDelete(req.params.id); res.json({ ok: true }); }));
}
crud('/events', Event, ['title', 'date', 'venue', 'description', 'image', 'active', 'ticketTypes'], '-date');
crud('/menu', MenuItem, ['name', 'category', 'description', 'price', 'image', 'available'], 'category name');
crud('/gallery', Gallery, ['image', 'caption'], '-createdAt');

// Ticket requests
router.get('/orders', wrap(async (_req, res) => res.json(await Order.find().populate('event', 'title date').sort('-createdAt'))));
router.post('/orders/:id/approve', wrap(async (req, res) => {
  const o = await Order.findById(req.params.id);
  if (!o) return res.status(404).json({ error: 'Request not found.' });
  if (!o.tickets.length) {
    let n = 0;
    o.items.forEach(i => { for (let k = 0; k < i.qty; k++) o.tickets.push({ code: `${o.ref}-${++n}`, type: i.type }); });
  }
  o.status = 'approved';
  await o.save();
  res.json(o);
}));
router.post('/orders/:id/reject', wrap(async (req, res) => res.json(await Order.findByIdAndUpdate(req.params.id, { status: 'rejected' }, { new: true }))));
router.delete('/orders/:id', wrap(async (req, res) => { await Order.findByIdAndDelete(req.params.id); res.json({ ok: true }); }));

// Door check-in
router.post('/checkin', wrap(async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const o = await Order.findOne({ 'tickets.code': code, status: 'approved' }).populate('event', 'title');
  if (!o) return res.status(404).json({ result: 'invalid', message: 'Ticket not found or not released.' });
  const t = o.tickets.find(x => x.code === code);
  const info = { name: o.name, type: t.type, event: o.event?.title };
  if (t.checkedIn) return res.status(409).json({ result: 'used', message: 'Already checked in.', checkedInAt: t.checkedInAt, ...info });
  t.checkedIn = true; t.checkedInAt = new Date();
  await o.save();
  res.json({ result: 'ok', message: 'Welcome in.', ...info });
}));

// Settings
const limits = () => ({ maxVideoMB: Math.round(MAX_VIDEO_BYTES / 1048576), maxPillarVideoMB: Math.round(MAX_PILLAR_VIDEO_BYTES / 1048576) });
router.get('/settings', wrap(async (_req, res) => res.json({ ...(await getSettings()), ...limits() })));
router.put('/settings', wrap(async (req, res) => {
  for (const k of Object.keys(DEFAULTS)) {
    if (req.body[k] === undefined) continue;
    if (k === 'heroImage' && req.body[k] && !isImage(req.body[k])) continue;
    await Setting.findOneAndUpdate({ key: k }, { value: req.body[k] }, { upsert: true });
  }
  res.json(await getSettings());
}));

// Video uploads (raw request body streamed into MongoDB GridFS, so no extra disk or package is needed).
// One helper serves the hero video and the three homepage section videos; each lives under its own Setting key.
const dropVideo = async old => { if (old?.id) { try { await getBucket().delete(new mongoose.Types.ObjectId(old.id)); } catch {} } };
const receiveVideo = (key, maxBytes) => wrap(async (req, res) => {
  const maxMB = Math.round(maxBytes / 1048576);
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!VIDEO_TYPES.includes(type)) return res.status(415).json({ error: 'Upload an MP4, WebM or MOV video.' });
  const declared = parseInt(req.headers['content-length'], 10) || 0;
  if (declared > maxBytes) return res.status(413).json({ error: `Video is too large. The limit is ${maxMB} MB.` });
  let name = 'video';
  try { name = decodeURIComponent(req.headers['x-filename'] || name).slice(0, 120); } catch {}

  const up = getBucket().openUploadStream(key, { contentType: type, metadata: { name } });
  let size = 0, failed = false;
  const fail = (code, msg) => {
    if (failed) return; failed = true;
    req.unpipe(up); up.abort().catch(() => {});
    if (!res.headersSent) res.status(code).json({ error: msg });
    req.resume();
  };
  req.on('data', c => { size += c.length; if (size > maxBytes) fail(413, `Video is too large. The limit is ${maxMB} MB.`); });
  req.on('aborted', () => { failed = true; up.abort().catch(() => {}); });
  up.on('error', () => fail(500, 'Could not save the video. Please try again.'));
  up.on('finish', async () => {
    if (failed) return;
    try {
      const old = (await Setting.findOne({ key }))?.value;
      await Setting.findOneAndUpdate({ key }, { value: { id: String(up.id), name, size, type, at: Date.now() } }, { upsert: true });
      await dropVideo(old);
      res.json({ ...(await getSettings()), ...limits() });
    } catch (e) { res.status(500).json({ error: 'Could not save the video. Please try again.' }); }
  });
  req.pipe(up);
});
const removeVideo = key => wrap(async (_req, res) => {
  const old = (await Setting.findOne({ key }))?.value;
  await dropVideo(old);
  await Setting.deleteOne({ key });
  res.json({ ok: true });
});
const knownSlot = (req, res, next) => PILLARS.includes(req.params.slot) ? next() : res.status(404).json({ error: 'Unknown video slot.' });

router.put('/hero-video', receiveVideo('heroVideoFile', MAX_VIDEO_BYTES));
router.delete('/hero-video', removeVideo('heroVideoFile'));
router.put('/pillar-video/:slot', knownSlot, (req, res, next) => receiveVideo(pillarKey(req.params.slot), MAX_PILLAR_VIDEO_BYTES)(req, res, next));
router.delete('/pillar-video/:slot', knownSlot, (req, res, next) => removeVideo(pillarKey(req.params.slot))(req, res, next));

module.exports = router;
