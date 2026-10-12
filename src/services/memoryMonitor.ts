import v8 from 'v8';
import { getActiveSessionsCount } from './baileysManager.js';
import { getActiveCampaigns } from './blastRunner.js';

let monitorInterval: NodeJS.Timeout | null = null;

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function logMemoryStats(tag = '5min-check'): void {
  try {
    const mem = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    const activeSessions = getActiveSessionsCount();
    const activeCampaigns = getActiveCampaigns().size;

    console.log(
      `[MemoryMonitor] [${tag}] RSS: ${formatMB(mem.rss)} | Heap: ${formatMB(mem.heapUsed)} / ${formatMB(mem.heapTotal)} (limit: ${formatMB(heapStats.heap_size_limit)}, avail: ${formatMB(heapStats.total_available_size)}) | External: ${formatMB(mem.external)} | ArrayBuffers: ${formatMB(mem.arrayBuffers || 0)} | ActiveSessions: ${activeSessions} | ActiveCampaigns: ${activeCampaigns}`
    );
  } catch (err) {
    console.error('[MemoryMonitor] Error gathering memory statistics:', err);
  }
}

export function startMemoryMonitor(intervalMs = 5 * 60 * 1000): void {
  if (monitorInterval) return;

  console.log(`📊 [MemoryMonitor] Initialized (reporting every ${Math.round(intervalMs / 1000)}s)`);

  // Initial report 10s after startup to log baseline
  setTimeout(() => {
    logMemoryStats('baseline');
  }, 10_000);

  monitorInterval = setInterval(() => {
    logMemoryStats('periodic');
  }, intervalMs);

  // Unref monitor interval so it does not block process shutdown
  if (monitorInterval.unref) {
    monitorInterval.unref();
  }
}

export function stopMemoryMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}
