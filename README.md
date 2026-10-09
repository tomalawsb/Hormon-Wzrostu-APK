# Dzienniczek Hormonu

**Wersja: v2.3.3**

Lokalny dzienniczek podań hormonu wzrostu dla dorosłego pacjenta lub opiekuna: historia podań, profile, pomiary, przypomnienia, ampułki, zapas i kopie danych. Aplikacja nie dobiera dawki i nie zastępuje porady lekarza.

- Repozytorium: https://github.com/tomalawsb/Hormon-Wzrostu-APK
- Gotowe pliki do pobrania: https://github.com/tomalawsb/Hormon-Wzrostu-APK/releases/latest

## Na Windows — cztery pliki

| Plik                    | Co robi                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `BUILD.cmd`             | Buduje aplikację. Wynik obok pliku: `DzienniczekHormonu-2.3.3.apk` (telefon) i `.aab` (Google Play). |
| `URUCHOM.cmd`           | Otwiera podgląd aplikacji w przeglądarce (`http://localhost:8080/`, zatrzymanie: Ctrl+C).            |
| `KONFIGURUJ_PODPIS.cmd` | Tworzy lub importuje klucz podpisu (zapis poza projektem, w `%LOCALAPPDATA%`).                       |
| `WYSYLAJ_NA_GITHUB.cmd` | Wysyła źródła na GitHub; tam powstają APK/AAB w Releases.                                            |

Wystarczy: rozpakuj ZIP → uruchom `BUILD.cmd`. Bez skonfigurowanego podpisu powstaje tylko testowy `DzienniczekHormonu-2.3.3-debug.apk` (bez AAB) — skrypt to wypisze.

Dodatkowe opcje `BUILD.cmd` (przekazywane do `tools/dzienniczek.ps1`):

- `BUILD.cmd -SetVersion 2.3.4 -VersionCode 2009002305` — nowa wersja i budowanie,
- `BUILD.cmd -Action Check` — tylko testy, Android Lint i APK debug,
- `BUILD.cmd -EnvironmentRoot "E:\Inne Środowiska"` — inny katalog narzędzi.

## Gdzie są narzędzia i pliki robocze

Projekt zawiera tylko kod, konfigurację i dokumentację. Wszystko inne jest w `D:\Users\Admin\Środowiska` (zmiana: `DH_ENVIRONMENT_ROOT` lub `-EnvironmentRoot`):

- wspólne: `NodeJS`, `Python`, `JDK_17`, `Android_SDK`, `Gradle`, `npm-cache`, `Pobrane_instalatory` — pobierane tylko, gdy ich brakuje (używany jest też systemowy Python ≥ 3.9 i Node ≥ 22),
- projekt: `DzienniczekHormonu\<identyfikator>\` — `work` (kopia robocza), `logs`, `tmp`, `release` (kopie APK/AAB, ZIP źródeł, sumy SHA-256).

**Polskie znaki w ścieżkach.** Gradle, JDK i launcher Pythona na Windows psują ścieżki z literą „Ś”. Dlatego skrypt tworzy alias ASCII (junction, bez uprawnień administratora) `D:\DH_Srodowiska` → `D:\Users\Admin\Środowiska` (zapasowo `C:\DH_Srodowiska`; własny: `DH_ASCII_ALIAS`) i wszystkie narzędzia pracują przez niego. Dane fizycznie zostają w `Środowiska`. Alias usuwa się poleceniem `rmdir D:\DH_Srodowiska` (usuwa tylko dowiązanie, nie dane). Projekt może leżeć w dowolnym folderze, także ze spacjami i polskimi znakami.

Nie uruchamiaj `npm install` ani Gradle w folderze projektu.

## Podpis i wersja

Zachowaj dotychczasowy klucz aplikacji — nowy klucz uniemożliwia aktualizację już zainstalowanej aplikacji. Wzór konfiguracji: `android/signing.properties.example`. Nigdy nie dodawaj haseł ani klucza do ZIP lub Git.

Każde wydanie w Google Play wymaga większego versionCode (obecnie `2009002304`, limit 2100000000). Identyfikator `pl.tomaszwolak.dzienniczekhormonuwzrostu`, minSdk 24, targetSdk 36.

## GitHub Actions i Releases

Workflow `.github/workflows/android-ci.yml` uruchamia się przy PR, wysłaniu na `main`, tagu `v*` i ręcznie (Actions → Run workflow). Testuje projekt i buduje APK debug. Poza PR publikuje w **GitHub Releases** pod tagiem `vWERSJA`:

- z sekretami podpisu: `DzienniczekHormonu-WERSJA.apk` i `.aab`,
- bez sekretów: tylko testowy `DzienniczekHormonu-WERSJA-debug.apk`.

Sekrety (Settings → Secrets and variables → Actions; wartości przygotowuje `KONFIGURUJ_PODPIS.cmd` w pliku `GITHUB_SECRETS_DO_WKLEJENIA.txt`): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Jeżeli publikacja kończy się błędem uprawnień, włącz Settings → Actions → General → Workflow permissions → „Read and write permissions”. Ta sama wersja wysłana ponownie podmienia pliki w wydaniu; nowe wydanie wymaga nowej wersji.

## Budowa kodu

Źródła są w `src/` (`core`, `screens`, `components`, `services`, `platform`, `styles`, `shell`). Pliki `app.js`, `index.html` i `style.css` są składane w kopii roboczej według `src/module-order.json`, `src/html-order.json` i `src/styles/style-order.json` — nie edytuje się ich ręcznie. Testy: `tests/` (uruchamia je `BUILD.cmd`).

## Dokumentacja

- [ZMIANY.md](ZMIANY.md) — zmiany wersji.
- [GOOGLE_PLAY.md](GOOGLE_PLAY.md) — kroki publikacji w Google Play; tekst oferty: [store/listing-pl.md](store/listing-pl.md), grafiki: `store/graphics`.
- [privacy.html](privacy.html) — polityka prywatności do uzupełnienia i opublikowania.

Aplikacja nie została opublikowana w Google Play.
