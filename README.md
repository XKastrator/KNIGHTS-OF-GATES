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

## Game feel (fizyczność)

Warstwa "czucia" wzorowana na fizycznych szafach i liderach online
(research: mechanika stepper-motor + detent, roll-up, antycypacja):

- **Fizyka bębnów**: nakręcenie (pull-back) → bezwładny rozpęd → jazda z
  ±5% wariancją prędkości na bęben → zapadka z przestrzeleniem ("clunk"),
  squash kolumny i wgniecenie całej planszy przy każdym stopie (mocniejsze
  na ostatnim bębnie). Smuga ruchu rośnie z prędkością.
- **Slam**: w trakcie spinu przycisk zmienia się w STOP — klik/spacja
  dobija wszystkie bębny natychmiast na zapadkę.
- **Antycypacja**: gdy VS wpadnie na wcześniejszym bębnie, pozostałe
  zwalniają do pełzania, kolumny dostają pulsujący złoty glow i narastający
  dźwięk.
- **Uczciwa plansza**: demo ewaluuje linie identycznie jak math
  (`src/rgs/lines.ts`) — to co leży na bębnach, to dokładnie to, co płaci.
- **Prezentacja wygranych**: przygaszenie planszy + złote ramki i pulsujące
  symbole wygrywających pól, **roll-up** licznika z tikami i dzwonkiem,
  tiery WIELKA/MEGA/LEGENDARNA WYGRANA (≥12×/35×/90×) z pełnoekranową
  plakietą, fontanną monet i fanfarą (klik pomija).
- **Audio**: pętla mechanicznego szumu bębnów, thudy stopów z rosnącym
  pitchem, kliki UI, ambient dziedzińca (wiatr + trzask pochodni), ściszany
  przełącznikiem w menu.
- **Życie sceny**: żar unoszący się znad pochodni.

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
- [x] Symbol **VS** na bębnie → pojedynek otwierany w reelu (otwarcie →
      mnożniki → slow-mo → cios → wiktoria + nagroda 2×/VS), wideo 60 fps
- [x] Tryb **Duel Boost** (5×, ~48% szansy na pojedynek) + **Bonus Rycerza** (30×)
- [x] SFX + wstrząs/iskry/flash
- [ ] Pełny spec pojedynku (czerwony vs niebieski, tabela wag/mnożników)
- [ ] Docelowe grafiki symboli i ramki
- [ ] Muzyka w tle / studyjne SFX
