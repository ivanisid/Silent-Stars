# foundry-sync — арти з апки у Foundry VTT

> **Основний спосіб — без цього сервісу.** Якщо на сервері Foundry є File Browser, арти
> кладе туди функція Supabase `foundry-art-sync` (секрети `FILEBROWSER_URL`,
> `FILEBROWSER_USER`, `FILEBROWSER_PASSWORD`, `FILEBROWSER_DATA_PATH`, необов'язковий
> `ART_ROOT`). Цей окремий сервіс потрібен лише там, де File Browser немає, а доступ до
> сервера (SSH) є. Не запускайте обидва одночасно.

Гравець встановлює в апці, у профілі пілота, **портрет** («✎ ПОРТРЕТ» у шапці) і
**зображення кожного меха** («✎ ЗОБРАЖЕННЯ МЕХА» в панелі мехів) — як у COMP/CON.
Цей сервіс на сервері Foundry кладе їх у папку гравця з підпапкою на кожного пілота:

```
Data/pilots/<нік>/<позивний>/portrait.png
Data/pilots/<нік>/<позивний>/mech-<назва меха>.png
```

Папки створюються самі. Новий арт замінює старий під тим самим ім'ям, тож посилання в
токенах Foundry не ламаються (якщо Foundry показує старе зображення — оновіть сторінку,
це кеш браузера). Прибраний арт, видалений мех чи пілот — файл зникає і з Foundry.

В апці під артом видно його шлях у Foundry (клік — скопіювати), наприклад
`pilots/magellan/maker/portrait.png`: саме його вставляють у зображення токена чи актора.

## Встановлення на сервер (один раз)

Потрібен Node.js 18+ (він уже є, бо на ньому працює Foundry: `node -v`).

1. Скопіюйте папку `foundry-sync` на сервер, наприклад у `/home/foundry/foundry-sync`
   (через `scp`, `git clone` репозиторію чи WinSCP).
2. Встановіть залежність:
   ```bash
   cd /home/foundry/foundry-sync && npm install --omit=dev
   ```
3. Створіть `.env` з прикладу і заповніть:
   ```bash
   cp .env.example .env && nano .env
   ```
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase → **Project Settings → API → service_role**.
     Це секретний ключ: тільки в цьому файлі на сервері.
   - `FOUNDRY_DATA` — повний шлях до папки **Data** Foundry (де лежать `worlds/`, `modules/`).
     Якщо не певні: Foundry → **Setup → Configuration → User Data Path**, і до нього `/Data`.
4. Перевірка вручну:
   ```bash
   node index.mjs
   ```
   Має з'явитися `foundry-sync: /…/Data/pilots, кожні 15 с`. Завантажте арт в апці —
   за кілька секунд у консолі буде `+ pilots/<нік>/<файл>`. Зупинити: Ctrl+C.
5. Автозапуск через systemd (від імені того ж користувача, що й Foundry):
   ```bash
   sudo cp foundry-sync.service /etc/systemd/system/
   sudo nano /etc/systemd/system/foundry-sync.service   # User= і WorkingDirectory= — свої
   sudo systemctl daemon-reload && sudo systemctl enable --now foundry-sync
   ```
   Логи: `journalctl -u foundry-sync -f`.

Якщо Foundry запущено через Docker — `FOUNDRY_DATA` має вказувати на папку на хості,
змонтовану в контейнер як `/data` (тоді це `<папка на хості>/Data`).

## Як це влаштовано

- Файли зберігаються в приватному бакеті Supabase `pilot-art`, кожен гравець бачить лише свої.
- Таблиця `art_uploads`: `synced_at` / `foundry_path` заповнює цей сервіс; `deleted_at`
  ставить апка, коли гравець видаляє арт.
- Папки — латиницею: нік гравця (`Гліб` → `hlib`) і позивний пілота. Якщо нік уже
  зайнятий іншим гравцем, додається хвіст з ID.
- Таблиця `art_uploads`: `pilot_id` + `kind` (`portrait` / `mech`) + `mech_id` кажуть, чий це арт.
- Сервіс нічого не пише поза `FOUNDRY_DATA` і не перезаписує наявні файли.
