const mongoose = require('mongoose');

// Largest hero video accepted (MB). Change with MAX_VIDEO_MB in .env.
const MAX_VIDEO_BYTES = (parseInt(process.env.MAX_VIDEO_MB, 10) || 100) * 1048576;
// Largest video accepted for each homepage section (MB). Change with MAX_PILLAR_VIDEO_MB in .env.
const MAX_PILLAR_VIDEO_BYTES = (parseInt(process.env.MAX_PILLAR_VIDEO_MB, 10) || 40) * 1048576;
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

// The three homepage sections that each get their own video: Good music, Great food, Fierce fashion.
const PILLARS = ['music', 'food', 'fashion'];
const pillarKey = slot => 'pillarVideo_' + slot;

const getBucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'media' });

module.exports = { MAX_VIDEO_BYTES, MAX_PILLAR_VIDEO_BYTES, VIDEO_TYPES, PILLARS, pillarKey, getBucket };
