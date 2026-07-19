# Dzienniczek Hormonu — Android APK

**Wersja: v2.0-1907262242**

Numer po myślniku oznacza moment przygotowania wersji w formacie `DDMMRRHHMM`, czyli `1907262007` = 19 lipca 2026, godz. 20:07.

## Kontrola projektu od zera

```text
npm ci
npm test
```

`npm test` przygotowuje zasoby webowe, uruchamia ESLint, Prettier, testy PWA,
test eksportu/importu oraz kontrolę Android Lint i APK debug. Bez lokalnego
Android SDK część androidowa jest pomijana; w workflow CI jest obowiązkowa.

## Bezpieczeństwo danych

Dane medyczne są szyfrowane lokalnie. APK używa Android Keystore, a PWA
Web Crypto i IndexedDB. Nowe kopie danych są zapisywane jako pliki `.json` bez hasła; import starszych, zaszyfrowanych kopii `.ghbackup` nadal jest obsługiwany.
Opis wdrożenia i lista kontroli: [ETAP_2_BEZPIECZENSTWO.md](ETAP_2_BEZPIECZENSTWO.md).

## Bezpieczeństwo WebView

APK używa `WebViewAssetLoader`, zamkniętej listy lokalnych zasobów, blokady obcej
nawigacji i ograniczonego mostu JavaScript–Android. PWA i dokument APK mają CSP.
Opis wdrożenia: [ETAP_3_WEBVIEW.md](ETAP_3_WEBVIEW.md).

## Architektura interfejsu

Kod, HTML i CSS są składane z części przypisanych do ekranów, komponentów oraz
usług. Zmiany wykonuje się w `src/`, a `app.js`, `index.html` i `style.css` są
plikami wynikowymi. Opis struktury: [ETAP_4_ARCHITEKTURA.md](ETAP_4_ARCHITEKTURA.md).

## System wizualny

Interfejs korzysta ze wspólnych tokenów kolorów, odstępów, typografii i stanów
komponentów. Dostępne są motywy jasny, ciemny i automatyczny, zgodny z telefonem.
Ikony interfejsu pochodzą z jednego sprite'a SVG. Opis wdrożenia:
[ETAP_5_SYSTEM_WIZUALNY.md](ETAP_5_SYSTEM_WIZUALNY.md).

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

Skrypt `AKTUALIZUJ_I_WYSLIJ.cmd` przed testami automatycznie poprawia formatowanie plików zmienianych przez numer wersji.
