# Etap 7 — kalendarz i historia

Etap wykonano lokalnie na kopii projektu z etapu 6. Nie używano GitHuba i nie budowano APK.

## Kalendarz

- główny widok miesięczny z podsumowaniem podań i pominięć,
- czytelne kolory i etykiety statusów dni,
- szybki przycisk „Dzisiaj”,
- filtrowanie według profilu,
- legenda statusów i profili,
- szczegóły dnia po kliknięciu wraz z edycją wpisu.

## Historia

- chronologiczna lista grupowana według dat,
- wyszukiwanie po dacie, miejscu, profilu i uwadze,
- filtry profilu, statusu, miejsca oraz poprawek,
- szybkie czyszczenie filtrów,
- wyraźne rozróżnienie podań i pominięć,
- edycja i usuwanie wpisów,
- automatyczne oznaczenie „Poprawiono” po edycji istniejącego wpisu.

## Dane i testy

- schemat danych podniesiono do wersji 12,
- pole `correctedAt` jest walidowane i zachowywane w eksporcie/importcie,
- dodano testy statyczne i działania kalendarza oraz historii,
- test etapu: `npm run test:calendar-history`.
