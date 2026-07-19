# Etap 12 — testy końcowe

Etap 12 dodaje końcowy zestaw testów uruchamiany przez `npm test`. Lokalnie nie jest budowany APK.

## Kontrole automatyczne

- dotychczasowe testy jednostkowe i integracyjne etapów 1–11,
- migracja płaskich i profilowych danych ze starszych wersji,
- odrzucanie kopii z nieobsługiwanej przyszłej wersji,
- przebieg E2E w emulowanym DOM: start, zapis pominięcia, historia, profile, motyw i kalendarz,
- axe-core dla reguł WCAG A/AA możliwych do sprawdzenia bez silnika układu,
- unikalność identyfikatorów, etykiety dialogów, link pomijania i fokus klawiatury,
- układy responsywne, jasny/ciemny/systemowy motyw, ograniczenie animacji i wydruk,
- pełna, częściowo zużyta i pusta ampułka oraz blokada dawki ponad pozostałą objętość,
- orientacja pionowa i pozioma w konfiguracji PWA oraz Androida,
- strategie offline, aktualizacja zasobów i poprawna odpowiedź JSON bez sieci,
- konfiguracja Android 10–16, Android Lint oraz release APK/AAB w istniejącym workflow.

Uruchomienie od zera:

```text
npm ci
npm test
```

## Kontrole wymagające APK lub urządzenia

Po samodzielnym wysłaniu projektu i zbudowaniu APK należy ręcznie sprawdzić:

- mały i duży telefon oraz tablet,
- Android 10, 11, 12, 13, 14, 15 i 16,
- obie orientacje na prawdziwym urządzeniu,
- instalację, aktualizację i restart telefonu,
- uprawnienia powiadomień i dokładnych alarmów,
- testowe przypomnienie po restarcie i aktualizacji,
- TalkBack, obsługę klawiaturą i kontrast w prawdziwym WebView,
- podpisany release APK/AAB.

Tych punktów nie oznaczamy jako wykonane, dopóki nie zostaną sprawdzone na zbudowanej aplikacji.
