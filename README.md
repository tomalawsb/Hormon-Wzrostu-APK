# Dzienniczek Hormonu — Android APK

**Wersja: v1.0.7**

## Najprostsza aktualizacja

Po wprowadzeniu zmian uruchom `AKTUALIZUJ_I_WYSLIJ.cmd`. Skrypt sam:

- dobierze kolejny numer wersji, jeśli obecna wersja jest już wydana,
- zbuduje kompletne pliki PWA,
- uruchomi testy,
- wyśle projekt na GitHub.

GitHub Actions następnie zbuduje podpisane APK/AAB i utworzy wydanie.

Repozytorium źródłowe aplikacji Android i PWA. Po wysłaniu nowej wersji na gałąź `main` GitHub Actions:

1. buduje pliki webowe,
2. uruchamia testy,
3. buduje APK debug,
4. buduje podpisany APK i AAB,
5. automatycznie tworzy GitHub Release `vX.Y.Z`.

Aplikacja sprawdza najnowsze wydanie w:

`https://github.com/tomalawsb/Hormon-Wzrostu-APK/releases/latest`

## Pierwsza konfiguracja

1. Uruchom `KONFIGURUJ_PODPIS.cmd` i utwórz nowy klucz.
2. Dodaj cztery wartości z wygenerowanego pliku jako GitHub Actions Secrets.
3. Uruchom `WYSYLAJ_NA_GITHUB.cmd`, aby zastąpić starą zawartość repozytorium czystą paczką.
4. W zakładce Actions sprawdź, czy budowanie zakończyło się na zielono.
5. Pobierz APK z pierwszego wydania GitHub Releases.

## Następna wersja

1. Uruchom `USTAW_WERSJE.cmd`.
2. Podaj wyższą wersję, np. `1.0.8`, oraz wyższy `versionCode`, np. `3909`.
3. Uruchom `WYSYLAJ_NA_GITHUB.cmd`.
4. GitHub sam zbuduje i opublikuje nowe APK.
5. W aplikacji wybierz: `Więcej → Sprawdź aktualizacje`.

## Zmiany w wersji 1.0.7

- poprawiony układ PWA na szerokim ekranie,
- przyciski akcji przeniesione pod treść karty,
- panel z numerem wersji i przyciskiem aktualizacji widoczny na górze ustawień.

## Ważne

- Nigdy nie dodawaj do repozytorium plików `.p12`, `.jks`, `signing.properties` ani pliku z sekretami.
- Nie zgub klucza podpisującego. Wszystkie przyszłe aktualizacje muszą być podpisane tym samym kluczem.
- Przed pierwszą instalacją tej linii wydań możesz odinstalować starą aplikację i przywrócić dane z kopii JSON.
