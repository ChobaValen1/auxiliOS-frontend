"use client";

import * as React from "react";

type DivProps = React.ComponentProps<"div">;
type Tone = 1 | 2 | 3 | 4 | 5;

export type BarRaceDatum = {
  id: string;
  label: string;
  value: number;
  color?: Tone;
  icon?: React.ReactNode;
};

export type BarRaceChartProps = {
  data: BarRaceDatum[];
  topN?: number;
  duration?: number;
  rowHeight?: number;
  sort?: "desc" | "asc";
  max?: number;
  formatValue?: (value: number) => string;
  caption?: React.ReactNode;
  period?: React.ReactNode;
  showRankChange?: boolean;
  className?: string;
  ref?: DivProps["ref"];
};

const BAR = { 1: "bg-chart-1", 2: "bg-chart-2", 3: "bg-chart-3", 4: "bg-chart-4", 5: "bg-chart-5" } as const;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const defaultFormat = (value: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(value);

function useReducedMotion() {
  const [reduced, setReduced] = React.useState(true);
  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function useRollingNumber(target: number, duration: number, reduced: boolean) {
  const [shown, setShown] = React.useState(target);
  const current = React.useRef(target);
  React.useEffect(() => {
    if (reduced || duration <= 0) { current.current = target; setShown(target); return; }
    const start = performance.now();
    const begin = current.current;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      current.current = begin + (target - begin) * eased;
      setShown(current.current);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduced]);
  return shown;
}

type RowProps = {
  datum: BarRaceDatum;
  rank: number;
  previousRank: number | null;
  width: number;
  previousWidth: number | null;
  topN: number;
  rowHeight: number;
  duration: number;
  reduced: boolean;
  tone: Tone;
  format: (value: number) => string;
  showRankChange: boolean;
};

function Row({ datum, rank, previousRank, width, previousWidth, topN, rowHeight, duration, reduced, tone, format, showRankChange }: RowProps) {
  const rowRef = React.useRef(null as HTMLDivElement | null);
  const barRef = React.useRef(null as HTMLDivElement | null);
  const visible = rank < topN;
  const wasVisible = previousRank !== null && previousRank < topN;
  const shown = useRollingNumber(datum.value, visible ? duration : 0, reduced);
  const [chip, setChip] = React.useState(null as { kind: "up" | "down" | "new"; places: number } | null);
  const y = (visible ? rank : topN) * rowHeight;

  React.useLayoutEffect(() => {
    const row = rowRef.current;
    const bar = barRef.current;
    if (!row || !bar || reduced || typeof row.animate !== "function") return;
    const fromY = previousRank === null ? topN * rowHeight : (previousRank < topN ? previousRank : topN) * rowHeight;
    const entering = visible && !wasVisible;
    const leaving = !visible && wasVisible;
    const animations: Animation[] = [];
    if (fromY !== y || entering || leaving) {
      animations.push(row.animate([
        { transform: `translateY(${fromY}px)`, opacity: entering ? 0 : 1 },
        { transform: `translateY(${y}px)`, opacity: visible ? 1 : 0 },
      ], { duration, easing: EASE }));
    }
    if (previousWidth !== null && previousWidth !== width && (visible || leaving)) {
      animations.push(bar.animate([{ width: `${previousWidth}%` }, { width: `${width}%` }], { duration, easing: EASE }));
    }
    return () => animations.forEach(animation => animation.cancel());
  }, [rank, width, visible, reduced, duration]);

  React.useEffect(() => {
    if (!showRankChange || previousRank === null || !visible) return;
    const kind = !wasVisible ? "new" : previousRank > rank ? "up" : previousRank < rank ? "down" : null;
    if (!kind) return;
    setChip({ kind, places: Math.abs(previousRank - rank) });
    const timer = window.setTimeout(() => setChip(null), Math.max(900, duration * 2));
    return () => window.clearTimeout(timer);
  }, [rank, visible]);


  return <div ref={rowRef} data-row={datum.id} data-rank={rank} data-visible={visible?"true":"false"} aria-hidden="true"
    style={{height:rowHeight,transform:`translateY(${y}px)`,opacity:visible?1:0}} className="ax-race-row">
    <span className="ax-race-rank">{rank+1}</span><span className="ax-race-name" title={datum.label}>{datum.label}</span>
    <div className="ax-race-track"><div ref={barRef} data-bar className={"ax-race-bar ax-tone-"+tone} style={{width:width+"%"}}/></div>
    <span className="ax-race-value">{format(shown)}</span>
  </div>
}

function PeriodLabel({ period, reduced }: { period: React.ReactNode; reduced: boolean }) {
  const ref = React.useRef(null as HTMLSpanElement | null);
  const text = typeof period === "string" || typeof period === "number" ? String(period) : null;
  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node || reduced || typeof node.animate !== "function") return;
    const animation = node.animate([{ opacity: 0, transform: "translateY(3px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 300, easing: "ease-out" });
    return () => animation.cancel();
  }, [text, reduced]);
  return <span ref={ref} data-period className="font-mono text-xs tabular-nums text-muted-foreground">{period}</span>;
}

export function BarRaceChart({
  data,
  topN = 6,
  duration = 600,
  rowHeight = 44,
  sort = "desc",
  max,
  formatValue = defaultFormat,
  caption,
  period,
  showRankChange = true,
  className = "",
  ref,
}: BarRaceChartProps) {
  const reduced = useReducedMotion();
  const previous = React.useRef({} as { [id: string]: { rank: number; width: number } });
  const tones = React.useRef({} as { [id: string]: Tone });
  const sorted = [...data].sort((a, b) => (sort === "desc" ? b.value - a.value : a.value - b.value) || a.id.localeCompare(b.id));
  const visible = sorted.slice(0, topN);
  const scale = max ?? Math.max(1, ...visible.map((d) => d.value));
  const rows = sorted.map((datum, rank) => {
    if (!tones.current[datum.id]) tones.current[datum.id] = datum.color ?? (((Object.keys(tones.current).length % 5) + 1) as Tone);
    return { datum, rank, width: Math.max(0, Math.min(100, (datum.value / scale) * 100)), tone: datum.color ?? tones.current[datum.id]! };
  });
  const snapshot = previous.current;

  React.useLayoutEffect(() => {
    const next = {} as { [id: string]: { rank: number; width: number } };
    for (const row of rows) next[row.datum.id] = { rank: row.rank, width: row.width };
    previous.current = next;
  });

  return (
    <figure ref={ref} data-slot="bar-race-chart" data-rows={visible.length} className={`ax-race ${className}`}>
      {(caption || period) && (
        <figcaption className="ax-race-caption">
          <span className="text-sm font-medium">{caption}</span>
          {period !== undefined && <PeriodLabel period={period} reduced={reduced} />}
        </figcaption>
      )}
      <div className="ax-race-rows" style={{ height: topN * rowHeight }}>
        {rows.map((row) => (
          <Row
            key={row.datum.id}
            datum={row.datum}
            rank={row.rank}
            previousRank={snapshot[row.datum.id]?.rank ?? null}
            width={row.width}
            previousWidth={snapshot[row.datum.id]?.width ?? null}
            topN={topN}
            rowHeight={rowHeight}
            duration={duration}
            reduced={reduced}
            tone={row.tone}
            format={formatValue}
            showRankChange={showRankChange}
          />
        ))}
      </div>
      <div className="ax-chart-sr"><table>
        <caption>{typeof caption === "string" ? caption : "Ranking de prestadoras"}{typeof period === "string" ? ` · ${period}` : ""}</caption>
        <thead><tr><th scope="col">Posición</th><th scope="col">Prestadora</th><th scope="col">Valor</th></tr></thead>
        <tbody>
          {visible.map((datum, index) => (
            <tr key={datum.id}><td>{index + 1}</td><td>{datum.label}</td><td>{formatValue(datum.value)}</td></tr>
          ))}
        </tbody>
      </table></div>
    </figure>
  );
}

export default BarRaceChart;
