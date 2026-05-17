import cron, { type ScheduledTask } from 'node-cron';
import { runReminders } from './email';
import { readSettings } from './repo/settings';

let task: ScheduledTask | null = null;

export const startScheduler = () => {
  if (task) return;
  // Hourly: 0 minute of every hour.
  task = cron.schedule('0 * * * *', async () => {
    try {
      const s = readSettings();
      if (!s.dailyCheckEnabled) return;
      await runReminders();
    } catch (err) {
      console.error('[scheduler] tick failed', err);
    }
  });
};

export const stopScheduler = () => {
  task?.stop();
  task = null;
};
