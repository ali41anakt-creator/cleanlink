-- Additive migration: existing users, services, bookings and reviews are preserved.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS extra_rate INTEGER NOT NULL DEFAULT 0 CHECK(extra_rate >= 0);
ALTER TABLE services ADD COLUMN IF NOT EXISTS included JSONB NOT NULL DEFAULT '[]';
ALTER TABLE services ADD COLUMN IF NOT EXISTS excluded JSONB NOT NULL DEFAULT '[]';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS master_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_title VARCHAR(120);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS area INTEGER NOT NULL DEFAULT 40;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '[]';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS phone VARCHAR(30) NOT NULL DEFAULT '';
UPDATE bookings b SET master_id=s.master_id, service_title=s.title
  FROM services s WHERE s.id=b.service_id AND b.service_title IS NULL;
CREATE INDEX IF NOT EXISTS idx_booking_master_time ON bookings(master_id, scheduled_at, status);
CREATE TABLE IF NOT EXISTS booking_events (
  id SERIAL PRIMARY KEY, booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  status VARCHAR(12) NOT NULL, actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
