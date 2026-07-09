"""
Entry point: simulates rounds and writes books, lookup tables and config files.

Run from the math-sdk repository root (after copying this folder to
games/knights_of_gates/):

    make run GAME=knights_of_gates
    # or
    python3 games/knights_of_gates/run.py

Outputs land in games/knights_of_gates/library/ — the publish files
(books_*.jsonl.zst, lookup tables, index.json) are what gets uploaded to
Stake Engine.
"""

from game_config import GameConfig
from gamestate import GameState
from src.state.run_sims import create_books
from src.write_data.write_configs import generate_configs

if __name__ == "__main__":

    num_threads = 8
    rust_threads = 20
    batching_size = 50000
    compression = True
    profiling = False

    num_sim_args = {
        "base": int(1e5),
    }

    run_conditions = {
        "run_sims": True,
        "run_optimization": False,  # enable after tuning game_optimization.py
        "run_analysis": False,
        "run_format_checks": True,
    }
    target_modes = list(num_sim_args.keys())

    config = GameConfig()
    gamestate = GameState(config)

    if run_conditions["run_sims"]:
        create_books(
            gamestate,
            config,
            num_sim_args,
            batching_size,
            num_threads,
            compression,
            profiling,
        )

    generate_configs(gamestate)

    if run_conditions["run_optimization"]:
        from game_optimization import OptimizationSetup
        from optimization_program.run_script import OptimizationExecution

        OptimizationSetup(config)
        OptimizationExecution().run_all_modes(config, target_modes, rust_threads)
        generate_configs(gamestate)

    if run_conditions["run_analysis"]:
        from utils.game_analytics.run_analysis import create_stat_sheet

        create_stat_sheet(gamestate)

    if run_conditions["run_format_checks"]:
        from utils.rgs_verification import execute_all_tests

        execute_all_tests(config)
