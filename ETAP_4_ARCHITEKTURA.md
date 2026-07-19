# Etap 4 — architektura interfejsu

## Zakres wdrożenia

- Duży `index.html` został rozdzielony na 14 fragmentów należących do ekranów, komponentów i powłoki aplikacji.
- Kod aplikacji został rozdzielony na 56 części w warstwach `core`, `screens`, `components`, `services` i `platform`.
- `style.css` jest składany z pięciu warstw: zmiennych, układu, komponentów, ekranów oraz motywu ciemnego.
- Modele danych ampułek i miejsc wkłucia, walidacja importu oraz schemat magazynu nie używają DOM-u.
- Kod kalendarza, historii, ustawień, profili, raportów i ekranu Dzisiaj ma osobne katalogi.
- Wygenerowane pliki pozostają zgodne z PWA i Android WebView.

## Struktura

```text
src/
  core/
  screens/
    today/
    calendar/
    history/
    profiles/
    settings/
    reports/
  components/
    dose-card/
    ampoule-card/
    injection-site/
    bottom-navigation/
    dialog/
    notification/
  services/
    storage/
    encryption/
    notifications/
    export/
    import/
  platform/
  shell/
  styles/
    variables.css
    layout.css
    components.css
    screens.css
    dark-mode.css
```

`dark-mode.css` jest pustą, gotową warstwą. Kolory i wygląd trybu ciemnego należą do etapu 5, dlatego ten etap nie zmienia interfejsu.

## Budowanie źródeł

Manifesty `src/module-order.json`, `src/html-order.json` oraz `src/styles/style-order.json` określają kolejność składania plików wynikowych.

```text
npm run build:sources
npm run build:check
npm run prepare:web
```

Nie należy edytować ręcznie `app.js`, `index.html` ani `style.css`. Zmiany wykonuje się w `src/`.

## Kontrola zgodności

`tests/architecture_test.py` sprawdza:

- obecność wszystkich warstw i katalogów,
- kompletność manifestów i brak duplikatów,
- zgodność plików wynikowych ze źródłami,
- własność głównych funkcji renderujących przez odpowiednie ekrany,
- brak dostępu do DOM-u w wybranych modułach danych,
- pojedynczy prywatny zakres aplikacji zamiast nowych zmiennych globalnych.

Przed i po refaktoryzacji pliki wynikowe mają te same sumy SHA-256:

- `app.js`: `b32672f57afb7e3ab2dc2f1d236b9b273f75135787adae7960a1169e92afa3e6`,
- `index.html`: `7612f29d10a050ed61374c578cdab25760ff1ef86b973a45847456f41e279c97`,
- `style.css`: `e7f9eb875d0b46896080d200ba1a0142727397df23daacca3ed3d110b6a5a09c`.

APK nie był budowany lokalnie zgodnie z ustaleniem. Pliki `.cmd` i `.ps1` nie zostały zmienione.
