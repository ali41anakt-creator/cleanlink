const { HttpError, int } = require('./utils');
const EXTRAS = [
  { id: 'oven', name: 'Духовка внутри', price: 2000, minutes: 30, icon: 'oven' },
  { id: 'fridge', name: 'Холодильник внутри', price: 1500, minutes: 30, icon: 'fridge' },
  { id: 'windows', name: 'Окна · до 3 створок', price: 3500, minutes: 60, icon: 'window' },
  { id: 'balcony', name: 'Балкон · до 5 м²', price: 2000, minutes: 30, icon: 'sun' }
];
function quote(service, areaValue = 40, ids = []) {
  const area = int(areaValue, { min: 20, max: 300, field: 'Площадь' });
  if (!Array.isArray(ids) || ids.length > 4 || new Set(ids).size !== ids.length || ids.some(x => !EXTRAS.some(e => e.id === x))) {
    throw new HttpError(400, 'Некорректные дополнительные услуги');
  }
  const extras = EXTRAS.filter(e => ids.includes(e.id));
  const areaPrice = Math.max(area - 40, 0) * Number(service.extra_rate || 0);
  const duration = service.duration_minutes + Math.ceil(Math.max(area - 40, 0) / 20) * 30 + extras.reduce((sum, e) => sum + e.minutes, 0);
  if (duration > 660) throw new HttpError(400, 'Уборка займёт больше рабочего дня. Уменьшите площадь или дополнительные работы.');
  return { area, base: service.price, areaPrice, extras, duration, total: service.price + areaPrice + extras.reduce((sum, e) => sum + e.price, 0) };
}
function validateDay(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, 'Некорректная дата');
  const ms = Date.parse(`${day}T00:00:00+05:00`);
  if (!Number.isFinite(ms) || new Date(ms + 5 * 3600_000).toISOString().slice(0,10) !== day || ms + 86400_000 < Date.now() || ms > Date.now() + 90 * 86400_000) {
    throw new HttpError(400, 'Выберите дату в ближайшие 90 дней');
  }
  return day;
}
function availableSlots(day, duration, busy) {
  validateDay(day);
  const result = [];
  for (let minute = 9 * 60; minute + duration <= 20 * 60; minute += 30) {
    const time = `${String(Math.floor(minute / 60)).padStart(2,'0')}:${String(minute % 60).padStart(2,'0')}`;
    const start = new Date(`${day}T${time}:00+05:00`);
    const end = new Date(+start + duration * 60000);
    if (+start < Date.now() + 3600000) continue;
    if (busy.some(b => new Date(b.scheduled_at) < end && +new Date(b.scheduled_at) + b.duration_minutes * 60000 > +start)) continue;
    result.push({ time, startsAt: start.toISOString(), endsAt: end.toISOString() });
  }
  return result;
}
module.exports = { EXTRAS, quote, validateDay, availableSlots };
