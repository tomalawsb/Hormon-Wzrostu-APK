# Etap 11 — PWA i service worker

## Wdrożone

- osobne cache dla dokumentów HTML, JavaScriptu, CSS, JSON, ikon i API,
- `index.html` jako fallback wyłącznie dla nawigacji,
- odpowiedź JSON `503` w trybie offline zamiast błędnego dokumentu HTML,
- pełny zestaw zasobów pobierany przed podmianą aktywnego cache,
- usuwanie wyłącznie starych cache należących do aplikacji,
- informacja o oczekującej wersji PWA,
- kontrolowane zastosowanie nowego service workera i przeładowanie strony,
- ręczne sprawdzanie aktualizacji oraz odświeżanie zasobów,
- diagnostyka service workera, cache offline, połączenia i instalacji PWA,
- zachowanie zaszyfrowanego stanu przypomnień podczas aktualizacji cache.

## Testy automatyczne

```text
npm ci
npm test
npm run build:check
```

Test etapu 11 sprawdza strategie cache, fallbacki HTML/JSON, odświeżanie zasobów,
manifest, ikony 192×192 i 512×512 oraz mechanizm instalacji i aktualizacji.

## Kontrola ręczna po publikacji przez HTTPS

1. Otwórz aplikację online i sprawdź status „Gotowy do pracy offline”.
2. Włącz tryb samolotowy, zamknij kartę i uruchom PWA ponownie.
3. Sprawdź ekran „Dzisiaj”, kalendarz, historię i ustawienia.
4. Przy nowej wersji sprawdź komunikat i przycisk „Zastosuj nową wersję”.
5. Użyj „Odśwież zasoby” i potwierdź ponowne uruchomienie aplikacji.
6. Zainstaluj PWA z przycisku aplikacji lub menu przeglądarki.

Test APK nie jest częścią tego etapu lokalnego.
