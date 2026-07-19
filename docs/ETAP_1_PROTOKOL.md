# Etap 1 — porządek w projekcie i testach

Data kontroli: 2026-07-19

## Wdrożone

- `npm test` sam uruchamia `prepare:web`,
- dodano ESLint 10 i Prettier 3,
- dodano Android Lint (`lintDebug`),
- kontrola Androida buduje `app-debug.apk` i sprawdza, czy plik istnieje,
- w CI brak Android SDK albo brak APK kończy test błędem,
- uporządkowano skrypty `build`, `prepare:web`, `lint` i `test`,
- test eksportu/importu JSON jest częścią `npm test`,
- rozszerzono kontrolę zgodności wersji Android, npm, PWA, HTML i service workera,
- usunięto nieużywane funkcje JavaScript oraz jednorazowe skrypty starych wydań,
- usunięto stary workflow poprawki 1.0.7,
- pliki CMD i PS1 użytkownika pozostawiono bez zmian.

## Wynik lokalny

```text
npm ci    — OK
npm test  — OK
ESLint    — OK
Prettier  — OK
PWA       — OK
JSON      — OK
```

Android Lint i fizyczna budowa APK nie zostały uruchomione lokalnie, ponieważ
środowisko nie ma Android SDK. Kontrola jest włączona w `npm test`; workflow CI
ustawia `ANDROID_CHECK_REQUIRED=1`, więc nie może jej pominąć.
