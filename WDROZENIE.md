Aktualne zmiany wydania 2.3.1: [ZMIANY-2.3.1.md](ZMIANY-2.3.1.md). Poniżej dokumentacja poprzedniego wdrożenia.

# Wdrożenie zmian — 2.3.0

Bazą była paczka 2.2.6. Oryginalny ZIP pozostał bez zmian. Poniższe etapy opisują zaimplementowany zakres.

## Etap 1 — audyt i zachowanie danych

Sprawdzono źródła PWA, natywną warstwę Android, mechanizm zapisu, kopiowania danych i budowania. Zachowano identyfikator aplikacji i kompatybilność importu starych danych. Schemat 15 rozszerza profile o opcjonalny zapas oraz zapis potwierdzenia wymiany. Bez tych pól stary profil otrzymuje wyłączony zapas, a istniejące wpisy pozostają przypisane do swoich ampułek.

## Etap 2 — fizyczna wymiana ampułki

- Użytkownik ustawia N podań dla nowej ampułki. Dziesiąte podanie przy N=10 kończy jej licznik i pozostawia stan 10/10.
- Następnego dnia po otwarciu aplikacji pojawia się pytanie o fizyczną wymianę wkładu we wstrzykiwaczu. Na ekranie pozostaje też przycisk do późniejszego potwierdzenia.
- „Jeszcze nie”, cofnięcie Androida i zamknięcie okna nie rozpoczynają ampułki i nie zmieniają zapasu. Automatyczne pytanie nie zapętla się w tej samej sesji; ponawia się przy próbie zapisu lub następnym otwarciu aplikacji.
- „Tak, wymieniono” zaczyna nową ampułkę od 0/N. Nie zapisuje podania i nie oznacza wykonania iniekcji.
- Wielokrotne kliknięcie nie tworzy kolejnych ampułek. Nieudany zapis przywraca stan ampułek i zapasu.
- Ręczne rozpoczęcie nowej ampułki lub wznowienie odłożonej również wymaga potwierdzenia. Można odłożyć niezużytą ampułkę i później ją wznowić.
- Zapis zwykły, szybki i z polecenia głosowego przechodzi przez tę samą kontrolę. Dni pominięte nie zużywają ampułki.

## Etap 3 — spójne liczenie i historia

Stan ampułki wynika z liczby zapisanych podań i ustawionego N. Dawne oszacowanie w ml nie zamyka jej przedwcześnie ani nie pozwala przekroczyć N. Aplikacja nie przelicza tego na zalecenie medyczne ani nie zmienia dawki użytkownika. Licznik nie mierzy fizycznej zawartości wkładu.

Zmiana wartości domyślnych w ustawieniach dotyczy przyszłych ampułek. Korektę bieżącej wykonuje się osobnym oknem; nie można wpisać N mniejszego od liczby już zapisanych podań lub daty późniejszej od przypisanych wpisów. Edycja historycznego podania zachowuje jego ampułkę. Nowy wpis historyczny wymaga wskazania właściwej ampułki. Przyszła data jest odrzucana. Cofnięcie podania nie cofa potwierdzonej fizycznej wymiany. Zmiana profilu zamyka oczekujące potwierdzenie i nie przywraca formularza poprzedniej osoby.

## Etap 4 — opcjonalny zapas

Każdy profil ma własny, początkowo wyłączony licznik nieotwartych ampułek. Można wpisać stan, próg ostrzegania (domyślnie 2) lub dodać dostawę. Potwierdzenie otwarcia nowej ampułki odejmuje jedną sztukę. Wznowienie odłożonej i cofnięcie podania nie zmieniają zapasu. Przy zerze pojawia się informacja o potrzebie korekty; rzeczywista wymiana pozostaje możliwa, a licznik nigdy nie spada poniżej zera. Zapas jest uwzględniony w kopiach, migracji i walidacji importu.

## Etap 5 — wygląd i dostępność

Dodano trzy niezależne warianty interfejsu: Czytelna, Elegancka, Rodzinna. Pozostają dotychczasowe motywy kolorystyczne, tryb systemowy, rozmiary i kroje tekstu. Ustawienia wyglądu są zapisywane. Dodano czytelne karty wymiany i zapasu, podgląd wariantów oraz wygodne przyciski. Główny przycisk zapisu pozostaje w karcie podania. Dialog wymiany zaczyna z fokusem na odłożeniu decyzji, aby przypadkowe zatwierdzenie nie zmieniło licznika.

## Etap 6 — mały, przenośny projekt

BUDUJ.cmd/BUDUJ.ps1 przyjmują własny folder jako źródła. Wszystkie narzędzia, zależności, cache, tymczasowe źródła, logi, pliki web i kompilacje Androida powstają pod D:\Users\Admin\Środowiska. Narzędzia są współdzielone, a kopia robocza ma identyfikator wyliczony ze ścieżki projektu. Builder wykrywa równoczesne budowanie tej samej kopii. Nie modyfikuje źródeł poza jawną zmianą wersji i skopiowaniem gotowych wyników.

Po przejściu testów weryfikuje podpisy APK/AAB, opcjonalnie Bundletool i tworzy ZIP źródeł. APK, AAB, ZIP oraz sumy SHA-256 trafiają bezpośrednio obok BUDUJ.cmd. ZIP nie zawiera nadrzędnego folderu, node_modules, build, .gradle, cache, gotowych binariów, innych ZIP-ów, kluczy ani wygenerowanych kopii JS/HTML/CSS. Regeneruje je builder w środowisku zewnętrznym.

## Etap 7 — przygotowanie Google Play

Wersja 2.3.0 i versionCode 2008102607 są spójne we wszystkich źródłach. Zachowano targetSdk 36, minSdk 24, lokalny szyfrowany magazyn i brak INTERNET w APK. Dodano materiały oferty, instrukcję deklaracji oraz opis ograniczeń zdrowotnych w aplikacji i polityce. Workflow CI buduje i udostępnia artefakty bez automatycznego publikowania.

## Poprawka wykryta na Androidzie — zapis szyfrowany

Test na emulatorze Androida 16 wykrył odziedziczony błąd: AndroidKeyStore odrzucał IV przekazywany przez aplikację przy kluczu wymagającym losowego szyfrowania (CALLER_NONCE_PROHIBITED). Zmieniono inicjalizację AES-GCM tak, aby IV generował dostawca AndroidKeyStore. Szyfrowanie nadal wymaga losowości; nie osłabiono ustawień klucza. Format zaszyfrowanych danych i ich odczyt pozostają zgodne. [Dokumentacja Androida](<https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec.Builder#setRandomizedEncryptionRequired(boolean)>).

## Etap 8 — weryfikacja

Wykonano następujące sprawdzenia na danych syntetycznych:

| Sprawdzenie                                                                                                                 | Wynik                                                                   |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Pełny zestaw web: lint, formatowanie, architektura, dzisiejsze podanie, kalendarz, profile, ustawienia i przypomnienia      | Zaliczony                                                               |
| Migracje, import/eksport, szyfrowanie kopii i magazynu przeglądarki, zabezpieczenia WebView, PWA offline                    | Zaliczony                                                               |
| Cykl ampułki: N=1/10/12, odmowa, podwójne potwierdzenie, rollback zapisu, cofanie, historia, profile, zapas                 | Zaliczony                                                               |
| axe-core w DOM                                                                                                              | Brak naruszeń kontrolowanych reguł A/AA                                 |
| Prawdziwa przeglądarka: ekran Dzisiaj, 3 warianty × 6 motywów kolorów                                                       | 18 kombinacji bez naruszeń axe-core, w tym kontrastu                    |
| Ekran Dzisiaj: szerokości 320, 390, 768, 1280 px; tekst standardowy i bardzo duży                                           | Brak przewijania poziomego                                              |
| Android Lint i assembleDebug                                                                                                | Zaliczony po poprawce Keystore                                          |
| Emulator Androida 16 / API 36: zapis szyfrowany, różne IV dla kolejnych zapisów, zamknięcie procesu i odczyt po starcie     | Zaliczony                                                               |
| Emulator: pytanie przy starcie kolejnego dnia, „Jeszcze nie”, kontrola przy zapisie, podwójne potwierdzenie, osobne podanie | Zaliczony                                                               |
| Emulator: migracja schematu 14, zachowana historia i domyślnie wyłączony zapas                                              | Zaliczony                                                               |
| Podpisane APK/AAB, apksigner, jarsigner i Bundletool                                                                        | Sprawdzane obowiązkowo przez builder; Bundletool użyty w tym środowisku |

Materiały sklepu: sześć zrzutów aplikacji z emulatora, grafika 1024 × 500 i istniejąca ikona 512 × 512. Nie użyto rzeczywistych danych pacjenta.

Dzienniki są poza projektem w `D:\Users\Admin\Środowiska\DzienniczekHormonu` oraz pod identyfikatorem kopii roboczej w `logs`. Nowy test regresji natywnej: `tests/android_device_test.cjs`. Uruchamia się wyłącznie po jawnym wskazaniu emulatora i zgodzie na zastąpienie jego danych testowych, poza zwykłym npm test. Przykład po `BUDUJ.ps1 -CheckOnly`, w wypisanej kopii roboczej, przy ustawionym ANDROID_HOME:

```powershell
node tests/android_device_test.cjs --device=emulator-5580 --replace-test-data
```

Nie wykonano testów na fizycznym telefonie, na wszystkich wersjach Androida ani instalacji przez Google Play. W szczególności niezawodność alarmów przy oszczędzaniu energii i zachowanie dostawcy rozpoznawania mowy wymagają sprawdzenia na docelowych urządzeniach. Ostrzeżenie Gradle dotyczy przyszłej migracji do Gradle 9; bieżący wrapper używa 8.14.5.

## Wynik końcowy — 23.09.2026

Pełny `BUDUJ.cmd` zakończył się poprawnie, także uruchomiony z innego katalogu po rozpakowaniu ZIP do nowej lokalizacji na D:. Ponownie przeszedł cały zestaw testów oraz kompilacja podpisanego APK/AAB. Zasoby JS/HTML/CSS i classes.dex obu kompilacji są identyczne. Podpisany APK został zainstalowany i uruchomiony na emulatorze Androida 16; ekran pierwszej konfiguracji wyświetlił się poprawnie. Release nie ma flagi DEBUGGABLE.

ZIP zawiera wyłącznie źródła, skrypty, testy, dokumentację i materiały sklepu, bez dodatkowego poziomu katalogu. Sprawdzono integralność i zgodność zawartości z plikami źródłowymi. Wszystkie sześć zrzutów sklepu ma 1080 × 1920 pikseli, a grafika promocyjna 1024 × 500, w formacie RGB PNG bez kanału alfa. Gotowe APK/AAB i ZIP są obok BUDUJ.cmd, a sumy zapisano w pliku `.sha256`.

Końcowe logi: `final-build.log`, `zip-build.log`, `native-regression.log` i `qa/visual-matrix.json` w zewnętrznym katalogu `D:\Users\Admin\Środowiska\DzienniczekHormonu`. Nie wykonywano wysłania do GitHub ani Google Play.

## Co pozostaje przed publikacją

Uzupełnienie danych wydawcy i prywatnego kontaktu, opublikowanie polityki pod publicznym HTTPS, konfiguracja Play App Signing, deklaracje, test przez Play oraz ocena Google. Szczegóły w GOOGLE_PLAY.md. To przygotowanie wydania, a nie dokonana publikacja.

## Propozycje na kolejne wydania

1. Widżet Androida z informacją, czy dzisiejsze podanie zostało zapisane, bez ujawniania dawki na zablokowanym ekranie.
2. Historia zmian zapasu (dostawa, otwarcie, korekta) dla łatwiejszego wyjaśniania różnic.
3. Dodatkowe testy powiadomień na urządzeniach Samsung/Xiaomi i starszym Androidzie.
4. Ewentualne płatne funkcje dopiero po ustaleniu modelu zakupów w aplikacji, zasad dostępu i wpływu na prywatność.

## Wydanie 2.3.2 — raporty i nawigacja

Wdrożono szybszy PDF i DOCX, natywne drukowanie Androida oraz dwukrotne Wstecz do wyjścia. Szczegółowe etapy, pomiary i zakres testów opisano w [ZMIANY-2.3.2.md](ZMIANY-2.3.2.md). Wydanie zachowuje schemat danych 16 oraz podpis aplikacji; versionCode wynosi 2009002303.
