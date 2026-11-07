# Обновления

Обычный цикл: изменить plugin source → увеличить manifest/package/lock/changelog version → пройти CI → вручную запустить Release → получить подписанный пакет и `.sig` → дождаться sync либо запустить его вручную → убедиться в успешном Pages deployment → обновить список Plugins в Termix. Termix кэширует реестр примерно 15 минут; обновления доступны только из того же registry, из которого установлен плагин.

Scheduler запускается в 00:17, 06:17, 12:17, 18:17 UTC, с возможными задержками GitHub. Для ручного sync дополнительный token не нужен.

## Необязательный немедленный запуск

Workflow реестра принимает `repository_dispatch` с `event_type: plugin-released`. Минимальный вариант остаётся без PAT: после plugin release вручную нажмите Run workflow в registry repository или дождитесь расписания.

Если хотите dispatch из plugin release, стандартный plugin `GITHUB_TOKEN` не может писать в другой repository. Создайте fine-grained token:

1. GitHub avatar → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
2. Resource owner: владелец реестра; Repository access: Only select repositories → Termix-Plugins-Registry.
3. Repository permissions: Contents → Read and write (требование GitHub для repository dispatch), Metadata → Read-only добавится автоматически. Установите короткий срок действия. При организации получите требуемое approval.
4. В plugin repository → Settings → Secrets and variables → Actions создайте secret `REGISTRY_DISPATCH_TOKEN`. Реестру этот secret не нужен.
5. После успешной публикации добавьте шаг, передавая token только через environment:

```yaml
- name: Notify custom registry
  env:
    GH_TOKEN: ${{ secrets.REGISTRY_DISPATCH_TOKEN }}
  run: |
    gh api --method POST repos/YOUR_OWNER/Termix-Plugins-Registry/dispatches -f event_type=plugin-released
```

Dispatch payload не определяет источники и URL: реестр всегда читает собственную конфигурацию и проверяет подписи. Token даёт больше полномочий, чем требуется чтению релизов, поэтому он **необязателен** и по умолчанию шаг отсутствует. GitHub API: [Create a repository dispatch event](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event).

Ротация token: создайте новый с теми же минимальными правами, замените secret в plugin repositories, проверьте dispatch, затем отзовите старый в личных Settings → Developer settings → Personal access tokens. Для отключения удалите шаг и secret и отзовите token; расписание продолжит работать.
