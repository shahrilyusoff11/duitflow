"use client";

import { useEffect, useState } from "react";

export type TrendPoint = {
  month: string;
  label: string;
  period: string;
  income: string;
  expense: string;
  incomeHeight: string;
  expenseHeight: string;
};

export function InteractiveTrendPlot({ points }: { points: TrendPoint[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const activeIndex = points.findIndex((point) => point.month === (hovered ?? focused));
  const active = points[activeIndex];

  useEffect(() => {
    if (!active) return;
    function dismiss(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setHovered(null);
        setFocused(null);
      }
    }
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [active]);

  return (
    <div
      className="plot interactive-plot"
      onPointerLeave={() => setHovered(null)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(null);
      }}
    >
      {points.map((point) => (
        <button
          key={point.month}
          type="button"
          className="plot-month"
          aria-label={`${point.period}, pendapatan ${point.income}, perbelanjaan ${point.expense}`}
          data-active={point === active}
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch") setHovered(point.month);
          }}
          onFocus={() => setFocused(point.month)}
          onClick={() => setFocused(point.month)}
        >
          <span className="plot-pair" aria-hidden="true">
            <i style={{ height: point.incomeHeight }} /><i style={{ height: point.expenseHeight }} />
          </span>
          {point.label}
        </button>
      ))}
      {active && (
        <div
          className="plot-values"
          aria-hidden="true"
          style={{ left: `clamp(0px, calc(${(activeIndex + 0.5) / points.length * 100}% - var(--plot-values-width) / 2), calc(100% - var(--plot-values-width)))` }}
        >
          <strong>{active.period}</strong>
          <dl>
            <div><dt>Pendapatan</dt><dd>{active.income}</dd></div>
            <div><dt>Perbelanjaan</dt><dd>{active.expense}</dd></div>
          </dl>
        </div>
      )}
    </div>
  );
}
