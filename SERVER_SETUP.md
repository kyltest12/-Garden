# Настройка аккаунтов и Google Таблицы

## 1. Установка

```powershell
npm.cmd install
```

## 2. Google Таблица

1. В [Google Cloud Console](https://console.cloud.google.com/) для своего проекта включи **Google Sheets API**  
   ([прямая ссылка на API](https://console.cloud.google.com/apis/library/sheets.googleapis.com)).
2. Создай service account и скачай JSON-ключ в папку проекта.
2. Скопируй `.env.example` в `.env` и укажи путь к ключу в `GOOGLE_APPLICATION_CREDENTIALS`.
3. **Вариант А (проще):** оставь `GOOGLE_SHEET_ID` пустым — при первом запуске сервер сам создаст таблицу и запишет ID в `.env`.
4. **Вариант Б:** создай свою Google Таблицу, дай service account доступ `Editor` (Share → email из JSON, поле `client_email`), вставь ID таблицы в `GOOGLE_SHEET_ID`.

При первом запуске сервер сам создаст вкладки:

- `users`
- `profiles`
- `saves`
- `sessions`
- `events`

Если `GOOGLE_SHEET_ID` не заполнен, сервер работает с локальным fallback-файлом `server/dev-data.json`.

## 3. Проверка подключения

```powershell
npm.cmd run check:sheets
```

Если всё настроено, команда выведет ссылку на таблицу.

## 4. Запуск

```powershell
npm.cmd start
```

Открой игру по адресу:

```text
http://localhost:3000
```

## 5. Что сохраняется

- аккаунт игрока;
- хеш пароля;
- никнейм;
- деньги;
- посаженные и собранные растения;
- общий заработок;
- открытые грядки;
- полный сейв сада;
- магазин семян;
- онлайн-время через heartbeat раз в 30 секунд.
