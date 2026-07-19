# Etap 0 — punkt bazowy przed redesignem v2

Data kontroli: 2026-07-19

## Identyfikacja wersji

- Aplikacja: Dzienniczek Hormonu
- Wersja: `1.0.13`
- Android `versionCode`: `3914`
- Pakiet Android: `pl.tomaszwolak.dzienniczekhormonuwzrostu`
- Źródło: przesłana paczka `Hormon-Wzrostu-APK-main.zip`
- SHA-256 oryginalnej paczki: `896ef9e81ad4c12ea4f332bdef96d9fb9775c1289c052679f3a789c0e4a3ed5a`
- Lokalna gałąź bazowa: `main`
- Lokalny commit bazowy: `7b00eb237b8fc7d89e8324508698d0841bdda8ab`
- Lokalna gałąź prac: `redesign-v2`
- Lokalny tag pełnego backupu: `baseline-v1.0.13`

Cała kontrola i wszystkie zmiany etapu 0 są wykonywane wyłącznie w lokalnej
kopii przesłanego ZIP-a. Pliki CMD służące do późniejszej ręcznej aktualizacji
i budowania przez GitHub pozostają niezmienione.

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

- [x] utworzenie kopii roboczej bez zmiany oryginalnego ZIP-a,
- [x] gałąź `redesign-v2`,
- [x] pełny backup źródeł,
- [x] lokalny tag `baseline-v1.0.13` w backupie repozytorium,
- [x] lista obecnych funkcji,
- [x] testy projektu po `npm run prepare:web`,
- [x] test eksportu i ponownego importu JSON,
- [!] lokalna budowa APK debug zablokowana przez brak Gradle i Android SDK API 36,
- [x] końcowy protokół kontroli i suma SHA-256 oryginalnego ZIP-a.

Szczegóły i pełny wynik znajdują się w `docs/ETAP_0_PROTOKOL_TESTOW.md`.
