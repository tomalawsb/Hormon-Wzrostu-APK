# Etap 5 — system wizualny

## Wdrożony zakres

- turkus jest kolorem marki i głównych akcji,
- zielony oznacza wykonane podanie,
- czerwony oznacza pominięcie, błąd lub operację niebezpieczną,
- żółty oznacza ostrzeżenie,
- karty i tła korzystają z neutralnych powierzchni,
- przyciski, formularze, przełączniki, dialogi, statusy i fokus używają wspólnych tokenów,
- interfejs ma motyw jasny, ciemny i automatyczny zgodny z telefonem,
- wybór motywu jest walidowany i zapisany razem z zaszyfrowanymi ustawieniami aplikacji,
- zmiana ustawienia systemowego jest obsługiwana bez ponownego uruchamiania,
- tło startowe Android WebView dopasowuje się do jasnego lub ciemnego trybu telefonu,
- przypadkowe znaki tekstowe i emoji interfejsu zastąpiono jednym zestawem SVG.

Emoji pozostały wyłącznie jako wybierane przez użytkownika avatary profili. Nie są
ikonami akcji ani nawigacji.

## Najważniejsze pliki

- `src/styles/variables.css` — kolory, typografia, odstępy, promienie i cienie,
- `src/styles/components.css` — wspólne komponenty i ikony,
- `src/styles/dark-mode.css` — motyw ciemny, automatyczny i zwiększony kontrast,
- `src/services/theme/index.js` — zapis, walidacja i przełączanie motywu,
- `src/components/icon/sprite.html` — centralny zestaw ikon SVG,
- `src/screens/settings/index.html` — kategoria „Wygląd”,
- `tests/visual_system_test.py` — kontrola motywów, tokenów, statusów i ikon.

## Kontrola lokalna

```text
npm run prepare:web
npm run test:web
npm run build:check
```

Budowanie APK pozostaje pominięte lokalnie zgodnie z ustalonym sposobem pracy.
