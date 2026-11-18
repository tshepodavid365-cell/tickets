const { Order } = require('./models');

// Tickets already taken (pending + approved) per ticket type for an event.
async function soldByType(eventId) {
  const orders = await Order.find({ event: eventId, status: { $ne: 'rejected' } });
  const sold = {};
  orders.forEach(o => o.items.forEach(i => { sold[i.type] = (sold[i.type] || 0) + i.qty; }));
  return sold;
}
async function withAvailability(ev) {
  const sold = await soldByType(ev._id);
  const o = ev.toObject();
  o.ticketTypes = o.ticketTypes.map(t => ({ ...t, available: Math.max(0, t.quantity - (sold[t.name] || 0)) }));
  return o;
}
module.exports = { soldByType, withAvailability };
