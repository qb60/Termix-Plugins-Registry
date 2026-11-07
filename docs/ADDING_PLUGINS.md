# Добавление плагинов

1. Создайте отдельный публичный репозиторий. У плагина должны быть уникальный ID, корректный `manifest.repository`, semver и changelog. Не используйте ID официальных плагинов или ядра.
2. Настройте в этом plugin repository тот же secret `TERMIX_PLUGIN_SIGNING_KEY` и public variable `REGISTRY_PUBLIC_KEY`, что у первого плагина.
3. Выпустите GitHub Release с тегом `vX.Y.Z`, одним `<id>-<version>.tmxplug` и точным `<id>-<version>.tmxplug.sig`. Метаданные берутся из пакета, поэтому произвольные capability любых поддерживаемых SDK категорий не нужно дублировать в конфигурации реестра.
4. Добавьте объект в `plugins.json`:

```json
{
  "repository": "YOUR_OWNER/Plugin-Another-Tool"
}
```

5. Commit/push в `main`; sync запускается автоматически. Либо Actions → Sync and deploy registry → Run workflow.
6. Проверьте `index.json` и Browse в Termix. Несколько stable versions сохраняются. Beta должна иметь semver prerelease и флаг This is a pre-release в GitHub; генератор проверяет их согласованность.

Две репозитории не могут владеть одним ID. Репозиторий не может сменить ID, пока существует предыдущий index; создайте новый repository/ID и явно измените список источников. Переименование владельца/репозитория — контролируемое изменение источников и manifest.repository в новых релизах; прежние подписанные manifest.repository останутся прежними, поэтому автоматическое переименование всей истории не поддерживается. Сохраните старый источник/релизы либо создайте новый plugin ID. Release без `.tmxplug` пропускается; release с неподписанным пакетом останавливает весь sync.

Private repositories в этом варианте не поддерживаются: GitHub Pages и download URLs рассчитаны на публичный доступ без пользовательских токенов. Новый неизвестный SDK capability потребует обновления pinned SDK в реестре, тестирования и commit lockfile; из README такие разрешения не угадываются.
