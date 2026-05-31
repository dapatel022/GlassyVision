'use client';

import { useState, useEffect } from 'react';

interface DropCountdownProps {
  /** ISO timestamp of the drop release. When omitted, the date is not yet set. */
  targetDate?: string;
}

function diff(target: number) {
  const ms = Math.max(0, target - Date.now());
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    seconds: Math.floor((ms % 60_000) / 1000),
  };
}

export default function DropCountdown({ targetDate }: DropCountdownProps) {
  const target = targetDate ? new Date(targetDate).getTime() : null;
  const valid = target !== null && !Number.isNaN(target);

  const [timeLeft, setTimeLeft] = useState(() => (valid ? diff(target!) : null));

  useEffect(() => {
    if (!valid) return;
    const tick = () => setTimeLeft(diff(target!));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [valid, target]);

  // No real release date configured yet — say so honestly rather than show a
  // fabricated, looping countdown.
  if (!valid || !timeLeft) {
    return <p className="font-mono text-2xl font-bold text-ink">TBA</p>;
  }

  const pad = (n: number) => n.toString().padStart(2, '0');
  const units: Array<[number, string]> = [
    [timeLeft.days, 'Days'],
    [timeLeft.hours, 'Hrs'],
    [timeLeft.minutes, 'Min'],
    [timeLeft.seconds, 'Sec'],
  ];

  return (
    <div className="flex gap-3 justify-center md:justify-start">
      {units.map(([value, label], i) => (
        <div key={label} className="flex items-center gap-3">
          <div className="flex flex-col items-center">
            <span className="bg-base border border-line rounded-lg w-10 py-1.5 font-mono text-sm font-bold text-ink shadow-sm">
              {pad(value)}
            </span>
            <span className="text-[8px] font-mono text-muted-soft uppercase tracking-wider mt-1">{label}</span>
          </div>
          {i < units.length - 1 && <span className="text-accent font-bold self-start mt-1.5 animate-pulse">:</span>}
        </div>
      ))}
    </div>
  );
}
