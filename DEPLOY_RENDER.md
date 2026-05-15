# Деплой на Render (бесплатно, без карты Google Cloud)

## 1. GitHub

1. Создай репозиторий на https://github.com/new  
2. Залей проект (папка `garden`), **без** файлов:
   - `.env`
   - `garden-*.json` / `*-f01f9fa139cf.json`
   - `node_modules/`

В PowerShell (если git ещё не настроен в папке):

```powershell
cd "C:\Users\компьютер\Desktop\fullstack\Для себя\garden"
git init
git add .
git commit -m "Garden game"
git branch -M main
git remote add origin https://github.com/ТВОЙ_ЛОГИН/garden-game.git
git push -u origin main
```

---

## 2. Сервис на Render

1. https://dashboard.render.com → регистрация (можно через GitHub).
2. **New +** → **Web Service**.
3. Подключи репозиторий `garden-game`.
4. Настройки:

| Поле | Значение |
|------|----------|
| **Name** | `garden-game` |
| **Region** | Frankfurt (ближе к EU) |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | **Free** |

5. **Environment** → добавь переменные:

| Key | Value |
|-----|--------|
| `GOOGLE_SHEET_ID` | `12L9IehT-Q2RTE3W0illlA2i_ysmBs-6jXO5MEOGsQGU` |
| `JWT_SECRET` | длинный случайный секрет (не как локально) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `kyltest12@garden-496416.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | см. ниже |

### Как вставить `GOOGLE_PRIVATE_KEY`

Открой JSON-ключ service account. Скопируй значение поля `private_key` **целиком**, в одну строку, как в JSON (с `\n` внутри):

```text
-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQColuaz...\n-----END PRIVATE KEY-----\n
```

В Render вставь **без** внешних кавычек в поле Value.

6. **Create Web Service** — жди 3–5 минут.

---

## 3. Ссылка на игру

После деплоя будет URL вида:

```text
https://garden-game.onrender.com
```

Проверка:

- `https://garden-game.onrender.com/` — игра  
- `https://garden-game.onrender.com/api/status` — `"storage": "google-sheets"`

---

## 4. Google Sites

**Вставить** → **URL** → вставь Render URL.

---

## 5. Google Таблица

Таблица должна быть расшарена для  
`kyltest12@garden-496416.iam.gserviceaccount.com` с правом **Редактор** (как при локальном запуске).

---

## Бесплатный план Render

- Сервис **засыпает** после ~15 мин без посещений.
- Первый заход после сна — загрузка **30–60 секунд**.
- Для учебного проекта обычно достаточно.

---

## Ошибки

| Симптом | Решение |
|---------|---------|
| `storage: local` в `/api/status` | Проверь все 4 переменные окружения |
| Ошибка Google 403 | Sheets API включён; таблица расшарена service account |
| Build failed | В репозитории есть `package.json` и `package-lock.json` |
| Deploy OK, но 502 | Смотри **Logs** в Render Dashboard |

---

## Обновление сайта

Сделай `git push` в `main` — Render пересоберёт сервис сам.
