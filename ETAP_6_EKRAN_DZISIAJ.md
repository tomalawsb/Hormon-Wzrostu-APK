# Etap 6 — ekran „Dzisiaj”

## Wdrożony zakres

- aktualny profil, dawka i sugerowane miejsce są pierwszymi informacjami na ekranie,
- standardowe podanie zapisuje jeden duży przycisk,
- dawkę można szybko zmienić przyciskami `−/+ 0,1` albo wpisać dokładną wartość,
- miejsce wkłucia można zmienić bez otwierania całego formularza,
- pominięcie dawki jest dostępne obok głównej akcji,
- zapis, zmiana, pominięcie i usunięcie wpisu można cofnąć,
- po operacji pojawia się jednoznaczne potwierdzenie i status dnia,
- stan ampułki uwzględnia szybko zmienioną dawkę w ml,
- ekran pokazuje termin następnego przypomnienia,
- głos, data, godzina, mini-kalendarz i ostatnie wpisy są w zwijanych szczegółach,
- układ ma osobne warianty dla dużych i małych ekranów oraz korzysta z motywów etapu 5.

## Automatyczna weryfikacja

```text
npm ci
npm run prepare:web
npm run test:web
npm run build:check
```

Test etapu 6 sprawdza także kolejność interfejsu, szybkie sterowanie dawką, widoczne cofanie, harmonogram przypomnienia, wyliczenia ampułki i spójność wygenerowanych zasobów.

## Kontrola po zbudowaniu APK

1. Sprawdzić standardowy zapis na małym telefonie — powinien wymagać jednego dotknięcia.
2. Zmienić dawkę `−/+`, miejsce wkłucia oraz zapisać wpis.
3. Cofnąć zapis z komunikatu i z przycisku na ekranie.
4. Zapisać pominięcie i je cofnąć.
5. Otworzyć szczegóły, obsługę głosową, ampułkę i ustawienia przypomnienia.
6. Powtórzyć kontrolę w motywie jasnym i ciemnym.

APK nie był budowany lokalnie — zgodnie z ustalonym sposobem pracy.
