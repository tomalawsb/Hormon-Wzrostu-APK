# Etap 8 — profil i statystyki

Etap wykonano lokalnie na kopii projektu z etapu 7. Nie używano GitHuba i nie budowano APK.

## Profil dziecka

- aktualna dawka i automatyczna historia jej zmian,
- lekarz prowadzący, placówka, preparat i informacje medyczne,
- data urodzenia,
- pomiary wzrostu i masy z porównaniem do poprzedniego pomiaru.

## Statystyki

- wykres ostatnich 30 monitorowanych dni,
- osobne statusy: podano, pominięto i brak wpisu,
- procent regularności oraz kompletności dokumentacji,
- liczba rozpoczętych i zakończonych ampułek,
- zarejestrowane zużycie leku i pozostała ilość w aktywnej ampułce.

## Raport dla lekarza

- dane medyczne i aktualna dawka,
- ostatnie pomiary i historia zmian dawki,
- regularność podań oraz zużycie ampułek,
- pełna historia podań,
- podgląd do druku oraz eksport PDF i Word.

## Dane i testy

- schemat danych podniesiono do wersji 13,
- nowe dane są walidowane, szyfrowane i zachowywane w kopii zapasowej,
- dodano testy statyczne i działania profilu, statystyk oraz raportu,
- test etapu: `npm run test:profile-stats`.
