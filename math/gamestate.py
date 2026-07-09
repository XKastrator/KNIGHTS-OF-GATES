"""Round logic: draws a board, evaluates line wins, records the book."""

from game_override import GameStateOverride


class GameState(GameStateOverride):
    """Handles game logic and events for a single simulation (round)."""

    def run_spin(self, sim: int) -> None:
        self.reset_seed(sim)
        self.repeat = True
        while self.repeat:
            self.reset_book()
            self.draw_board(emit_event=True)

            # Evaluate + emit wins for the drawn board (lines + wild substitution).
            self.evaluate_lines_board()

            self.win_manager.update_gametype_wins(self.gametype)

            self.evaluate_finalwin()
            self.check_repeat()

        self.imprint_wins()

    def run_freespin(self) -> None:
        """No free-spin mode yet — the symbol-vs-symbol feature will land here."""
        raise NotImplementedError("Knights of Gates has no free-spin mode yet.")
