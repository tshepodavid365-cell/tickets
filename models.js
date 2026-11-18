const { Schema, model } = require('mongoose');

// Images are stored as data-URI strings (e.g. "data:image/jpeg;base64,...") straight in MongoDB.
const Event = model('Event', new Schema({
  title: { type: String, required: true },
  date: { type: Date, required: true },
  venue: String,
  description: String,
  image: String,
  active: { type: Boolean, default: true },
  ticketTypes: [{ name: String, price: Number, quantity: Number }]
}, { timestamps: true }));

const Order = model('Order', new Schema({
  ref: { type: String, unique: true, index: true },
  event: { type: Schema.Types.ObjectId, ref: 'Event' },
  name: String, email: String, phone: String,
  items: [{ type: { type: String }, qty: Number, price: Number }],
  total: Number,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  tickets: [{ code: String, type: { type: String }, checkedIn: { type: Boolean, default: false }, checkedInAt: Date }]
}, { timestamps: true }));

const Gallery = model('Gallery', new Schema({
  image: { type: String, required: true },
  caption: String
}, { timestamps: true }));

const MenuItem = model('MenuItem', new Schema({
  name: { type: String, required: true },
  category: { type: String, default: 'Mains' },
  description: String,
  price: Number,
  image: String,
  available: { type: Boolean, default: true }
}, { timestamps: true }));

const Setting = model('Setting', new Schema({ key: { type: String, unique: true }, value: Schema.Types.Mixed }));

const DEFAULTS = { currency: 'R', whatsapp: '', email: '', instagram: '', paymentInstructions: 'Pay by EFT or at the door, then send your reference.', heroVideo: '', heroImage: '' };
async function getSettings() {
  const rows = await Setting.find();
  return rows.reduce((o, r) => (o[r.key] = r.value, o), { ...DEFAULTS });
}

module.exports = { Event, Order, Gallery, MenuItem, Setting, getSettings, DEFAULTS };
