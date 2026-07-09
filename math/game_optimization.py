"""
Optimization-program setup (RTP balancing of lookup-table weights).

NOTE: verify the parameter construction against the optimization docs of your
math-sdk checkout before enabling run_optimization in run.py — targets below
(hit-rates / RTP split between zero, low and wincap buckets) are a first guess
for the placeholder math and must be re-tuned with the VS mechanic.
"""

from optimization_program.optimization_config import (
    ConstructConditions,
    ConstructParameters,
    ConstructScaling,
    verify_optimization_input,
)


class OptimizationSetup:
    """Attaches opt_params for each bet mode to the game config."""

    def __init__(self, game_config):
        self.game_config = game_config
        self.game_config.opt_params = {
            "base": {
                "conditions": {
                    "rtp": ConstructConditions(rtp=self.game_config.rtp).return_dict(),
                    "wincap": ConstructConditions(rtp=0.002, av_win=self.game_config.wincap).return_dict(),
                    "zero_wins": ConstructConditions(rtp=0.0, hr=2.5).return_dict(),
                },
                "scaling": ConstructScaling(
                    [
                        {"criteria": "basegame", "scale_factor": 1.0, "win_range": (1.0, 5.0), "probability": 1.0},
                    ]
                ).return_dict(),
                "parameters": ConstructParameters(
                    num_show=5000,
                    num_per_fence=1000,
                    min_m2m=2,
                    max_m2m=6,
                    pmb_rtp=self.game_config.rtp,
                    sim_trials=5000,
                    test_spins=[10, 20, 50],
                    score_type="rtp",
                ).return_dict(),
            },
        }
        verify_optimization_input(self.game_config, self.game_config.opt_params)
