# travel — поиск прямых рейсов (Telegram Mini App)

Поиск прямых рейсов между двумя аэропортами на выбранный месяц. Telegram-mini-app
с доступом только для разрешённых пользователей, история поиска привязана к юзеру.

## Стек

Next 16 (App Router) · React 19 · Prisma 6 (PostgreSQL) · Tailwind 4 · TypeScript.
Архитектура, telegram-auth и деплой зеркалят проект `translator`.

## Источник данных

Прототип использует **Ryanair `cheapestPerDay`** — публичный эндпоинт без ключа,
отдаёт цену по каждому дню маршрута за раз. Только прямые рейсы, пока только
Ryanair. Дальше — другие авиакомпании + логика стыковок (self-transfer,
соседний аэропорт + наземка).

Аэропорты — локальная копия базы [OurAirports](https://ourairports.com/data/)
(public domain), в таблице `airports`.

## Локальный запуск

```bash
npm install
# создать локальную БД travel и применить миграции
npx prisma migrate dev
# заполнить базу аэропортов
npm run seed:airports
npm run dev
```

`.env.local`: `DATABASE_URL`, `BOT_TOKEN` (BotFather), `ALLOWED_TG_IDS`
(comma-separated Telegram ids; пусто = открыто).

## Деплой

Push в `main` → GitHub Actions собирает, копирует на VPS, рестартит PM2
(`travel`, порт 8201). nginx — см. `nginx/travel.conf`.
