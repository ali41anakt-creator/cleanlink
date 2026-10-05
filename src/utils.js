class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Оборачивает async-обработчик, чтобы ошибки попадали в error middleware
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const str = (v, { min = 0, max = 255, field = 'поле' } = {}) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min) throw new HttpError(400, `Поле «${field}» обязательно (мин. ${min} симв.)`);
  if (s.length > max) throw new HttpError(400, `Поле «${field}» слишком длинное (макс. ${max})`);
  return s;
};

const int = (v, { min = 0, max = 100000000, field = 'число' } = {}) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `Поле «${field}» должно быть целым числом от ${min} до ${max}`);
  }
  return n;
};

const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Некорректный идентификатор');
  return n;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = { HttpError, wrap, str, int, id, EMAIL_RE };
