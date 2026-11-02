// Chart.js setup for the Dashboard and Reports screens (Misbah). Colours come from the theme in
// src/styles.css (--chart-1 ... --chart-5, --border, --muted-foreground), so charts follow light/dark mode.
import { useMemo } from 'react';
import { Chart, ArcElement, BarElement, CategoryScale, Filler, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js';
import { useTheme } from '../../components/theme-provider';

Chart.register(ArcElement, BarElement, CategoryScale, Filler, LinearScale, LineElement, PointElement, Tooltip);
Chart.defaults.font.family = '"Inter Variable", ui-sans-serif, system-ui, sans-serif';
Chart.defaults.font.size = 11;

// Turns any CSS colour (oklch, var(...)) into [r, g, b, a] by painting one pixel, because Chart.js only reads rgb/hex.
const probe = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d', { willReadFrequently: true }) : null;
function cssVarRGB(name) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!probe || !value) return [99, 102, 241, 1];
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a / 255];
}
const rgba = ([r, g, b, base = 1], a = 1) => `rgba(${r}, ${g}, ${b}, ${+(base * a).toFixed(3)})`;

// Reads the current theme colours. Re-reads when the user switches light/dark mode.
export function useChartTheme() {
  const { theme } = useTheme();
  return useMemo(() => {
    const series = [1, 2, 3, 4, 5].map((i) => cssVarRGB(`--chart-${i}`));
    return {
      theme,
      series,
      text: rgba(cssVarRGB('--muted-foreground')),
      grid: rgba(cssVarRGB('--border'), theme === 'dark' ? 0.7 : 0.9),
      foreground: cssVarRGB('--foreground'),
      card: rgba(cssVarRGB('--card')),
      tooltipBg: rgba(cssVarRGB('--popover')),
      tooltipText: rgba(cssVarRGB('--popover-foreground')),
      tooltipBorder: rgba(cssVarRGB('--border')),
      status: {
        success: cssVarRGB('--success'), info: cssVarRGB('--info'), warning: cssVarRGB('--warning'),
        danger: cssVarRGB('--danger'), brand: cssVarRGB('--primary'), neutral: cssVarRGB('--muted-foreground'),
      },
    };
  }, [theme]);
}

function tooltip(t, label) {
  return {
    backgroundColor: t.tooltipBg,
    titleColor: t.tooltipText,
    bodyColor: t.tooltipText,
    borderColor: t.tooltipBorder,
    borderWidth: 1,
    padding: 10,
    cornerRadius: 12,
    displayColors: false,
    titleFont: { weight: '600' },
    callbacks: { label },
  };
}

// Bar chart options. horizontal: bars run left to right (long asset names stay readable).
export function barOptions(t, { horizontal = false, unit = 'borrowing' } = {}) {
  const valueAxis = {
    beginAtZero: true,
    ticks: { precision: 0, color: t.text, font: { size: 11 } },
    grid: { color: t.grid, drawTicks: false },
    border: { display: false },
  };
  const labelAxis = {
    ticks: { color: t.text, autoSkip: !horizontal, maxRotation: 0, font: { size: 11 } },
    grid: { display: false },
    border: { display: false },
  };
  return {
    indexAxis: horizontal ? 'y' : 'x',
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: tooltip(t, (ctx) => `${ctx.formattedValue} ${unit}${ctx.raw === 1 ? '' : 's'}`),
    },
    scales: horizontal ? { x: valueAxis, y: labelAxis } : { x: labelAxis, y: valueAxis },
  };
}

// One series, filled with a soft gradient of the given theme colour (default: --chart-1).
export function barData(t, labels, values, { horizontal = false, color = t.series[0] } = {}) {
  const fill = (ctx) => {
    const { chart } = ctx;
    const area = chart.chartArea;
    if (!area) return rgba(color, 0.85);
    const g = horizontal
      ? chart.ctx.createLinearGradient(area.left, 0, area.right, 0)
      : chart.ctx.createLinearGradient(0, area.bottom, 0, area.top);
    g.addColorStop(0, rgba(color, 0.45));
    g.addColorStop(1, rgba(color, 1));
    return g;
  };
  return {
    labels,
    datasets: [{
      data: values,
      backgroundColor: fill,
      hoverBackgroundColor: rgba(color, 1),
      borderRadius: 999,
      borderSkipped: false, // pill-shaped bars (Neon Noir)
      maxBarThickness: horizontal ? 14 : 10,
      categoryPercentage: 0.7,
    }],
  };
}

// Doughnut (ring) chart: items = [{ label, value, tone }] where tone is a StatCard tone name.
export function doughnutData(t, items) {
  return {
    labels: items.map((i) => i.label),
    datasets: [{
      data: items.map((i) => i.value),
      backgroundColor: items.map((i) => rgba(t.status[i.tone] || t.series[0])),
      borderColor: t.card,
      borderWidth: 4,
      hoverOffset: 6,
      borderRadius: 4,
      spacing: 1,
    }],
  };
}

export function doughnutOptions(t) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: { display: false },
      tooltip: tooltip(t, (ctx) => ` ${ctx.label}: ${ctx.formattedValue}`),
    },
  };
}

// Line (area) chart: a glowing series (default lime) plus an optional dashed comparison line.
// series: [{ label, values, color?, dashed? }]
export function lineData(t, labels, series) {
  return {
    labels,
    datasets: series.map((s, i) => {
      const color = s.color || (i === 0 ? t.series[1] : t.foreground);
      return {
        label: s.label,
        data: s.values,
        borderColor: rgba(color, s.dashed ? 0.45 : 1),
        borderWidth: s.dashed ? 1.5 : 2.25,
        borderDash: s.dashed ? [5, 5] : undefined,
        tension: 0.42,
        pointRadius: 0,
        pointHoverRadius: s.dashed ? 0 : 5,
        pointHoverBackgroundColor: rgba(color),
        pointHoverBorderColor: t.card,
        pointHoverBorderWidth: 3,
        fill: s.dashed ? false : 'origin',
        backgroundColor: s.dashed
          ? 'transparent'
          : (ctx) => {
              const { chart } = ctx;
              if (!chart.chartArea) return rgba(color, 0.15);
              const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
              g.addColorStop(0, rgba(color, 0.28));
              g.addColorStop(1, rgba(color, 0));
              return g;
            },
      };
    }),
  };
}

export function lineOptions(t, { unit = 'borrowing' } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: tooltip(t, (ctx) => `${ctx.dataset.label}: ${ctx.formattedValue}${ctx.datasetIndex === 0 ? ` ${unit}${ctx.raw === 1 ? '' : 's'}` : ''}`),
    },
    scales: {
      x: { ticks: { color: t.text, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, grid: { display: false }, border: { display: false } },
      y: { beginAtZero: true, ticks: { precision: 0, color: t.text, maxTicksLimit: 4 }, grid: { color: t.grid, drawTicks: false }, border: { display: false } },
    },
  };
}
