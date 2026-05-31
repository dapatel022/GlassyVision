import Link from 'next/link';
import { listAwaitingRx } from '@/features/admin/awaiting-rx/queries';

export const dynamic = 'force-dynamic';

function relativeDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default async function AwaitingRxPage() {
  const rows = await listAwaitingRx();

  const aged = rows.filter((r) => r.daysSinceOrder >= 30).length;
  const mid = rows.filter((r) => r.daysSinceOrder >= 14 && r.daysSinceOrder < 30).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-xs font-mono text-accent hover:underline uppercase tracking-wider font-bold">
          ← Back to Dashboard
        </Link>
      </div>

      <header>
        <h1 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-1">
          Orders awaiting Rx
        </h1>
        <p className="font-serif italic text-muted text-sm">
          Customers who haven&apos;t uploaded yet. Reminders run daily; aging rows may need a manual call.
        </p>
      </header>

      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-white border border-line rounded-lg">
            <div className="font-sans font-black text-3xl text-ink tabular-nums">{rows.length}</div>
            <div className="font-mono text-xs uppercase tracking-wider text-muted mt-1">Total awaiting</div>
          </div>
          <div className="p-4 bg-white border border-line rounded-lg">
            <div className="font-sans font-black text-3xl text-ink tabular-nums">{mid}</div>
            <div className="font-mono text-xs uppercase tracking-wider text-muted mt-1">14-29 days</div>
          </div>
          <div className={`p-4 bg-white border rounded-lg ${aged > 0 ? 'border-error/40' : 'border-line'}`}>
            <div className={`font-sans font-black text-3xl tabular-nums ${aged > 0 ? 'text-error' : 'text-ink'}`}>{aged}</div>
            <div className="font-mono text-xs uppercase tracking-wider text-muted mt-1">30+ days · triage</div>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-muted">No orders awaiting Rx upload.</p>
      ) : (
        <div className="overflow-x-auto bg-white border border-line rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-base-deeper text-xs font-mono uppercase tracking-wider text-muted-soft">
              <tr>
                <th className="text-left px-4 py-3">Order</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Placed</th>
                <th className="text-right px-4 py-3">Days</th>
                <th className="text-right px-4 py-3">Reminders</th>
                <th className="text-left px-4 py-3">Last reminder</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const aged30 = r.daysSinceOrder >= 30;
                const aged14 = r.daysSinceOrder >= 14;
                return (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-4 py-3 font-mono">{r.shopifyOrderNumber}</td>
                    <td className="px-4 py-3">{r.customerEmail}</td>
                    <td className="px-4 py-3 text-muted">{relativeDate(r.createdAt)}</td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${
                        aged30 ? 'font-bold text-error' : aged14 ? 'font-bold text-warning' : ''
                      }`}
                    >
                      {r.daysSinceOrder}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.remindersSent}</td>
                    <td className="px-4 py-3 text-muted">
                      {r.lastReminderAt
                        ? `Day ${r.lastReminderDay ?? '?'} · ${relativeDate(r.lastReminderAt)}`
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
