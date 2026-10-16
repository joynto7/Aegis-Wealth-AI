"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FastForward, Newspaper, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import type { ReplayEvent, ReplayPoint } from "@/lib/types";

const STEP_MS = 450;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2008-09" -> "Sep 2008". */
export function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${year}`;
}

/** A round tick spacing (1, 2 or 5 times a power of ten) giving about five ticks across the range. */
function niceUnit(range: number): number {
  const rough = Math.max(range, 1) / 5;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].find((m) => m * power >= rough) ?? 10;
  return step * power;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Month-by-month playback of a replay series (addition). It stops by itself
 * at the lowest month, so the client answers "what would you do?" at the
 * worst moment, not after seeing the recovery. With reduced motion, Play
 * jumps straight to the end. Remount (React key) for a new series.
 */
export function useReplayPlayback(length: number, lowestIndex: number, pauseAtLowest: boolean) {
  const [shown, setShown] = useState(length);
  const [playing, setPlaying] = useState(false);
  const [atLowest, setAtLowest] = useState(false);
  const [played, setPlayed] = useState(false);
  const shownRef = useRef(length);
  const stoppedAtLowest = useRef(false);

  const show = useCallback((n: number) => {
    shownRef.current = n;
    setShown(n);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const next = Math.min(shownRef.current + 1, length);
      show(next);
      if (pauseAtLowest && !stoppedAtLowest.current && next === lowestIndex + 1) {
        stoppedAtLowest.current = true;
        setPlaying(false);
        setAtLowest(true);
      } else if (next >= length) {
        setPlaying(false);
      }
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [playing, length, lowestIndex, pauseAtLowest, show]);

  const start = useCallback(
    (from: number) => {
      setPlayed(true);
      setAtLowest(false);
      if (prefersReducedMotion()) {
        show(length);
        setPlaying(false);
        return;
      }
      show(from);
      setPlaying(true);
    },
    [length, show]
  );

  const play = useCallback(() => {
    if (shownRef.current >= length) stoppedAtLowest.current = false;
    start(shownRef.current >= length ? 1 : shownRef.current);
  }, [length, start]);
  const resume = useCallback(() => start(shownRef.current), [start]);
  const restart = useCallback(() => {
    stoppedAtLowest.current = false;
    start(1);
  }, [start]);
  const pause = useCallback(() => setPlaying(false), []);
  const skipToEnd = useCallback(() => {
    setPlaying(false);
    setAtLowest(false);
    show(length);
  }, [length, show]);

  return { shown, playing, atLowest, played, play, pause, resume, skipToEnd, restart };
}

export type ReplayPlayback = ReturnType<typeof useReplayPlayback>;

export function ReplayPlayer({
  series,
  startValue,
  lowestMonth,
  events,
  eventsLabel,
  playback,
}: {
  series: ReplayPoint[];
  startValue: number;
  lowestMonth: string;
  events: ReplayEvent[];
  eventsLabel: string;
  playback: ReplayPlayback;
}) {
  const { shown, playing, play, pause, skipToEnd, restart, played } = playback;
  const current = series[Math.max(0, Math.min(shown, series.length) - 1)];
  const values = series.map((p) => p.value);
  const low = Math.min(startValue, ...values);
  const high = Math.max(startValue, ...values);
  // A fixed axis on round numbers, so it does not jump while the line is drawn.
  const unit = niceUnit(high - low);
  const domain: [number, number] = [Math.floor(low / unit) * unit, Math.ceil(high / unit) * unit];
  const data = series.map((p, i) => ({ month: p.month, value: i < shown ? p.value : null }));
  const change = current ? current.value - startValue : 0;
  const changePct = startValue ? (change / startValue) * 100 : 0;
  const reached = events.filter((e) => current && e.month <= current.month);
  const latestEvent = reached[reached.length - 1];
  const lowestReached = current && current.month >= lowestMonth;
  const lowestPoint = series.find((p) => p.month === lowestMonth);
  const finished = shown >= series.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-caption text-(--text-muted)">{current ? monthLabel(current.month) : "—"}</p>
          <p className="text-key-figure tabular-nums text-(--text)" aria-live={playing ? "off" : "polite"}>
            {current ? formatMoney(current.value) : "—"}
          </p>
          <p className="text-body tabular-nums text-(--text-muted)">
            {change >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(change))} ({change >= 0 ? "+" : "−"}
            {Math.abs(changePct).toFixed(1)}%) since you started with {formatMoney(startValue)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {playing ? (
            <Button variant="outline" onClick={pause}>
              <Pause className="size-4" /> Pause
            </Button>
          ) : (
            <Button onClick={finished && played ? restart : play}>
              {finished && played ? <RotateCcw className="size-4" /> : <Play className="size-4" />}
              {finished && played ? "Play again" : played ? "Continue" : "Play it month by month"}
            </Button>
          )}
          {!finished ? (
            <Button variant="outline" onClick={skipToEnd}>
              <FastForward className="size-4" /> Skip to the end
            </Button>
          ) : null}
        </div>
      </div>

      <div className="h-72 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--text-muted)" }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis
              domain={domain}
              ticks={Array.from({ length: Math.round((domain[1] - domain[0]) / unit) + 1 }, (_, i) => domain[0] + i * unit)}
              allowDataOverflow
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              tickFormatter={(v: number) => formatMoney(v)}
              width={96}
            />
            <Tooltip
              formatter={(value) => [formatMoney(Number(value)), "Value"]}
              labelFormatter={(label) => monthLabel(String(label))}
              contentStyle={{ borderRadius: 8, borderColor: "var(--border)", fontSize: 13 }}
            />
            <ReferenceLine y={startValue} stroke="var(--text-muted)" strokeDasharray="4 4" />
            {reached.map((e) => (
              <ReferenceLine key={e.month} x={e.month} stroke="var(--text-muted)" strokeOpacity={0.5} strokeDasharray="2 4" />
            ))}
            <Line type="monotone" dataKey="value" stroke="#1d4ed8" strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls={false} />
            {lowestReached && lowestPoint ? (
              <ReferenceDot x={lowestPoint.month} y={lowestPoint.value} r={5} fill="#0f172a" stroke="#ffffff" strokeWidth={2} />
            ) : null}
            {current && !finished ? (
              <ReferenceDot x={current.month} y={current.value} r={6} fill="#1d4ed8" stroke="#ffffff" strokeWidth={2} />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-body">
        <Newspaper className="mt-0.5 size-4 shrink-0 text-(--primary)" aria-hidden />
        <p className="min-h-6">
          {latestEvent ? (
            <>
              <span className="font-medium text-(--text)">{monthLabel(latestEvent.month)}:</span>{" "}
              <span className="text-(--text)">{latestEvent.text}</span>
            </>
          ) : (
            <span className="text-(--text-muted)">News from the months you watch appears here.</span>
          )}
          <span className="mt-0.5 block text-caption text-(--text-muted)">{eventsLabel}</span>
        </p>
      </div>
    </div>
  );
}
