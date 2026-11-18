require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const origins = (process.env.FRONTEND_ORIGIN || '*').split(',').map(s => s.trim());
app.use(cors({ origin: origins.includes('*') ? true : origins }));
app.use(express.json({ limit: '12mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', require('./routes/public'));
app.use('/api/admin', require('./routes/admin'));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong' });
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => app.listen(process.env.PORT || 3000, () => console.log('tai_deli API on port ' + (process.env.PORT || 3000))))
  .catch(e => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
