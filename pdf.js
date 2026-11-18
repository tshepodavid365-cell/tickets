const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const path = require('path');

const C = { bg: '#150b0f', panel: '#24121a', coral: '#e5524f', cream: '#f4eae2', muted: '#b58f93' };
const W = 612, H = 270, SPLIT = 430;

async function buildTicketsPdf(order, event, stream) {
  const doc = new PDFDocument({ size: [W, H], margin: 0, info: { Title: `tai_deli tickets ${order.ref}` } });
  doc.pipe(stream);
  const when = new Date(event.date).toLocaleString('en-ZA', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Johannesburg' });

  for (let i = 0; i < order.tickets.length; i++) {
    const t = order.tickets[i];
    if (i) doc.addPage({ size: [W, H], margin: 0 });
    doc.rect(0, 0, W, H).fill(C.bg);
    doc.rect(0, 0, W, 6).fill(C.coral);
    doc.rect(SPLIT, 6, W - SPLIT, H - 6).fill(C.panel);

    try { doc.image(path.join(__dirname, 'logo.png'), 28, 24, { width: 120 }); } catch (_) {}

    doc.fillColor(C.cream).font('Helvetica-Bold').fontSize(22).text(event.title, 28, 100, { width: SPLIT - 56, height: 56, ellipsis: true });
    doc.fillColor(C.muted).font('Helvetica').fontSize(10).text(when, 28, 150, { width: SPLIT - 56 });
    if (event.venue) doc.text(event.venue, 28, 165, { width: SPLIT - 56 });

    doc.fillColor(C.coral).font('Helvetica-Bold').fontSize(9).text('TICKET', 28, 196);
    doc.fillColor(C.cream).fontSize(13).text(t.type, 28, 208, { width: 180 });
    doc.fillColor(C.coral).fontSize(9).text('GUEST', 220, 196);
    doc.fillColor(C.cream).fontSize(13).text(order.name, 220, 208, { width: 190, ellipsis: true });

    doc.fillColor(C.muted).font('Helvetica-Oblique').fontSize(8)
      .text('Good music. Great food. Fierce fashion.', 28, H - 24, { width: SPLIT - 56 });

    doc.save().dash(3, { space: 4 }).strokeColor(C.muted).moveTo(SPLIT, 14).lineTo(SPLIT, H - 8).stroke().restore();

    const qr = await QRCode.toBuffer(t.code, { margin: 1, width: 240, color: { dark: C.bg, light: C.cream } });
    doc.image(qr, SPLIT + 24, 40, { width: 134 });
    doc.fillColor(C.cream).font('Helvetica-Bold').fontSize(10).text(t.code, SPLIT, 188, { width: W - SPLIT, align: 'center' });
    doc.fillColor(C.muted).font('Helvetica').fontSize(8).text(`Ticket ${i + 1} of ${order.tickets.length}`, SPLIT, 204, { width: W - SPLIT, align: 'center' });
    doc.text('Show this code at the door', SPLIT, 218, { width: W - SPLIT, align: 'center' });
  }
  doc.end();
}
module.exports = { buildTicketsPdf };
