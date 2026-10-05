CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(80)  NOT NULL,
  email         VARCHAR(160) NOT NULL UNIQUE,
  phone         VARCHAR(30),
  city          VARCHAR(60)  NOT NULL DEFAULT 'Алматы',
  bio           VARCHAR(500) NOT NULL DEFAULT '',
  verification_status VARCHAR(16) NOT NULL DEFAULT 'not_required'
                CHECK (verification_status IN ('not_required','pending','verified','rejected')),
  password_hash TEXT         NOT NULL,
  role          VARCHAR(10)  NOT NULL DEFAULT 'user' CHECK (role IN ('user','master','admin')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id   SERIAL PRIMARY KEY,
  slug VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id            SERIAL PRIMARY KEY,
  master_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  category_id   INTEGER NOT NULL REFERENCES categories(id),
  title         VARCHAR(120) NOT NULL,
  description   VARCHAR(300) NOT NULL DEFAULT '',
  full_desc     TEXT         NOT NULL DEFAULT '',
  price         INTEGER      NOT NULL CHECK (price >= 0),
  duration      VARCHAR(40)  NOT NULL DEFAULT '',
  duration_minutes INTEGER   NOT NULL DEFAULT 120 CHECK (duration_minutes BETWEEN 30 AND 720),
  city          VARCHAR(60)  NOT NULL DEFAULT 'Алматы',
  km            INTEGER      NOT NULL DEFAULT 0,
  badge         VARCHAR(40),
  icon          VARCHAR(8)   NOT NULL DEFAULT '🧹',
  provider_name VARCHAR(80)  NOT NULL DEFAULT '',
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category_id);
CREATE INDEX IF NOT EXISTS idx_services_master   ON services(master_id);

CREATE TABLE IF NOT EXISTS bookings (
  id            SERIAL PRIMARY KEY,
  service_id    INTEGER NOT NULL REFERENCES services(id),
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  address       VARCHAR(250) NOT NULL,
  comment       VARCHAR(500) NOT NULL DEFAULT '',
  price         INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 120 CHECK (duration_minutes BETWEEN 30 AND 720),
  payment_method VARCHAR(32) NOT NULL DEFAULT 'cash_after_service'
                CHECK (payment_method IN ('cash_after_service','card_after_service')),
  payment_status VARCHAR(16) NOT NULL DEFAULT 'due'
                CHECK (payment_status IN ('due','paid')),
  status        VARCHAR(12) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','confirmed','completed','cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookings_user    ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_service ON bookings(service_id);

CREATE TABLE IF NOT EXISTS reviews (
  id         SERIAL PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  rating     SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text       VARCHAR(1000) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  type       VARCHAR(40) NOT NULL,
  message    VARCHAR(300) NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
