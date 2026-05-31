'use client';

import { useState, useEffect } from 'react';

export default function DropCountdown() {
  const [timeLeft, setTimeLeft] = useState({
    days: 4,
    hours: 12,
    minutes: 45,
    seconds: 30,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 };
        } else if (prev.minutes > 0) {
          return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        } else if (prev.hours > 0) {
          return { ...prev, hours: prev.hours - 1, minutes: 59, seconds: 59 };
        } else if (prev.days > 0) {
          return { days: prev.days - 1, hours: 23, minutes: 59, seconds: 59 };
        } else {
          // loop back for demo stability
          return { days: 4, hours: 12, minutes: 45, seconds: 30 };
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  function pad(num: number) {
    return num.toString().padStart(2, '0');
  }

  return (
    <div className="flex gap-3 justify-center md:justify-start">
      <div className="flex flex-col items-center">
        <span className="bg-base border border-line rounded-lg w-10 py-1.5 font-mono text-sm font-bold text-accent shadow-sm">
          {pad(timeLeft.days)}
        </span>
        <span className="text-[8px] font-mono text-muted-soft uppercase tracking-wider mt-1">Days</span>
      </div>
      <span className="text-accent font-bold self-center -mt-3 animate-pulse">:</span>
      <div className="flex flex-col items-center">
        <span className="bg-base border border-line rounded-lg w-10 py-1.5 font-mono text-sm font-bold text-ink shadow-sm">
          {pad(timeLeft.hours)}
        </span>
        <span className="text-[8px] font-mono text-muted-soft uppercase tracking-wider mt-1">Hrs</span>
      </div>
      <span className="text-accent font-bold self-center -mt-3 animate-pulse">:</span>
      <div className="flex flex-col items-center">
        <span className="bg-base border border-line rounded-lg w-10 py-1.5 font-mono text-sm font-bold text-ink shadow-sm">
          {pad(timeLeft.minutes)}
        </span>
        <span className="text-[8px] font-mono text-muted-soft uppercase tracking-wider mt-1">Min</span>
      </div>
      <span className="text-accent font-bold self-center -mt-3 animate-pulse">:</span>
      <div className="flex flex-col items-center">
        <span className="bg-base border border-line rounded-lg w-10 py-1.5 font-mono text-sm font-bold text-ink shadow-sm">
          {pad(timeLeft.seconds)}
        </span>
        <span className="text-[8px] font-mono text-muted-soft uppercase tracking-wider mt-1">Sec</span>
      </div>
    </div>
  );
}
