# Bloomburrow Pack Opener

V1 side project - made for fun and for testing PostHog.

Static 15-card Play Booster opener for Magic: The Gathering — Bloomburrow (`blb`). 

Card data comes from the [Scryfall API](https://scryfall.com/docs/api). Images are loaded from Scryfall’s CDN.

## Run it

Serve the folder over HTTP (localStorage and Scryfall `fetch` are more reliable than `file://`):

```bash
python3 -m http.server 8080
```

Then visit [http://localhost:8080](http://localhost:8080).

The first visit downloads Bloomburrow, token (`tblb`), and art-card (`ablb`) printings, then caches a slim copy in `localStorage` for 7 days. Opening packs does not call Scryfall again.

## Pack slots

1–6 common · 7 bonus common/uncommon · 8–10 uncommon · 11 rare or mythic (7:1) · 12 basic land · 13 non-foil wildcard (uniform over booster cards) · 14 foil (CSS overlay) · 15 token 70% / art card 30%.

This project is not affiliated with Wizards of the Coast or Scryfall.
