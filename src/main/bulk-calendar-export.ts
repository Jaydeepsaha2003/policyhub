import { dialog } from 'electron';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import { getRawSqlite } from './db';

const paiseToRupees = (p: number | null | undefined) =>
  p === null || p === undefined ? null : p / 100;

// Filter-aware Excel export from the Calendar tab. Renderer passes the
// list of currently-visible event IDs (after its in-page filters), and
// we hydrate from the DB and write a single-sheet workbook. When
// `eventIds` is undefined we export every non-deleted event.
export const exportCalendarEvents = async (opts?: {
  eventIds?: string[];
}): Promise<{ saved: boolean; path?: string; rowCount?: number }> => {
  const sqlite = getRawSqlite();

  let rows: any[];
  if (opts?.eventIds !== undefined) {
    if (opts.eventIds.length === 0) {
      rows = [];
    } else {
      const placeholders = opts.eventIds.map(() => '?').join(',');
      rows = sqlite
        .prepare(
          `SELECT id, title, category, custom_category AS customCategory,
                  event_date AS eventDate, status,
                  is_recurring AS isRecurring, frequency,
                  occurrence_no AS occurrenceNo,
                  occurrence_total AS occurrenceTotal,
                  reminder_offsets_days AS reminderOffsetsDays,
                  amount, completed_date AS completedDate, notes
             FROM calendar_events
            WHERE id IN (${placeholders})
              AND deleted_at IS NULL
            ORDER BY event_date ASC`,
        )
        .all(...opts.eventIds) as any[];
    }
  } else {
    rows = sqlite
      .prepare(
        `SELECT id, title, category, custom_category AS customCategory,
                event_date AS eventDate, status,
                is_recurring AS isRecurring, frequency,
                occurrence_no AS occurrenceNo,
                occurrence_total AS occurrenceTotal,
                reminder_offsets_days AS reminderOffsetsDays,
                amount, completed_date AS completedDate, notes
           FROM calendar_events
          WHERE deleted_at IS NULL
          ORDER BY event_date ASC`,
      )
      .all() as any[];
  }

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export calendar events',
    defaultPath: `calendar-events-${format(new Date(), 'yyyyMMdd-HHmmss')}.xlsx`,
    filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
  });
  if (canceled || !filePath) return { saved: false };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PolicyHub';
  wb.created = new Date();
  const ws = wb.addWorksheet('Calendar Events', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.columns = [
    { header: 'Title', key: 'title', width: 28 },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Custom label', key: 'customCategory', width: 18 },
    { header: 'Date', key: 'eventDate', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Recurring', key: 'isRecurring', width: 10 },
    { header: 'Frequency', key: 'frequency', width: 12 },
    { header: 'Occurrence', key: 'occurrenceNo', width: 10 },
    { header: 'Of', key: 'occurrenceTotal', width: 8 },
    { header: 'Reminder offsets (days)', key: 'reminderOffsetsDays', width: 22 },
    { header: 'Amount (₹)', key: 'amount', width: 14 },
    { header: 'Completed on', key: 'completedDate', width: 14 },
    { header: 'Notes', key: 'notes', width: 32 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const r of rows) {
    ws.addRow({
      ...r,
      amount: paiseToRupees(r.amount),
      isRecurring: r.isRecurring ? 'Yes' : 'No',
    });
  }

  await wb.xlsx.writeFile(filePath);
  return { saved: true, path: filePath, rowCount: rows.length };
};
