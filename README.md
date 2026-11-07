# Termix Plugins Registry

Независимый custom registry для нескольких плагинов Termix. Статический `index.json` строится из проверенных GitHub Releases и публикуется через GitHub Pages. Сервер, база данных и приватный ключ на стороне реестра не нужны.

Начальная `plugins.json` содержит пустой список источников; public key и production index намеренно отсутствуют. Шаблон — `plugins.example.json`. Синхронизация без настроенного ключа/подписанных релизов завершится ошибкой и не создаст фиктивный production index.

После настройки URL имеет вид `https://GITHUB_USERNAME.github.io/Termix-Plugins-Registry/index.json`. Все действия пользователя описаны в прилагаемом `SETUP_RU.md` уровнем выше; этот репозиторий также самодостаточен: [SETUP_GITHUB](docs/SETUP_GITHUB.md), [SIGNING](docs/SIGNING.md), [ADDING_PLUGINS](docs/ADDING_PLUGINS.md), [UPDATING](docs/UPDATING.md), [TROUBLESHOOTING](docs/TROUBLESHOOTING.md), [SECURITY](docs/SECURITY.md).

```bash
npm ci
npm test
npm run configure -- YOUR_GITHUB_OWNER /absolute/path/to/registry.pub
npm run sync
npm run validate
```

Перед sync должны существовать публичные подписанные releases перечисленных репозиториев. Локальная проверка без GitHub: `npm run fixture -- /tmp/termix-registry-demo`, затем `node scripts/validate.mjs /tmp/termix-registry-demo/index.json`. Это демонстрационный индекс с временным тестовым ключом; его не публикуйте и не добавляйте в Termix.

Генератор использует только подписанный манифест и changelog из архива. Проверяются официальный manifest validator, структура ustar/PAX, отсутствие ссылок/traversal/дубликатов, entry points, версия и имя файла, repository, тег `vX.Y.Z`, prerelease flag, Ed25519 над raw SHA-256 по формату официального CLI, вычисленные hash/размер и сведения GitHub. Полный индекс проверяется Ajv 2020 по включённой официальной схеме. Неизвестные capabilities отклоняются SDK, а не выводятся из README. Ограничения: пакет до 32 MiB, распакованный tar до 128 MiB, 10000 файлов; превышение приводит к явной ошибке.

Поддерживаются все доступные stable releases. Новые betas идут в `prereleases`; требования к ядру, которые не выполняет Termix 26.10.2, направляют версию в `gated`, как в официальном registry. Поэтому Host Web Launcher появится в `gated`, а не `versions`: современный Termix читает этот список. Beta старее последнего stable не предлагается. Порядок плагинов и semver детерминирован; `updatedAt` отражает время изменения содержимого индекса и сохраняется при повторном sync без изменений.

Workflow работает вручную, после изменения конфигурации на `main`, каждые 6 часов и по необязательному `repository_dispatch`. Стандартный token нужен только для чтения публичного GitHub API; секрет подписи отсутствует. Отдельный deploy job получает `pages: write` и `id-token: write`. Сборка должна полностью пройти перед загрузкой Pages artifact; при ошибке продолжает обслуживаться прошлый deployment.

Перед sync workflow восстанавливает прошлый индекс с Pages. Это закрепляет ID репозитория и hash опубликованных версий. Замена/удаление release вызывает ошибку; остальные старые версии сохраняются при каждом полном чтении истории. Источники можно удалить из конфигурации явно. Отказ всего sync при недоступности GitHub/API/официального списка ID — осознанная защита от публикации частичного индекса. Неизменяемость работает при наличии предыдущего Pages index; после утраты Pages/state сначала восстановите доверенную копию, как описано в SECURITY.

Reserved IDs загружаются из актуального официального index плюс известные зарезервированные ID ядра. Один ID в двух репозиториях запрещён. Добавление плагина требует только одной строки `repository` в `plugins.json`, подписанных файлов тем же ключом и запуска sync.

Архитектура соответствует [официальным registries](https://docs.termix.site/develop/registries/), формату [schema](https://github.com/Termix-SSH/Termix-Registry/blob/main/registry-index-schema.json) и исходникам [registry library](https://github.com/Termix-SSH/Termix-Registry/blob/main/scripts/lib.mjs). Включённая схема получена 6 ноября 2026 года; при её обновлении пересмотрите тесты. Подпись — base64 Ed25519 над **32 байтами digest**, не над hex-строкой и не над JSON-индексом. `NOTICE` и Apache-2.0 сохраняют атрибуцию.
