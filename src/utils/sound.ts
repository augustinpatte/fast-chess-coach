/**
 * Sons de jeu generes localement avec l'API Web Audio.
 * Aucun fichier audio n'est telecharge : deux bips tres courts suffisent.
 */

type SoundName = 'move' | 'capture';

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  return context;
}

const FREQUENCIES: Record<SoundName, number> = { move: 440, capture: 280 };

/** Joue un bip tres court. Sans effet si l'audio n'est pas disponible. */
export function playSound(name: SoundName): void {
  const ctx = getContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') void ctx.resume();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = FREQUENCIES[name];
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.1);
  } catch {
    // L'audio est un confort : une erreur ne doit jamais gener la partie.
  }
}
