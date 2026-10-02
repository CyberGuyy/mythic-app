// Runs once when the server starts: the background worker (lib/worker.js).
// MYTHIC_WORKER=off turns it off, for a second copy that should stay quiet.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.MYTHIC_WORKER === 'off') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { startWorker } = await import('./lib/worker.js');
  startWorker();
}
