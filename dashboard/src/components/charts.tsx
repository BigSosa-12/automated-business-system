import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Tip } from './ui';
import { shortDay } from '../format';

// Lavender / purple gradients, quiet gridlines, transparent plot area. Status hues are used only where the series IS a status.
export const C = { lav: '#A78BFA', purple: '#8B5CF6', lilac: '#E9D5FF', good: '#6EE7B7', warn: '#FCD34D', bad: '#FCA5A5', mute: '#A7A1B5' };
const axis = { stroke: 'transparent', tick: { fill: '#A7A1B5', fontSize: 11 } } as const;
const GRID = <CartesianGrid vertical={false} stroke="rgba(233,213,255,0.08)" />;

export function GradDefs({ id, color }: { id: string; color: string }) {
  return <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.55} /><stop offset="100%" stopColor={color} stopOpacity={0.02} /></linearGradient></defs>;
}

export function AreaTrend({ data, x, y, name, color = C.lav, tall }: { data: Record<string, unknown>[]; x: string; y: string; name: string; color?: string; tall?: boolean }) {
  const id = `g-${y}-${name.length}`;
  return (
    <div className={`chart ${tall ? 'tall' : ''}`} role="img" aria-label={`${name} over time`}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
          <GradDefs id={id} color={color} />{GRID}
          <XAxis dataKey={x} {...axis} tickFormatter={(v: string) => shortDay(v)} minTickGap={22} />
          <YAxis {...axis} allowDecimals={false} width={46} />
          <Tooltip content={<Tip />} cursor={{ stroke: 'rgba(233,213,255,0.25)' }} />
          <Area type="monotone" dataKey={y} name={name} stroke={color} strokeWidth={2} fill={`url(#${id})`} dot={false} activeDot={{ r: 4, stroke: '#171321', strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarsSimple({ data, x, series, stacked, labelX }: {
  data: Record<string, unknown>[]; x: string; stacked?: boolean; labelX?: boolean;
  series: { key: string; name: string; color: string }[];
}) {
  return (
    <div className="chart" role="img" aria-label={series.map((s) => s.name).join(', ')}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 6, right: 8, left: -14, bottom: 0 }} barCategoryGap="28%">
          {GRID}
          <XAxis dataKey={x} {...axis} interval={0} tickFormatter={(v: string) => (labelX ? v : shortDay(v))} minTickGap={labelX ? 0 : 18}
            {...(labelX ? { angle: -30, textAnchor: 'end', height: 58 } : {})} />
          <YAxis {...axis} allowDecimals={false} width={46} />
          <Tooltip content={<Tip />} cursor={{ fill: 'rgba(167,139,250,0.08)' }} />
          {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: '#A7A1B5' }} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={stacked ? 's' : undefined}
              radius={stacked ? (i === series.length - 1 ? [5, 5, 0, 0] : 0) : [5, 5, 0, 0]} maxBarSize={30} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
