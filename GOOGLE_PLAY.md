# Publikacja 2.3.3 w Google Play

Stan: przygotowanie techniczne i materiały. Publikacja nie została wykonana. Dokument odnosi się do kodu w tej paczce; deklaracje trzeba porównać z ostateczną konfiguracją oferty. Wymagania sprawdzono 23.09.2026.

## 1. Wydawca i kontakt — do uzupełnienia

Podaj nazwę prawną organizacji, nazwę widoczną w sklepie, prywatny adres e-mail pomocy i spraw prywatności oraz publiczny adres HTTPS polityki. Uzupełnij odpowiednio `privacy.html` i tekst polityki w `src/screens/settings/index.html`. Obecna wersja jawnie oznacza brak tych informacji, więc nie należy jej jeszcze kierować do produkcji. Nie używaj publicznych zgłoszeń GitHub do przyjmowania danych zdrowotnych.

Dla aplikacji z funkcjami zdrowotnymi Google wymaga konta organizacji. Zweryfikuj organizację i dane w Play Console, w tym wymagane przez konsolę informacje rejestrowe. [Zasady kont wydawców](https://support.google.com/googleplay/android-developer/answer/10788890?hl=en).

## 2. Publiczna polityka

Opublikuj uzupełniony `privacy.html` pod stałym adresem HTTPS, dostępnym bez logowania i ograniczeń geograficznych. Wklej ten adres w Play Console. Polityka musi opisywać także zapas, opcjonalne polecenia głosowe oraz eksport. Treść dotycząca prywatności jest dostępna również w ustawieniach aplikacji. Nie wysyłaj PDF zamiast strony. [Zasady aplikacji zdrowotnych](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en).

## 3. Aplikacja i podpis

Utwórz aplikację „Dzienniczek Hormonu”, język polski, bezpłatną. Zachowaj identyfikator `pl.tomaszwolak.dzienniczekhormonuwzrostu`. Użyj wynikowego, podpisanego AAB (`DzienniczekHormonu-WERSJA.aab`), a nie debug APK. Włącz Play App Signing i skonfiguruj klucz przesyłania. Jeśli dotychczasowy APK musi aktualizować się do wersji Play bez odinstalowania, zaplanuj użycie jego istniejącego klucza jako klucza podpisywania aplikacji. Inny certyfikat instalacyjny uniemożliwia taką aktualizację; sam identyczny packageId nie wystarczy. [Play App Signing](https://developer.android.com/studio/publish/app-signing).

Wersja: 2.3.3, versionCode 2009002304. Plik do przesłania: `DzienniczekHormonu-2.3.3.aab` (obok `BUILD.cmd` po podpisanym budowaniu albo z GitHub Releases). Sprawdź, czy wyższy kod nie został już użyty na którejkolwiek ścieżce. targetSdk 36 spełnia obecny wymóg dla nowych aplikacji i aktualizacji; minSdk 24. [Wymagania API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).

Aplikacji raz udostępnionej jako bezpłatna nie można potem zmienić na płatne pobranie. Późniejsze płatne funkcje wymagają osobnego projektu zakupów w aplikacji; w tym wydaniu nie dodano reklam ani płatności. [Zasady cen](https://support.google.com/googleplay/android-developer/answer/6334373?hl=en).

## 4. Oferta i deklaracje

Wklej tekst z `store/listing-pl.md`, ikonę i grafiki z `store/graphics`. Proponowana kategoria: Medycyna. Odbiorcy: dorośli pacjenci i opiekunowie; historia dotycząca dziecka nie oznacza, że aplikacja jest kierowana do samodzielnego użytku przez dzieci. Wypełnij klasyfikację treści zgodnie z faktyczną funkcjonalnością. Reklamy: nie. Dostęp: bez logowania, wszystkie funkcje dostępne po lokalnej konfiguracji. Brak kont internetowych oznacza brak internetowej procedury zamykania konta.

W Health apps declaration opisz prowadzenie historii i przypomnień dotyczących przyjmowania leku, bez diagnozowania lub wyznaczania leczenia. Nie deklaruj certyfikacji wyrobu medycznego bez rzeczywistych podstaw. Opis sklepu i aplikacja zawierają wymagane wyjaśnienie ograniczeń. [Deklaracja zdrowotna i zasady](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en).

### Podstawa do formularza Bezpieczeństwo danych

| Obszar                                       | Zachowanie tego wydania                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Profile, podania, pomiary, zapas             | Lokalny magazyn szyfrowany na Androidzie; brak serwera wydawcy                                               |
| Analityka, reklamy, identyfikatory reklamowe | Brak                                                                                                         |
| Konta i logowanie                            | Brak                                                                                                         |
| Dostęp do internetu w APK                    | Brak uprawnienia INTERNET                                                                                    |
| Kopia i raport                               | Eksport wskazany przez użytkownika do wybranego miejsca, poza prywatny magazyn                               |
| Mowa                                         | Opcjonalna systemowa usługa rozpoznawania; aplikacja otrzymuje tekst i nie zapisuje nagrania                 |
| Usuwanie                                     | Usuwanie wpisów/profili, reset, wyczyszczenie danych Androida lub odinstalowanie; osobne usunięcie eksportów |
| Uprawnienia                                  | Powiadomienia, mikrofon po działaniu użytkownika, specjalny dostęp do dokładnych alarmów                     |

Lokalne przetwarzanie samo w sobie nie oznacza zbierania danych poza urządzeniem. Wydawca powinien jednak ocenić formularz dla wszystkich udostępnianych wersji oraz opcjonalnej usługi mowy i czynności eksportu. Nie zadeklarowano automatycznie odpowiedzi w Play Console. [Wyjaśnienia Bezpieczeństwa danych](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

## 5. Test wewnętrzny, potem produkcja

1. Po uzupełnieniu kontaktu ponownie zbuduj wydanie. Jeżeli kod wersji wykorzystano już w Play, zwiększ go: `BUILD.cmd -SetVersion X.Y.Z -VersionCode NOWY_KOD`.
2. Prześlij AAB na ścieżkę testów wewnętrznych. Wgraj informacje o wydaniu.
3. Sprawdź App Bundle Explorer, raport przed premierą i listę urządzeń. Przetestuj instalację przez Play na rzeczywistym telefonie oraz aktualizację poprzedniej wersji. Zrób kopię własnych danych przed aktualizacją testową.
4. Sprawdź powiadomienie po zgaszeniu ekranu i ponownym uruchomieniu telefonu, odmowę uprawnień, eksport/import oraz wymianę 10/10 → pytanie → 0/10 → osobny zapis podania.
5. Usuń zgłoszone błędy, wypełnij brakujące deklaracje i dopiero wtedy wyślij do oceny produkcyjnej. Zakres wymaganych testów i weryfikacji sprawdź na swoim koncie — lokalne testy nie zastępują oceny Google.

W tym zadaniu nie logowano się na konto wydawcy, nie zmieniano oferty ani nie wysyłano AAB do Google.
