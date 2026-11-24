import { useId } from "react";
import { AdminEmptyState } from "./AdminDashboardStates";

const LINE_COLORS = ["#20b486", "#f0a53a", "#4d8cff"];
const DONUT_COLORS = ["#20b486", "#4d8cff", "#f0a53a", "#a46bf5", "#f06e75"];
const BAR_GRADIENTS = {
  registrations: ["#5ae3b2", "#13845e"],
  orders: ["#8cc5ff", "#3765dc"],
  grossDeliveredOrderValue: ["#ffd36b", "#e77732"],
};
const DISTRIBUTION_COLORS = ["#20b486", "#4d8cff", "#f0a53a", "#a46bf5", "#f06e75"];
const AXIS_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
const compactValueFormatter = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function monthLabel(value) {
  const [year, month] = String(value).split("-");
  if (!year || !month) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short" })
    .format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
}

function createDonutStops(items, total) {
  let accumulated = 0;
  return items.map((item, index) => {
    const start = accumulated;
    accumulated += (numberValue(item.value) / total) * 100;
    return `${DONUT_COLORS[index % DONUT_COLORS.length]} ${start}% ${accumulated}%`;
  });
}

export function AdminBarChart({
  data,
  valueKey,
  label,
  color = "#2f8061",
  formatTick = (value) => String(value),
}) {
  const gradientId = `admin-bar-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (!data?.length) {
    return <AdminEmptyState message="No results for this time range." />;
  }

  const [gradientStart, gradientEnd] = BAR_GRADIENTS[valueKey] || [color, "#1c624c"];
  const width = 840;
  const height = 300;
  const padding = { top: 34, right: 18, bottom: 52, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maximum = Math.max(1, ...data.map((item) => numberValue(item[valueKey])));
  const slot = chartWidth / data.length;
  const barWidth = Math.min(46, slot * 0.64);
  const labelStep = Math.max(1, Math.ceil(data.length / 12));

  return (
    <div className="admin-chart" role="img" aria-label={label}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={gradientStart} />
            <stop offset="100%" stopColor={gradientEnd} />
          </linearGradient>
        </defs>
        {AXIS_FRACTIONS.map((fraction) => {
          const y = padding.top + chartHeight * fraction;
          return (
            <g key={fraction}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                className="admin-chart__grid"
              />
              <text x={padding.left - 12} y={y + 4} textAnchor="end" className="admin-chart__tick">
                {formatTick(Math.round(maximum * (1 - fraction)))}
              </text>
            </g>
          );
        })}
        {data.map((item, index) => {
          const value = numberValue(item[valueKey]);
          const barHeight = (value / maximum) * chartHeight;
          const x = padding.left + slot * index + (slot - barWidth) / 2;
          const y = padding.top + chartHeight - barHeight;
          const showLabel = index % labelStep === 0 || index === data.length - 1;
          return (
            <g key={item.month || index}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(2, barHeight)}
                rx="8"
                fill={`url(#${gradientId})`}
                className="admin-chart__bar"
              >
                <title>{`${item.month}: ${value}`}</title>
              </rect>
              {data.length <= 12 && value > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={Math.max(padding.top + 13, y - 9)}
                  textAnchor="middle"
                  className="admin-chart__value"
                >
                  {formatTick(value)}
                </text>
              )}
              {showLabel && (
                <text
                  x={x + barWidth / 2}
                  y={height - 12}
                  textAnchor="middle"
                  className="admin-chart__tick"
                >
                  {monthLabel(item.month)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function AdminTrendChart({ data, series, label }) {
  if (!data?.length) {
    return <AdminEmptyState message="No platform activity in this time range." />;
  }

  const width = 840;
  const height = 300;
  const padding = { top: 30, right: 20, bottom: 52, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maximum = Math.max(
    1,
    ...series.flatMap(({ key }) => data.map((item) => numberValue(item[key]))),
  );
  const x = (index) => padding.left + (
    data.length === 1 ? chartWidth / 2 : (chartWidth * index) / (data.length - 1)
  );
  const y = (value) => padding.top + chartHeight - (numberValue(value) / maximum) * chartHeight;
  const labelStep = Math.max(1, Math.ceil(data.length / 12));

  return (
    <div className="admin-chart-wrap">
      <div className="admin-chart" role="img" aria-label={label}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
          {AXIS_FRACTIONS.map((fraction) => {
            const gridY = padding.top + chartHeight * fraction;
            return (
              <g key={fraction}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={gridY}
                  y2={gridY}
                  className="admin-chart__grid"
                />
                <text
                  x={padding.left - 12}
                  y={gridY + 4}
                  textAnchor="end"
                  className="admin-chart__tick"
                >
                  {compactValueFormatter.format(Math.round(maximum * (1 - fraction)))}
                </text>
              </g>
            );
          })}
          {series.map((item, seriesIndex) => {
            const points = data.map((row, index) =>
              `${index === 0 ? "M" : "L"} ${x(index)} ${y(row[item.key])}`,
            );
            const path = points.join(" ");
            const baseline = padding.top + chartHeight;
            const areaPath = `${path} L ${x(data.length - 1)} ${baseline} L ${x(0)} ${baseline} Z`;
            const color = item.color || LINE_COLORS[seriesIndex % LINE_COLORS.length];
            return (
              <g key={item.key}>
                <path d={areaPath} fill={color} className="admin-chart__area" />
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {data.map((row, index) => (
                  <circle
                    key={`${row.month}-${item.key}`}
                    cx={x(index)}
                    cy={y(row[item.key])}
                    r="5"
                    fill={color}
                    className="admin-chart__point"
                  >
                    <title>{`${row.month} ${item.label}: ${numberValue(row[item.key])}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
          {data.map((row, index) => {
            const showLabel = index % labelStep === 0 || index === data.length - 1;
            return showLabel ? (
              <text
                key={row.month}
                x={x(index)}
                y={height - 12}
                textAnchor="middle"
                className="admin-chart__tick"
              >
                {monthLabel(row.month)}
              </text>
            ) : null;
          })}
        </svg>
      </div>
      <ul className="admin-chart-legend">
        {series.map((item, index) => (
          <li key={item.key}>
            <span style={{ backgroundColor: item.color || LINE_COLORS[index % LINE_COLORS.length] }} />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdminDonutChart({ items, label, centerLabel = "Users" }) {
  const total = items.reduce((sum, item) => sum + numberValue(item.value), 0);
  if (total === 0) {
    return <AdminEmptyState message="No distribution data is available yet." />;
  }

  const background = `conic-gradient(${createDonutStops(items, total).join(", ")})`;

  return (
    <div className="admin-donut-wrap">
      <div
        className="admin-donut"
        role="img"
        aria-label={label}
        style={{ background }}
      >
        <span>
          <strong>{total.toLocaleString()}</strong>
          <small>{centerLabel}</small>
        </span>
      </div>
      <ul className="admin-donut-legend">
        {items.map((item, index) => (
          <li key={item.label}>
            <span style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }} />
            <span className="admin-donut-legend__label">
              {item.label}
              <small>{((numberValue(item.value) / total) * 100).toFixed(0)}%</small>
            </span>
            <strong>{numberValue(item.value).toLocaleString()}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdminDistributionBars({ items, label }) {
  if (!items?.length) {
    return <AdminEmptyState message="No category data is available yet." />;
  }
  const maximum = Math.max(1, ...items.map((item) => numberValue(item.value)));

  return (
    <div className="admin-distribution" aria-label={label}>
      {items.map((item, index) => {
        const value = numberValue(item.value);
        const percentage = value === 0 ? 0 : Math.max(3, (value / maximum) * 100);
        return (
          <div className="admin-distribution__row" key={item.label}>
            <div className="admin-distribution__labels">
              <span>{item.label}</span>
              <strong>{value.toLocaleString()}</strong>
            </div>
            <div className="admin-distribution__track">
              <span
                style={{
                  width: `${percentage}%`,
                  "--distribution-color": DISTRIBUTION_COLORS[index % DISTRIBUTION_COLORS.length],
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
