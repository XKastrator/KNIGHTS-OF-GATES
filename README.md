# Knights of Gates 🏰⚔️

Slot 5×5 w klimacie rycerskim, budowany pod **Stake Engine**. Docelowa
mechanika główna: **symbol vs symbol** (pojedynek à la "duel at dawn" z
rycerzami) — w przygotowaniu; obecna wersja to działający szkielet gry.

## Struktura

```
├── src/            # frontend: PixiJS + TypeScript (Vite)
│   ├── game/       # scena, bębny 5×5, symbole
│   ├── rgs/        # klient Stake Engine RGS + tryb demo
│   ├── ui/         # dolny pasek (spin/bet/autoplay/turbo/bonus) + modale
│   └── fallback/   # generowane zamienniki grafik (tło/ramka/logo)
├── public/assets/  # tu wrzucasz docelowe grafiki (patrz README w środku)
└── math/           # pakiet gry pod Stake Engine Math SDK (Python)
```

## Frontend — dev

```bash
npm install
npm run dev      # http://localhost:5173 — tryb demo (bez RGS)
npm run build    # produkcyjny build do dist/
```

Bez parametru `rgs_url` w adresie gra działa w **trybie demo** (lokalny
balans, losowe plansze). To normalny tryb do pracy nad grafiką/animacjami.

## Stake Engine

- **Frontend**: `npm run build` → zawartość `dist/` wgrywasz jako pliki
  frontendu gry w ACP. Gra czyta z URL parametry `sessionID`, `rgs_url`,
  `lang`, `currency`, `device` i woła RGS:
  `POST /wallet/authenticate` → `POST /wallet/play` → `POST /wallet/end-round`
  (kwoty w mikro-jednostkach ×1 000 000). Plansza 5×5 jest odtwarzana z
  eventu `reveal` z books; wygrana z `payoutMultiplier`.
- **Math**: katalog `math/` to paczka pod
  [math-sdk](https://github.com/StakeEngine/math-sdk) — instrukcja
  generowania books/lookup tables: `math/README.md`.

## Grafiki

Tło, ramka i logo mają generowane fallbacki — docelowe pliki wrzuć do
`public/assets/` (nazwy w `public/assets/README.md`), podmienią się same.
Symbole placeholderowe rysuje `src/game/symbols.ts`; docelowe PNG podmienimy
jednym ruchem (kolejność wg `SYMBOLS` w `src/config.ts`, kody zgodne z math).

## Panel pojedynku (VS) i dźwięk

- 60 dostarczonych klatek pojedynku (niebieski wygrywa) jest zakodowane do
  `public/assets/vs.webm` (1 s @ 60 fps, VP8, ~520 KB zamiast 35 MB PNG).
  Panel stoi po prawej stronie planszy; pojedynek odpala się przy **bonus buy**
  (dim sceny → riser → zwarcie ze wstrząsem i iskrami → wiktoria niebieskiego).
  Podgląd bez grania: klawisz **V**.
- SFX są syntezowane proceduralnie (`scripts/generate_sfx.py` →
  `public/assets/sfx/*.wav`): spin, stopy bębnów, riser/clash/victory,
  win/bigwin. Podmiana na studyjne = nadpisanie WAV-ów, kod bez zmian.
  Włącznik dźwięku: menu (☰) → Dźwięk.
- Regeneracja wideo z nowych klatek: sekwencję PNG przyciąć wspólnym bboxem
  i zakodować VP8 60 fps (patrz historia w repo / ffmpeg image2pipe+mjpeg).

## Status / roadmapa

- [x] Scena: tło + logo + ramka + plansza 5×5 + dolny pasek UI
- [x] Spin bębnów (stagger, pullback, bounce), turbo, autoplay
- [x] Klient RGS Stake Engine + tryb demo
- [x] Math publish: tryb `base` (RTP 97%, hit 27%) + `bonus` 30× (5×–200×)
- [x] Pakiet math SDK (placeholder: 10 linii, wild)
- [x] Panel pojedynku VS (wideo 60 fps) + SFX + wstrząs/iskry
- [ ] Mechanika **symbol vs symbol** w math (czekam na spec/spreadsheet wypłat)
- [ ] Docelowe grafiki symboli i ramki
- [ ] Muzyka w tle / studyjne SFX
