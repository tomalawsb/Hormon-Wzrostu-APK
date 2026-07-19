# Etap 0 — protokół kontroli wersji bazowej

Data: 2026-07-19

## Zakres

Kontrolę wykonano wyłącznie na lokalnej kopii przesłanej paczki. Oryginalny ZIP
nie został zmieniony. Nie wykonywano żadnych operacji na GitHubie.

## Punkt bazowy

- wersja aplikacji: `1.0.13`,
- Android `versionCode`: `3914`,
- pakiet Android: `pl.tomaszwolak.dzienniczekhormonuwzrostu`,
- lokalna gałąź bazowa: `main`,
- lokalny commit bazowy: `7b00eb237b8fc7d89e8324508698d0841bdda8ab`,
- lokalny tag: `baseline-v1.0.13`,
- lokalna gałąź robocza: `redesign-v2`,
- SHA-256 oryginalnego ZIP-a:
  `896ef9e81ad4c12ea4f332bdef96d9fb9775c1289c052679f3a789c0e4a3ed5a`.

## Niezmienione skrypty użytkownika

Porównano sumy SHA-256 z plikami w oryginalnej paczce. Wszystkie są identyczne:

- `AKTUALIZUJ_I_WYSLIJ.cmd`,
- `WYSYLAJ_NA_GITHUB.cmd`,
- `USTAW_WERSJE.cmd`,
- `KONFIGURUJ_PODPIS.cmd`,
- `KONFIGURUJ_PODPIS.ps1`.

## Test świeżo rozpakowanego projektu

Środowisko kontroli:

- Node.js `24.14.0`,
- npm `11.9.0`,
- Java `17.0.19`.

Wyniki:

1. `npm ci --no-audit --no-fund` — **OK**.
2. `npm test` bez wcześniejszego przygotowania — **NIE PRZECHODZI**.
   Przyczyna: po świeżym rozpakowaniu nie istnieje `www/index.html`, a
   `tests/smoke_test.py` wymaga zsynchronizowanych zasobów `www` i Androida.
   Jest to potwierdzony punkt do naprawy w etapie 1.
3. `npm run prepare:web` — **OK**:
   - połączono 19 modułów,
   - wynikowy `app.js`: 291974 bajty,
   - SHA-256 `app.js`:
     `f0cb84a672c2d665da70f2351a29f4e6b371984e371d7d781869bd7c54540968`,
   - utworzono 9 plików `www`,
   - zsynchronizowano zasoby WebView Androida.
4. `npm test` po `npm run prepare:web` — **OK**:
   - spójność modułów — OK,
   - test projektu — OK,
   - wersjonowanie i migracja danych — OK,
   - test HTTP PWA — OK.

## Test eksportu i ponownego importu JSON

Dodano powtarzalny test `tests/backup_roundtrip_test.js` i uruchomiono go przez:

```text
node tests/backup_roundtrip_test.js
```

Wynik — **OK**:

- pełny eksport i import jednego profilu,
- zachowanie dwóch wpisów, w tym pominiętej dawki,
- zachowanie ampułki i powiązania wpisu z ampułką,
- eksport pojedynczego profilu w trybie dodawania profilu,
- odrzucenie importu wskazującego nieistniejącą ampułkę.

## APK debug

Projekt wymaga Gradle `8.14.3`, Android Gradle Plugin `8.13.0` oraz Android SDK
API 36. W lokalnym środowisku kontroli nie ma dystrybucji Gradle ani Android
SDK. Próba uruchomienia wrappera zatrzymała się na pobieraniu Gradle z powodu
braku dostępu sieciowego do `services.gradle.org`.

Dlatego fizyczny plik APK debug **nie został zbudowany w tym środowisku**.
Konfiguracja Androida została sprawdzona testem projektu, a oryginalne pliki CMD
i workflow służące do późniejszej ręcznej wysyłki i budowania na GitHubie
pozostawiono bez zmian.

## Werdykt

Punkt bazowy jest zabezpieczony i nadaje się do rozpoczęcia etapu 1. Testy
źródeł, PWA oraz eksportu/importu przechodzą po wykonaniu `prepare:web`.
Potwierdzono dwa ograniczenia wersji bazowej:

1. `npm test` nie przygotowuje sam zasobów webowych — poprawa w etapie 1.
2. APK należy zbudować w środowisku posiadającym Android SDK API 36 albo przez
   zachowane skrypty użytkownika po jego ręcznej aktualizacji GitHuba.
