# Etap 0 — punkt bazowy przed redesignem v2

Data kontroli: 2026-07-19

## Identyfikacja wersji

- Aplikacja: Dzienniczek Hormonu
- Wersja: `1.0.13`
- Android `versionCode`: `3914`
- Pakiet Android: `pl.tomaszwolak.dzienniczekhormonuwzrostu`
- Repozytorium: `tomalawsb/Hormon-Wzrostu-APK`
- Bazowa gałąź GitHub: `main`
- Bazowy commit GitHub: `fd3bfb231634f2c4eba74cd6546f1c1643da4857`
- Gałąź prac: `redesign-v2`
- Lokalny tag pełnego backupu: `baseline-v1.0.13`

Uwaga: istniejący zdalny tag `v1.0.13` zawiera plik `app-version.json` z wersją
`1.0.12`. Nie został zmieniony ani usunięty. Właściwym punktem odniesienia dla
redesignu jest commit podany wyżej i tag `baseline-v1.0.13` w pełnym backupie.

## Obecne funkcje aplikacji

### Ekran Dzisiaj

- obsługa jednego lub wielu profili dzieci,
- podsumowanie dzisiejszej dawki, godziny, miejsca i ampułki,
- propozycja kolejnego miejsca wkłucia,
- szybkie potwierdzenie podania,
- zmiana danych wpisu i oznaczenie dawki jako pominiętej,
- ręczne dodawanie wpisu oraz obsługa głosowa.

### Profile i dawkowanie

- tworzenie, edycja, archiwizacja, przywracanie i usuwanie profili,
- osobne ustawienia dawkowania, przypomnień i ampułek dla każdego profilu,
- wybór ikony i koloru profilu,
- edytowalna kolejność miejsc wkłucia.

### Kalendarz i historia

- miesięczny kalendarz podań i pominięć,
- filtrowanie kalendarza według profilu,
- szczegóły wybranego dnia,
- chronologiczna historia,
- wyszukiwanie i filtrowanie według profilu, statusu i miejsca,
- edycja oraz usuwanie istniejących wpisów,
- zabezpieczenie przed kilkoma wpisami dla tego samego dnia i profilu.

### Ampułki

- rejestr ampułek aktywnych, odłożonych i zakończonych,
- numer, data rozpoczęcia, objętość i zużycie na podanie,
- automatyczne wyliczanie pozostałej ilości i liczby dawek,
- powiązanie podań z konkretną ampułką.

### Przypomnienia i uprawnienia

- przypomnienia osobno dla profili,
- obsługa powiadomień Android i dokładnych alarmów,
- odtwarzanie harmonogramu po restarcie telefonu,
- ekran zgód oraz test powiadomienia,
- obsługa mikrofonu dla komend głosowych.

### Raporty i kopie danych

- raporty PDF, Word i CSV,
- filtrowanie raportu według profilu i dat,
- pełny eksport JSON oraz eksport pojedynczego profilu,
- podgląd zawartości przed importem,
- walidacja wersji, profili, wpisów, ampułek i ich powiązań,
- migracja starszego formatu danych,
- automatyczna kopia bezpieczeństwa przed importem i możliwość jej przywrócenia.

### PWA i Android

- instalacja PWA i podstawowa praca offline,
- service worker i wersjonowany cache,
- natywna aplikacja Android oparta na WebView,
- most JavaScript–Android dla powiadomień, mikrofonu, plików i aktualizacji,
- sprawdzanie nowych wydań APK na GitHubie,
- automatyczne budowanie APK/AAB przez GitHub Actions.

### Dostępność

- etykiety ARIA i komunikaty dla czytników ekranu,
- obsługa klawiatury i skrótów,
- duże elementy dotykowe oraz tryb responsywny telefonu i komputera.

## Znane ograniczenia punktu bazowego

- dane medyczne są nadal przechowywane w zwykłym `localStorage`,
- eksport JSON nie jest szyfrowany,
- WebView nie ma jeszcze docelowych ograniczeń planowanych w etapie 3,
- interfejs i style są nadal skupione w dużych plikach,
- `npm test` nie wykonuje jeszcze całego przygotowania plików webowych,
- brak Android SDK w lokalnym środowisku wymaga kontroli APK przez GitHub Actions.

## Kryteria zakończenia etapu 0

- [x] zgodność przesłanej paczki z aktualnym `main`,
- [x] gałąź `redesign-v2`,
- [x] pełny backup źródeł,
- [x] lokalny tag `baseline-v1.0.13` w backupie repozytorium,
- [x] lista obecnych funkcji,
- [ ] testy projektu,
- [ ] test eksportu i ponownego importu JSON,
- [ ] zbudowanie i sprawdzenie APK debug,
- [ ] końcowy protokół z sumami SHA-256.

Po zakończeniu kontroli ostatnie cztery pozycje zostaną uzupełnione w osobnym
protokole testów etapu 0.
