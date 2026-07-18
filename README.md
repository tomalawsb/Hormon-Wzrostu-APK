# Dzienniczek Hormonu — Android APK

**Wersja: v1.0.11**

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

<!-- trigger-fix-1.0.11 -->
