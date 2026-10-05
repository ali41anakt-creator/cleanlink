# CleanLink — backend + фронтенд

Маркетплейс клининговых услуг: **Node.js / Express / PostgreSQL**, JWT-авторизация, три роли
(`user` — клиент, `master` — мастер, `admin` — администратор). Фронтенд (`public/`) отдаётся
тем же сервером и работает с API.

## Быстрый старт (локально)

Нужны Node.js 18+ и PostgreSQL 14+.

```bash
# 1. База данных
createuser cleanlink --pwprompt          # пароль, например cleanlink_pass
createdb cleanlink -O cleanlink

# 2. Настройка
cp .env.example .env                     # поправьте DATABASE_URL, JWT_SECRET, ADMIN_*
npm install

# 3. Таблицы + начальные данные (повторный запуск безопасен)
npm run db:init

# 4. Запуск
npm start                                # http://localhost:3000
```

Сгенерировать JWT_SECRET:
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

Проверка всего API одной командой (сервер должен быть запущен): `npm run test:smoke`

## Запуск через Docker

```bash
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
export ADMIN_PASSWORD='придумайте_пароль'
docker compose up --build
```

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | строка подключения к PostgreSQL |
| `DATABASE_SSL` | `true` для облачных БД (Render, Railway, Neon, Supabase) |
| `JWT_SECRET` | секрет подписи токенов (в production обязателен) |
| `JWT_EXPIRES_IN` | срок жизни токена, по умолчанию `7d` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | первый администратор, создаётся при `db:init` |
| `SEED_DEMO` | `true` — залить 8 демо-услуг и 3 отзыва (только в пустую таблицу услуг) |

## Структура БД

`users` (роль, bcrypt-хэш) · `categories` · `services` (мягкое удаление `is_active`) ·
`bookings` (статусы `pending → confirmed → completed`, либо `cancelled`; цена и длительность фиксируются на момент заказа, пересекающиеся слоты мастера запрещены) ·
`reviews` (один отзыв на пару клиент+услуга). Рейтинг считается из отзывов, а не хранится.
Схема: `db/schema.sql`.

## API

| Метод и путь | Доступ | Описание |
|---|---|---|
| `POST /api/auth/register` | все | регистрация (`role`: `user` или `master`) |
| `POST /api/auth/login` | все | вход, возвращает `token` |
| `GET /api/auth/me` | вошедшие | текущий пользователь |
| `GET /api/categories` | все | категории |
| `GET /api/services?category=&search=&maxPrice=&minRating=` | все | каталог с фильтрами |
| `GET /api/services/:id` | все | карточка, отзывы, `canReview` |
| `GET /api/services/mine` | мастер, админ | свои услуги (админ — все) |
| `POST /api/services` · `PUT/DELETE /api/services/:id` | мастер (свои), админ | управление услугами |
| `POST /api/services/:id/reviews` | клиент после выполненного заказа | отзыв |
| `POST /api/bookings` | клиент | создать заказ (не раньше чем через час) |
| `GET /api/bookings/my` | клиент | мои заказы |
| `GET /api/bookings/incoming` | мастер, админ | заказы на мои услуги |
| `PATCH /api/bookings/:id/status` | клиент (отмена), мастер/админ | смена статуса по допустимым переходам |
| `PATCH /api/bookings/:id/payment` | мастер, админ | отметить оплату после выполненной услуги |
| `GET /api/notifications` | вошедшие | последние внутренние уведомления |
| `GET /api/admin/stats` · `GET /api/admin/users` | админ | статистика, пользователи |
| `PATCH /api/admin/users/:id/role` · `DELETE /api/admin/users/:id` | админ | роли, удаление |
| `GET /api/health` | все | проверка сервера и БД |

Токен передаётся в заголовке `Authorization: Bearer <token>`.

## Как пройти весь сценарий

1. Зарегистрируйтесь как **мастер** → администратор подтвердит профиль → «Кабинет мастера» → добавьте услугу.
2. В другом браузере (или после выхода) зарегистрируйтесь как **клиент** → выберите услугу → «Забронировать».
3. Мастер подтверждает заказ, затем отмечает «Выполнено».
4. Клиент оставляет отзыв на странице услуги — рейтинг пересчитывается.
5. Админ (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) → «Админ-панель»: статистика, роли, удаление пользователей.

## Деплой (Render / Railway)

1. Создайте PostgreSQL-инстанс, возьмите его строку подключения → `DATABASE_URL`, `DATABASE_SSL=true`.
2. Сервис Web: build `npm install`, start `npm run db:init && npm start`.
3. Задайте `NODE_ENV=production`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

## Безопасность — что уже сделано

Пароли хэшируются bcrypt · параметризованные SQL-запросы · проверка роли при каждом запросе
(токен сверяется с БД, смена роли действует сразу) · нельзя стать админом через регистрацию ·
ограничение попыток входа · helmet · весь пользовательский текст экранируется на фронтенде (XSS).

Что стоит добавить перед настоящим запуском: HTTPS (обычно даёт хостинг), подтверждение email,
сброс пароля, подключение платёжного провайдера и внешних уведомлений, пагинацию каталога, бэкапы БД. CSP отключён из-за Tailwind CDN и inline-обработчиков —
при желании переведите Tailwind на сборку и включите CSP.
