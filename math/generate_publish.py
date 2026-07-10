"""
Standalone generator of Stake Engine math publish files for Knights of Gates.

Produces (in math/publish/):
    index.json               — mode manifest
    books_base.jsonl.zst     — zstd-compressed round events (id/events/payoutMultiplier)
    lookUpTable_base_0.csv   — "simulation number, weight, payout multiplier(x100)"

This mirrors what the official math-sdk pipeline outputs, without requiring the
SDK: rules here MUST stay in sync with game_config.py (paytable, paylines,
reels, wild). payoutMultiplier uses the documented x100 fixed-point convention
(1150 == 11.5x). Weights are tuned so the weighted RTP lands on TARGET_RTP.

Usage:
    pip install zstandard
    python3 math/generate_publish.py
"""

from __future__ import annotations

import csv
import json
import os
import random
from pathlib import Path

import zstandard

HERE = Path(__file__).parent
OUT = HERE / "publish"

SEED = 20260709
NUM_SIMS = 20_000
NUM_WINCAP_SIMS = 20
TARGET_RTP = 0.97
TARGET_HIT_RATE = 0.27  # weighted share of winning rounds
WINCAP_X100 = 20_000  # 200x
BASE_WEIGHT = 100_000

# bonus buy: guaranteed 5x..wincap, cost 30x bet, RTP 97% of cost
# (cost is capped this low because wincap is 200x — rebalance with the VS mechanic)
BONUS_COST = 30.0
BONUS_MIN_X100 = 500
NUM_BONUS_SIMS = 4_000
NUM_BONUS_WINCAP_SIMS = 15

# duel boost: BST0 reels carry far more VS stops (~48% duel chance), cost 5x
BOOST_COST = 5.0
NUM_BOOST_SIMS = 20_000

ROWS = 5
REELS = 5
WILD = "W"
VS = "VS"
# blue knight wins his 2x for every landed VS symbol (placeholder rule until
# the full duel spec arrives — then red/blue outcomes come from a weight table)
DUEL_AWARD_X100 = 200

# (count, symbol) -> payout x100  — keep identical to game_config.py pay_group
PAYTABLE_X100 = {
    ("H1", 5): 2000, ("H1", 4): 800, ("H1", 3): 300,
    ("H2", 5): 1500, ("H2", 4): 600, ("H2", 3): 250,
    ("H3", 5): 1200, ("H3", 4): 500, ("H3", 3): 200,
    ("H4", 5): 1000, ("H4", 4): 400, ("H4", 3): 150,
    ("H5", 5): 800,  ("H5", 4): 300, ("H5", 3): 120,
    ("L1", 5): 500,  ("L1", 4): 200, ("L1", 3): 80,
    ("L2", 5): 400,  ("L2", 4): 160, ("L2", 3): 60,
    ("L3", 5): 300,  ("L3", 4): 120, ("L3", 3): 50,
    ("L4", 5): 250,  ("L4", 4): 100, ("L4", 3): 40,
    ("L5", 5): 200,  ("L5", 4): 80,  ("L5", 3): 30,
}

# payline -> row per reel — keep identical to game_config.py
PAYLINES = {
    1: [0, 0, 0, 0, 0],
    2: [1, 1, 1, 1, 1],
    3: [2, 2, 2, 2, 2],
    4: [3, 3, 3, 3, 3],
    5: [4, 4, 4, 4, 4],
    6: [0, 1, 2, 1, 0],
    7: [4, 3, 2, 3, 4],
    8: [0, 1, 2, 3, 4],
    9: [4, 3, 2, 1, 0],
    10: [1, 2, 3, 2, 1],
}


def read_strips(name: str) -> list[list[str]]:
    """reels/<name>.csv (rows of comma-separated symbols) -> strip per reel."""
    with open(HERE / "reels" / name, newline="") as f:
        rows = [row for row in csv.reader(f) if row]
    return [[row[r] for row in rows] for r in range(REELS)]


def draw_board(strips: list[list[str]], rng: random.Random) -> list[list[str]]:
    """board[reel][row] — window of ROWS symbols from a random stop per reel."""
    board = []
    for strip in strips:
        stop = rng.randrange(len(strip))
        board.append([strip[(stop + r) % len(strip)] for r in range(ROWS)])
    return board


def eval_lines(board: list[list[str]]) -> tuple[int, list[dict]]:
    """Left-to-right line evaluation with wild substitution. Returns (x100, win details)."""
    total = 0
    wins = []
    for line_id, rows in PAYLINES.items():
        symbols = [board[reel][rows[reel]] for reel in range(REELS)]
        target = next((s for s in symbols if s != WILD), None)
        if target is None:
            target = "H1"  # all-wild line pays as the top symbol
        if target == VS:
            continue  # VS is a special symbol — it never pays on lines
        count = 0
        for s in symbols:
            if s == target or s == WILD:
                count += 1
            else:
                break
        pay = PAYTABLE_X100.get((target, count), 0)
        if pay > 0:
            wins.append(
                {
                    "payline": line_id,
                    "symbol": target,
                    "kind": count,
                    "win": pay,
                    "positions": [{"reel": r, "row": rows[r]} for r in range(count)],
                }
            )
            total += pay
    return min(total, WINCAP_X100), wins


def eval_round(board: list[list[str]]) -> tuple[int, list[dict], dict | None]:
    """Lines + duel: every landed VS triggers the duel, blue wins 2x per VS."""
    line_total, wins = eval_lines(board)
    vs_positions = [
        {"reel": reel, "row": row}
        for reel in range(REELS)
        for row in range(ROWS)
        if board[reel][row] == VS
    ]
    duel = None
    total = line_total
    if vs_positions:
        award = DUEL_AWARD_X100 * len(vs_positions)
        total += award
        duel = {
            "positions": vs_positions,
            "winner": "blue",
            "multiplier": DUEL_AWARD_X100 // 100,
            "award": award,
        }
    return min(total, WINCAP_X100), wins, duel


def book_events(
    board: list[list[str]], payout_x100: int, wins: list[dict], duel: dict | None
) -> list[dict]:
    events: list[dict] = [
        {
            "index": 0,
            "type": "reveal",
            "board": [[{"name": s} for s in reel] for reel in board],
            "gameType": "basegame",
        }
    ]
    if duel:
        events.append({"index": len(events), "type": "duel", **duel})
    if payout_x100 > 0:
        events.append({"index": len(events), "type": "winInfo", "totalWin": payout_x100, "wins": wins})
    events.append({"index": len(events), "type": "setTotalWin", "amount": payout_x100})
    events.append({"index": len(events), "type": "finalWin", "amount": payout_x100})
    return events


def solve_weights(payouts_x100: list[int]) -> list[int]:
    """
    Per-sim lookup weights hitting TARGET_RTP and TARGET_HIT_RATE.

    Three buckets (the SDK's Rust optimizer does this with many fences; two
    free buckets are enough for placeholder math):
      small wins (<10x)  -> BASE_WEIGHT (anchor)
      big wins  (>=10x)  -> solved weight x  (fills RTP up to target)
      zero rounds        -> solved weight z  (sets the weighted hit rate)
    """
    t = TARGET_RTP
    h = TARGET_HIT_RATE
    a = BASE_WEIGHT
    small = [p for p in payouts_x100 if 0 < p < 1000]
    big = [p for p in payouts_x100 if p >= 1000]
    zeros = [p for p in payouts_x100 if p == 0]
    if not big or not zeros:
        raise SystemExit("degenerate simulation set — increase NUM_SIMS")
    s_small = sum(p / 100 for p in small)
    s_big = sum(p / 100 for p in big)
    n_small, n_big, n_zero = len(small), len(big), len(zeros)

    # From hit-rate + RTP constraints (see solve in repo history):
    #   x = a*(t/h*n_small - s_small) / (s_big - t/h*n_big)
    #   z = (1-h)/h * (n_small*a + n_big*x) / n_zero
    th = t / h
    x = a * (th * n_small - s_small) / (s_big - th * n_big)
    if x < 1:
        raise SystemExit(f"weight solve failed (x={x:.3f}) — adjust targets")
    z = (1 - h) / h * (n_small * a + n_big * x) / n_zero
    if z < 1:
        raise SystemExit(f"weight solve failed (z={z:.3f}) — adjust targets")
    big_weight, zero_weight = round(x), round(z)

    weights = [
        zero_weight if p == 0 else (BASE_WEIGHT if p < 1000 else big_weight)
        for p in payouts_x100
    ]
    total_w = sum(weights)
    achieved_rtp = sum(w * p / 100 for w, p in zip(weights, payouts_x100)) / total_w
    achieved_hit = sum(w for w, p in zip(weights, payouts_x100) if p > 0) / total_w
    print(f"weights — zero: {zero_weight}, small: {BASE_WEIGHT}, big: {big_weight}")
    print(f"achieved RTP: {achieved_rtp:.4%} (target {t:.2%})")
    print(f"achieved hit rate: {achieved_hit:.2%} (target {h:.2%})")
    return weights


def solve_bonus_weights(payouts_x100: list[int]) -> list[int]:
    """
    Bonus lookup weights: every round pays >= 20x; anchor the sub-mean bucket,
    solve the top bucket so E[payout] == BONUS_COST * TARGET_RTP (97x).
    """
    t = BONUS_COST * TARGET_RTP  # target mean, in multiplier units
    a = BASE_WEIGHT
    low = [p for p in payouts_x100 if p / 100 < t]
    high = [p for p in payouts_x100 if p / 100 >= t]
    s_low = sum(p / 100 for p in low)
    s_high = sum(p / 100 for p in high)
    n_low, n_high = len(low), len(high)
    if not high or s_high / n_high <= t:
        raise SystemExit("bonus sims lack a top-end — enrich BB0.csv / quotas")

    x = a * (t * n_low - s_low) / (s_high - t * n_high)
    if x < 1:
        raise SystemExit(f"bonus weight solve failed (x={x:.3f})")
    high_weight = round(x)

    weights = [a if p / 100 < t else high_weight for p in payouts_x100]
    achieved = sum(w * p / 100 for w, p in zip(weights, payouts_x100)) / sum(weights)
    print(f"bonus weights — low: {a}, high: {high_weight}")
    print(f"bonus achieved RTP: {achieved / BONUS_COST:.4%} (mean {achieved:.2f}x, target {t:.0f}x)")
    return weights


def solve_mean_weights(payouts_x100: list[int], target_mean: float, label: str) -> list[int]:
    """
    Two-bucket solve: sub-10x rounds anchor at BASE_WEIGHT, the >=10x tail gets
    one solved weight so the weighted mean hits `target_mean` (in bet units).
    """
    a = BASE_WEIGHT
    small = [p for p in payouts_x100 if p < 1000]
    big = [p for p in payouts_x100 if p >= 1000]
    if not big:
        raise SystemExit(f"{label}: no >=10x sims — enrich reels/quotas")
    s_small = sum(p / 100 for p in small)
    s_big = sum(p / 100 for p in big)
    n_small, n_big = len(small), len(big)
    x = a * (target_mean * n_small - s_small) / (s_big - target_mean * n_big)
    if x < 1:
        raise SystemExit(f"{label}: weight solve failed (x={x:.3f})")
    big_weight = round(x)
    weights = [a if p < 1000 else big_weight for p in payouts_x100]
    mean = sum(w * p / 100 for w, p in zip(weights, payouts_x100)) / sum(weights)
    print(f"{label} weights — small: {a}, big: {big_weight} | mean {mean:.3f}x (target {target_mean:.3f}x)")
    return weights


def write_mode(name: str, boards, payouts, all_wins, all_duels, weights) -> list[str]:
    lines = []
    for i, (board, payout, wins, duel) in enumerate(
        zip(boards, payouts, all_wins, all_duels), start=1
    ):
        lines.append(
            json.dumps(
                {
                    "id": i,
                    "events": book_events(board, payout, wins, duel),
                    "payoutMultiplier": payout,
                },
                separators=(",", ":"),
            )
        )
    raw = ("\n".join(lines) + "\n").encode()
    books_name = f"books_{name}.jsonl.zst"
    lookup_name = f"lookUpTable_{name}_0.csv"
    with open(OUT / books_name, "wb") as f:
        f.write(zstandard.ZstdCompressor(level=10).compress(raw))
    with open(OUT / lookup_name, "w", newline="") as f:
        for i, (w, p) in enumerate(zip(weights, payouts), start=1):
            f.write(f"{i},{w},{p}\n")
    return [books_name, lookup_name]


def simulate(strips, rng, n) -> tuple[list, list, list, list]:
    boards, payouts, wins_l, duels = [], [], [], []
    for _ in range(n):
        board = draw_board(strips, rng)
        payout, wins, duel = eval_round(board)
        boards.append(board)
        payouts.append(payout)
        wins_l.append(wins)
        duels.append(duel)
    return boards, payouts, wins_l, duels


def main() -> None:
    rng = random.Random(SEED)
    base_strips = read_strips("BR0.csv")
    boost_strips = read_strips("BST0.csv")
    bonus_strips = read_strips("BB0.csv")
    wincap_strips = read_strips("WCAP.csv")

    # ---------- base mode (VS on the middle reel, ~8.5% duel chance) ----------
    boards, payouts, all_wins, all_duels = simulate(base_strips, rng, NUM_SIMS)
    for _ in range(NUM_WINCAP_SIMS):
        board = draw_board(wincap_strips, rng)
        payout, wins, duel = eval_round(board)
        assert payout == WINCAP_X100, f"WCAP board paid {payout}, expected {WINCAP_X100}"
        boards.append(board)
        payouts.append(payout)
        all_wins.append(wins)
        all_duels.append(duel)

    n = len(payouts)
    hit = sum(1 for p in payouts if p > 0)
    duels_n = sum(1 for d in all_duels if d)
    print(f"base sims: {n} | hit: {hit / n:.2%} | duel chance: {duels_n / n:.2%} | "
          f"raw RTP: {sum(p / 100 for p in payouts) / n:.4%}")
    weights = solve_weights(payouts)

    # ---------- boost mode (BST0 reels, ~48% duel chance, cost 5x) ----------
    s_boards, s_payouts, s_wins, s_duels = simulate(boost_strips, rng, NUM_BOOST_SIMS)
    sn = len(s_payouts)
    s_duels_n = sum(1 for d in s_duels if d)
    print(f"boost sims: {sn} | hit: {sum(1 for p in s_payouts if p > 0) / sn:.2%} | "
          f"duel chance: {s_duels_n / sn:.2%} | raw RTP/cost: {sum(p / 100 for p in s_payouts) / sn / BOOST_COST:.4%}")
    s_weights = solve_mean_weights(s_payouts, BOOST_COST * TARGET_RTP, "boost")

    # ---------- bonus mode (rejection-sampled 5x..200x boards) ----------
    b_boards: list = []
    b_payouts: list[int] = []
    b_wins: list = []
    b_duels: list = []
    attempts = 0
    while len(b_payouts) < NUM_BONUS_SIMS:
        board = draw_board(bonus_strips, rng)
        payout, wins, duel = eval_round(board)
        attempts += 1
        if payout >= BONUS_MIN_X100:
            b_boards.append(board)
            b_payouts.append(payout)
            b_wins.append(wins)
            b_duels.append(duel)
        if attempts > NUM_BONUS_SIMS * 5000:
            raise SystemExit("bonus rejection sampling too slow — enrich BB0.csv")
    for _ in range(NUM_BONUS_WINCAP_SIMS):
        board = draw_board(wincap_strips, rng)
        payout, wins, duel = eval_round(board)
        b_boards.append(board)
        b_payouts.append(payout)
        b_wins.append(wins)
        b_duels.append(duel)

    print(f"bonus sims: {len(b_payouts)} | acceptance: {NUM_BONUS_SIMS / attempts:.2%} | "
          f"natural mean: {sum(b_payouts) / len(b_payouts) / 100:.1f}x | max: {max(b_payouts) / 100:.0f}x")
    b_weights = solve_bonus_weights(b_payouts)

    # ---------- write ----------
    OUT.mkdir(exist_ok=True)
    base_files = write_mode("base", boards, payouts, all_wins, all_duels, weights)
    boost_files = write_mode("boost", s_boards, s_payouts, s_wins, s_duels, s_weights)
    bonus_files = write_mode("bonus", b_boards, b_payouts, b_wins, b_duels, b_weights)

    with open(OUT / "index.json", "w") as f:
        json.dump(
            {
                "modes": [
                    {"name": "base", "cost": 1.0, "events": base_files[0], "weights": base_files[1]},
                    {"name": "boost", "cost": BOOST_COST, "events": boost_files[0], "weights": boost_files[1]},
                    {"name": "bonus", "cost": BONUS_COST, "events": bonus_files[0], "weights": bonus_files[1]},
                ]
            },
            f,
            indent=4,
        )

    for name in ["index.json", *base_files, *boost_files, *bonus_files]:
        print(f"{name}: {os.path.getsize(OUT / name):,} B")


if __name__ == "__main__":
    main()
