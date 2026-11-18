const router = require('express').Router();
const mongoose = require('mongoose');
const { Event, Order, Gallery, MenuItem, Setting, getSettings } = require('../models');
const { getBucket, PILLARS, pillarKey } = require('../video');
const { withAvailability } = require('../stock');
const { buildTicketsPdf } = require('../pdf');
const { wrap, makeRef } = require('../middleware');

router.get('/settings', wrap(async (_req, res) => {
  const s = await getSettings();
  res.json({ currency: s.currency, whatsapp: s.whatsapp, email: s.email, instagram: s.instagram, paymentInstructions: s.paymentInstructions, heroVideo: s.heroVideo, heroVideoFile: s.heroVideoFile ? s.heroVideoFile.at : null, heroImage: s.heroImage,
    pillarVideos: Object.fromEntries(PILLARS.map(k => [k, s[pillarKey(k)] ? s[pillarKey(k)].at : null])) });
}));

router.get('/events', wrap(async (_req, res) => {
  const events = await Event.find({ active: true, date: { $gte: new Date(Date.now() - 6 * 3600e3) } }).sort('date');
  res.json(await Promise.all(events.map(withAvailability)));
}));

router.get('/menu', wrap(async (_req, res) => res.json(await MenuItem.find({ available: true }).sort('category name'))));
router.get('/gallery', wrap(async (_req, res) => res.json(await Gallery.find().sort('-createdAt'))));

router.post('/orders', wrap(async (req, res) => {
  const { eventId, name, email, phone, items } = req.body || {};
  if (!eventId || !name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '')) return res.status(400).json({ error: 'Enter your name and a valid email address.' });
  const ev = await Event.findById(eventId);
  if (!ev || !ev.active) return res.status(404).json({ error: 'This event is no longer available.' });
  const ev2 = await withAvailability(ev);

  const lines = [];
  for (const it of items || []) {
    const qty = parseInt(it.qty, 10);
    if (!qty || qty < 1) continue;
    const t = ev2.ticketTypes.find(x => x.name === it.type);
    if (!t) return res.status(400).json({ error: 'Unknown ticket type.' });
    if (qty > t.available) return res.status(409).json({ error: `Only ${t.available} "${t.name}" ticket(s) left.` });
    lines.push({ type: t.name, qty, price: t.price });
  }
  if (!lines.length) return res.status(400).json({ error: 'Choose at least one ticket.' });
  if (lines.reduce((n, l) => n + l.qty, 0) > 10) return res.status(400).json({ error: 'You can request up to 10 tickets at a time.' });

  const order = await Order.create({
    ref: makeRef(), event: ev._id, name: name.trim(), email: email.trim().toLowerCase(), phone: (phone || '').trim(),
    items: lines, total: lines.reduce((n, l) => n + l.qty * l.price, 0)
  });
  res.json({ ref: order.ref, total: order.total });
}));

async function findOrder(ref, email) {
  const o = await Order.findOne({ ref: String(ref || '').trim().toUpperCase(), email: String(email || '').trim().toLowerCase() }).populate('event');
  return o;
}

router.post('/orders/lookup', wrap(async (req, res) => {
  const o = await findOrder(req.body.ref, req.body.email);
  if (!o) return res.status(404).json({ error: 'No tickets found. Check your reference and email.' });
  res.json({ ref: o.ref, status: o.status, total: o.total, items: o.items, event: o.event && { title: o.event.title, date: o.event.date, venue: o.event.venue }, ticketCount: o.tickets.length });
}));

router.get('/orders/:ref/pdf', wrap(async (req, res) => {
  const o = await findOrder(req.params.ref, req.query.email);
  if (!o) return res.status(404).json({ error: 'Tickets not found.' });
  if (o.status !== 'approved') return res.status(403).json({ error: 'Your tickets are released once payment is confirmed.' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="tai_deli-${o.ref}.pdf"`);
  await buildTicketsPdf(o, o.event, res);
}));

// Streams an uploaded video (hero or section). Supports Range requests so browsers (especially iPhone Safari) can play and seek.
const streamVideo = key => wrap(async (req, res) => {
  const rec = (await Setting.findOne({ key }))?.value;
  if (!rec) return res.status(404).json({ error: 'No video uploaded.' });
  const id = new mongoose.Types.ObjectId(rec.id);
  const [file] = await getBucket().find({ _id: id }).toArray();
  if (!file) return res.status(404).json({ error: 'No video uploaded.' });
  const total = file.length, type = file.contentType || rec.type || 'video/mp4';
  res.set({ 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400', 'Cross-Origin-Resource-Policy': 'cross-origin' });
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && (m[1] || m[2])) {
    let start = m[1] ? parseInt(m[1], 10) : Math.max(0, total - parseInt(m[2], 10));
    let end = m[1] && m[2] ? parseInt(m[2], 10) : total - 1;
    end = Math.min(end, total - 1);
    if (start > end || start >= total) { res.set('Content-Range', `bytes */${total}`); return res.status(416).end(); }
    res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': end - start + 1 });
    return getBucket().openDownloadStream(id, { start, end: end + 1 }).on('error', () => res.destroy()).pipe(res);
  }
  res.set('Content-Length', total);
  getBucket().openDownloadStream(id).on('error', () => res.destroy()).pipe(res);
});

router.get('/hero-video', streamVideo('heroVideoFile'));
router.get('/pillar-video/:slot', (req, res, next) =>
  PILLARS.includes(req.params.slot) ? streamVideo(pillarKey(req.params.slot))(req, res, next) : res.status(404).json({ error: 'Unknown video.' }));

module.exports = router;
