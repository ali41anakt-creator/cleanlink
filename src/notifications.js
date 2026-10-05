const db = require('./db');

async function notify(userId, type, message, bookingId = null) {
  if (!userId) return;
  await db.query(
    'INSERT INTO notifications (user_id, booking_id, type, message) VALUES ($1,$2,$3,$4)',
    [userId, bookingId, type, message.slice(0, 300)],
  );
}

module.exports = { notify };
