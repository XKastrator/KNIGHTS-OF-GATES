import { sound } from '../audio/sound';
import {
  BONUS_COST_MULT,
  BOOST_COST_MULT,
  DUEL_MULTIPLIER,
  rollupDuration,
  WIN_TIERS,
} from '../config';
import { SlotScene } from '../game/SlotScene';
import type { GameClient } from '../rgs/client';
import { bet, bus, setBetSteps, state, stepBet } from '../state';
import { Eases, wait } from '../util/tween';

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
};

const CURRENCY_SIGNS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', PLN: 'zł' };

function fmt(n: number): string {
  const sign = CURRENCY_SIGNS[state.currency];
  const num = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sign ? `${sign}${num}` : `${num} ${state.currency}`;
}

/** Binds the DOM bottom bar + modals to the game scene and the game client. */
export function initBar(scene: SlotScene, client: GameClient): void {
  const bar = $('#bar');
  const balanceVal = $('#balance-val');
  const winVal = $('#win-val');
  const betVal = $('#bet-val');
  const betLabel = $('#bet-label');
  const btnBoost = $<HTMLButtonElement>('#btn-boost');
  const bonusBetVal = $('#bonus-bet-val');
  const btnSpin = $<HTMLButtonElement>('#btn-spin');
  const btnTurbo = $('#btn-turbo');
  const btnAuto = $('#btn-auto');
  const btnBonus = $('#btn-bonus');
  const autoCount = $('#auto-count');
  const autoIcon = $('#auto-icon');
  const capsuleMain = $('.capsule-main');
  const modals = {
    menu: $('#modal-menu'),
    auto: $('#modal-auto'),
    bonus: $('#modal-bonus'),
  };

  let autoLeft = 0;
  let slamUsed = false;

  // soft click on every button press (physical feedback)
  document.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement | null)?.closest('button')) sound.play('click', { volume: 0.5 });
  });

  function render(): void {
    balanceVal.textContent = fmt(state.balance);
    winVal.textContent = fmt(state.win);
    winVal.classList.toggle('winning', state.win > 0);
    betLabel.textContent = state.boostActive ? `Bet • Boost ×${BOOST_COST_MULT}` : 'Bet';
    betVal.textContent = fmt(bet() * (state.boostActive ? BOOST_COST_MULT : 1));
    betVal.classList.toggle('boost-on', state.boostActive);
    bonusBetVal.textContent = fmt(bet());
    $('#boost-cost').textContent = fmt(bet() * BOOST_COST_MULT);
    $('#bonus-cost').textContent = fmt(bet() * BONUS_COST_MULT);
    btnBoost.textContent = state.boostActive ? 'Wyłącz' : 'Aktywuj';
    btnBoost.classList.toggle('on', state.boostActive);
    btnBonus.classList.toggle('active', state.boostActive);
    bar.classList.toggle('turbo', state.turbo);
    btnTurbo.classList.toggle('active', state.turbo);
    btnAuto.classList.toggle('active', state.autoRemaining > 0);
    autoCount.classList.toggle('hidden', state.autoRemaining === 0);
    autoIcon.classList.toggle('hidden', state.autoRemaining > 0);
    autoCount.textContent = String(state.autoRemaining);
    // while reels run the button becomes STOP (slam); after slamming it waits
    btnSpin.disabled = state.spinning && slamUsed;
    btnSpin.classList.toggle('spinning', state.spinning && slamUsed);
    btnSpin.classList.toggle('can-stop', state.spinning && !slamUsed);
  }

  bus.on('change', render);
  bus.on('deny', () => {
    capsuleMain.classList.remove('deny');
    void capsuleMain.offsetWidth; // restart the shake animation
    capsuleMain.classList.add('deny');
  });

  function closeAll(): void {
    Object.values(modals).forEach((m) => m.classList.add('hidden'));
  }

  function stopAuto(): void {
    autoLeft = 0;
    state.autoRemaining = 0;
  }

  /** Dramatized win meter roll-up with ticking (the classic "roll-up"). */
  async function rollupWin(amount: number, duration: number): Promise<void> {
    if (amount <= 0 || duration <= 0) {
      state.win = amount;
      bus.emit('change');
      return;
    }
    let elapsed = 0;
    let lastTick = 0;
    while (elapsed < duration) {
      await wait(16);
      elapsed += 16;
      const k = Eases.quadOut(Math.min(1, elapsed / duration));
      state.win = +(amount * k).toFixed(2);
      bus.emit('change');
      if (elapsed - lastTick > 70 && duration > 400) {
        sound.play('rollup_tick', { volume: 0.5, rate: 0.95 + Math.random() * 0.15 });
        lastTick = elapsed;
      }
    }
    state.win = amount;
    bus.emit('change');
    if (duration > 400) sound.play('rollup_end', { volume: 0.7 });
  }

  /** One full round: debit via client → spin reels onto the result → credit. */
  async function doSpin(kind: 'base' | 'bonus' = 'base'): Promise<void> {
    if (state.spinning) return;
    const stake = bet();
    const mode = kind === 'bonus' ? 'bonus' : state.boostActive ? 'boost' : 'base';
    const costMult = mode === 'bonus' ? BONUS_COST_MULT : mode === 'boost' ? BOOST_COST_MULT : 1;
    if (state.balance < stake * costMult) {
      bus.emit('deny');
      stopAuto();
      bus.emit('change');
      return;
    }

    state.spinning = true;
    slamUsed = false;
    state.win = 0;
    scene.clearWins();
    bus.emit('change');
    bus.emit('spinstart');

    let round;
    try {
      round = await client.play(stake, mode);
    } catch (err) {
      state.spinning = false;
      stopAuto();
      bus.emit('change');
      bus.emit('deny');
      console.warn('play failed:', err);
      return;
    }
    if (round.balance !== null) state.balance = round.balance;

    sound.play('spin', { volume: 0.7 });
    await scene.machine.spin(state.turbo, round.grid);

    // landed VS symbols open the in-reel duel before the win is presented
    if (round.duel && round.duel.positions.length > 0) {
      await scene.playDuelSequence(round.duel);
    }

    state.spinning = false;
    bus.emit('change');

    // server credit first, presentation second — balance updates after roll-up
    let creditedBalance: number | null = null;
    if (round.win > 0) {
      try {
        creditedBalance = await client.endRound();
      } catch (err) {
        console.warn('end-round failed:', err);
      }
    }

    if (round.win > 0) {
      scene.showWins(round.lineWins, round.duel);
      const mult = round.win / stake;
      const tier = WIN_TIERS.find((t) => mult >= t.min);
      const lineWin = round.win - (round.duel?.award ?? 0);
      if (!tier && lineWin > 0) sound.play('win', { volume: 0.85 });
      void scene.flashWin();

      const rollDur = state.turbo ? Math.min(600, rollupDuration(mult)) : rollupDuration(mult);
      await Promise.all([
        rollupWin(round.win, rollDur),
        tier && !state.turbo ? scene.celebrate(round.win, tier) : Promise.resolve(),
      ]);
    }

    if (creditedBalance !== null) state.balance = creditedBalance;
    bus.emit('change');
    bus.emit('spinend');
  }

  async function runAuto(): Promise<void> {
    while (autoLeft > 0 && state.balance >= bet()) {
      await doSpin();
      if (state.autoRemaining === 0 && autoLeft === 0) break; // stopped by an error
      autoLeft -= 1;
      state.autoRemaining = autoLeft;
      bus.emit('change');
      await wait(state.turbo ? 220 : 550);
    }
    stopAuto();
    bus.emit('change');
  }

  // --- bar buttons
  btnSpin.addEventListener('click', () => {
    if (state.spinning) {
      if (!slamUsed) {
        slamUsed = true;
        scene.machine.slam();
        bus.emit('change');
      }
      return;
    }
    void doSpin();
  });
  btnTurbo.addEventListener('click', () => {
    state.turbo = !state.turbo;
    bus.emit('change');
  });
  $('#btn-bet-up').addEventListener('click', () => stepBet(1));
  $('#btn-bet-down').addEventListener('click', () => stepBet(-1));
  $('#bonus-bet-up').addEventListener('click', () => stepBet(1));
  $('#bonus-bet-down').addEventListener('click', () => stepBet(-1));
  $('#btn-menu').addEventListener('click', () => modals.menu.classList.remove('hidden'));
  btnBonus.addEventListener('click', () => modals.bonus.classList.remove('hidden'));
  btnAuto.addEventListener('click', () => {
    if (state.autoRemaining > 0) {
      stopAuto();
      bus.emit('change');
    } else {
      modals.auto.classList.remove('hidden');
    }
  });

  // --- modals
  document.querySelectorAll<HTMLElement>('[data-close]').forEach((el) => el.addEventListener('click', closeAll));
  [modals.menu, modals.auto].forEach((m) =>
    m.addEventListener('click', (e) => {
      if (e.target === m) closeAll();
    }),
  );
  document.querySelectorAll<HTMLButtonElement>('.auto-opt').forEach((btn) =>
    btn.addEventListener('click', () => {
      autoLeft = Number(btn.dataset.auto);
      state.autoRemaining = autoLeft;
      bus.emit('change');
      closeAll();
      void runAuto();
    }),
  );
  // bonus modal offers
  btnBoost.addEventListener('click', () => {
    state.boostActive = !state.boostActive;
    bus.emit('change');
  });
  $('#btn-bonus-buy').addEventListener('click', () => {
    if (state.spinning) return;
    closeAll();
    void doSpin('bonus');
  });

  // sound toggle in the settings modal
  const toggleSound = $('#toggle-sound');
  const renderSoundPill = () => {
    toggleSound.textContent = sound.enabled ? 'WŁ.' : 'WYŁ.';
    toggleSound.classList.toggle('off', !sound.enabled);
  };
  toggleSound.addEventListener('click', () => {
    sound.setEnabled(!sound.enabled);
    renderSoundPill();
  });
  renderSoundPill();

  // space = spin, V = duel preview (dev)
  window.addEventListener('keydown', (e) => {
    const modalOpen = Object.values(modals).some((m) => !m.classList.contains('hidden'));
    if (modalOpen) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (state.spinning) {
        if (!slamUsed) {
          slamUsed = true;
          scene.machine.slam();
          bus.emit('change');
        }
      } else {
        void doSpin();
      }
    } else if (e.code === 'KeyV' && !state.spinning) {
      void scene.playDuelSequence({
        positions: [{ reel: 2, row: 2 }],
        award: +(bet() * DUEL_MULTIPLIER).toFixed(2),
        multiplier: DUEL_MULTIPLIER,
      });
    }
  });

  render();
}

/** Authenticates against the client and seeds balance / bet ladder. */
export async function initSession(client: GameClient): Promise<void> {
  try {
    const auth = await client.authenticate();
    state.balance = auth.balance;
    state.currency = auth.currency;
    setBetSteps(auth.betLevels, auth.defaultBet);
  } catch (err) {
    console.warn('authenticate failed — continuing with local defaults:', err);
  }
  bus.emit('change');
}
