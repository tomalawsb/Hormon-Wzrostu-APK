# Dzienniczek Hormonu

**Wersja: v2.3.2**

Lokalny dzienniczek dla dorosłego pacjenta lub opiekuna: historia podań, profile, pomiary, przypomnienia, ampułki, zapas i kopie danych. Aplikacja nie dobiera dawki i nie zastępuje porady lekarza.

## Uruchomienie i budowanie

Na Windows uruchom `BUDUJ.cmd`. Skrypt zawsze używa folderu, w którym się znajduje, bez względu na katalog otwartego terminala. Testuje źródła, buduje podpisany APK i Android App Bundle, weryfikuje podpisy i kopiuje gotowe wyniki obok siebie:

- `Dzienniczek-Hormonu-v2.3.2.apk` — instalacja na telefonie.
- `Dzienniczek-Hormonu-v2.3.2.aab` — przesłanie do Play Console.
- `Dzienniczek-Hormonu-v2.3.2-projekt.zip` — źródła bez dodatkowego folderu wewnątrz.
- `Dzienniczek-Hormonu-v2.3.2.sha256` — sumy kontrolne.

Narzędzia, pobrane instalatory, zależności, pliki pośrednie, logi i kopia robocza znajdują się domyślnie w `D:\Users\Admin\Środowiska`. NodeJS, Python, JDK_17, Android_SDK, Gradle i npm-cache są współdzielone z kolejnymi projektami. Zależności konkretnej aplikacji znajdują się w `DzienniczekHormonu/<identyfikator ścieżki>/work`, co zapobiega kolizjom między projektami. Ponowne budowanie wykorzystuje istniejące środowiska i cache. Pierwsze pobranie wymaga internetu oraz akceptacji licencji SDK, jeżeli nie zostały wcześniej przyjęte.

Nie instaluj `node_modules`, SDK ani środowiska w źródłach. Nie uruchamiaj bezpośrednio `npm install` ani Gradle w tym katalogu. Do codziennej pracy służy `BUDUJ.cmd`; wewnętrzne polecenia npm są dla kopii roboczej i CI. Generowanie źródeł z pominięciem buildera jest blokowane.

Dodatkowe tryby PowerShell:

```powershell
.\BUDUJ.ps1 -PrepareOnly   # tylko zewnętrzna kopia i zasoby web
.\BUDUJ.ps1 -WebOnly       # przygotowanie i testy web
.\BUDUJ.ps1 -CheckOnly     # testy web, Android Lint i APK debug
.\BUDUJ.ps1 -EnvironmentRoot 'D:\Users\Admin\Środowiska'
```

Builder wypisuje dokładną ścieżkę kopii roboczej i dziennika. Podgląd PWA można uruchomić serwerem HTTP z jej folderu `www`; oryginalny katalog źródeł nie zawiera wygenerowanej strony.

## Podpis i wersjonowanie

Zachowaj dotychczasowy klucz aplikacji. `KONFIGURUJ_PODPIS.cmd` zapisuje konfigurację poza projektem w `%LOCALAPPDATA%/DzienniczekHormonu/signing`. Nie twórz nowego klucza dla aktualizacji już rozpowszechnianej aplikacji. Nigdy nie dodawaj haseł ani klucza do ZIP lub Git.

Zmieniaj wersję przez `USTAW_WERSJE.cmd` albo `BUDUJ.ps1 -SetVersion 2.3.3 -VersionCode 2009002304`. Każde wydanie w Google Play wymaga większego versionCode; limit wynosi 2100000000. Obecnie: `2009002303`. Zachowano identyfikator `pl.tomaszwolak.dzienniczekhormonuwzrostu`, minSdk 24, targetSdk 36.

## Wersja 2.3.2

Szybsze raporty PDF i DOCX, systemowe drukowanie Androida oraz Wstecz: powrót do Dzisiaj, a wyjście dopiero po dwóch naciśnięciach w ciągu 2 sekund. Szczegóły i pomiary: [ZMIANY-2.3.2.md](ZMIANY-2.3.2.md).

## Dokumentacja

- [WDROZENIE.md](WDROZENIE.md) — etapy zmian, zachowanie i wyniki sprawdzeń.
- [GOOGLE_PLAY.md](GOOGLE_PLAY.md) — konkretne kroki wydania oraz dane, które musi uzupełnić wydawca.
- [store/listing-pl.md](store/listing-pl.md) — tekst oferty i informacje o wydaniu.
- [GITHUB_ACTIONS_INSTRUKCJA.md](GITHUB_ACTIONS_INSTRUKCJA.md) — automatyczne testy i artefakty.
- [privacy.html](privacy.html) — polityka prywatności do uzupełnienia i opublikowania pod publicznym adresem.

Aplikacja jest przygotowana technicznie do testów wydania. Nie została opublikowana w Google Play. Publiczna polityka, dane wydawcy, deklaracje i zatwierdzenie Google pozostają wymaganymi krokami przed publikacją.
