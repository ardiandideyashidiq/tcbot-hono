import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { useEffect, useRef } from 'react';

Chart.register(
  ArcElement,
  BarElement,
  BarController,
  DoughnutController,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);

interface RulesBreakdownChartProps {
  mandatoryCount: number;
  advisoryCount: number;
  darkMode: boolean;
}

export function RulesBreakdownChart({
  mandatoryCount,
  advisoryCount,
  darkMode,
}: RulesBreakdownChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const total = mandatoryCount + advisoryCount;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const textColor = darkMode ? '#CBD5E1' : '#334155';
    const borderColor = darkMode ? '#0F172A' : '#FFFFFF';

    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Aturan Wajib', 'Anjuran'],
        datasets: [
          {
            data: total > 0 ? [mandatoryCount, advisoryCount] : [1, 0],
            backgroundColor:
              total > 0
                ? ['#E11D48', '#2563EB']
                : [darkMode ? '#1E293B' : '#E2E8F0', 'transparent'],
            borderColor,
            borderWidth: 3,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: textColor,
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 16,
              font: {
                family: '"Plus Jakarta Sans", sans-serif',
                size: 12,
                weight: 500,
              },
            },
          },
          tooltip: {
            enabled: total > 0,
            backgroundColor: darkMode ? '#0F172A' : '#1E293B',
            titleColor: '#F8FAFC',
            bodyColor: '#E2E8F0',
            padding: 10,
            cornerRadius: 8,
          },
        },
      },
    });

    return () => chart.destroy();
  }, [mandatoryCount, advisoryCount, total, darkMode]);

  return (
    <div className="relative h-56 w-full">
      <canvas
        ref={canvasRef}
        aria-label={`Proporsi aturan: ${mandatoryCount} wajib, ${advisoryCount} anjuran`}
      />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8">
        <span className="text-2xl font-bold tracking-tight tabular-nums">
          {total}
        </span>
        <span className="text-xs text-muted-foreground">Total butir</span>
      </div>
    </div>
  );
}

interface CategoryBarChartProps {
  categories: Array<{ name: string; count: number }>;
  darkMode: boolean;
}

export function CategoryBarChart({
  categories,
  darkMode,
}: CategoryBarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const topCategories = [...categories]
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const tickColor = darkMode ? '#94A3B8' : '#475569';
    const gridColor = darkMode
      ? 'rgba(148, 163, 184, 0.12)'
      : 'rgba(15, 23, 42, 0.06)';

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels:
          topCategories.length > 0
            ? topCategories.map((c) => c.name)
            : ['Belum ada kategori'],
        datasets: [
          {
            label: 'Jumlah aturan',
            data:
              topCategories.length > 0
                ? topCategories.map((c) => c.count)
                : [0],
            backgroundColor: '#2563EB',
            hoverBackgroundColor: '#3B82F6',
            borderRadius: 6,
            barThickness: 18,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: darkMode ? '#0F172A' : '#1E293B',
            titleColor: '#F8FAFC',
            bodyColor: '#E2E8F0',
            padding: 10,
            cornerRadius: 8,
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              precision: 0,
              color: tickColor,
              font: { size: 11 },
            },
            grid: { color: gridColor },
          },
          y: {
            ticks: {
              color: tickColor,
              font: {
                family: '"Plus Jakarta Sans", sans-serif',
                size: 12,
                weight: 500,
              },
            },
            grid: { display: false },
          },
        },
      },
    });

    return () => chart.destroy();
  }, [categories, darkMode]);

  return (
    <div className="relative h-56 w-full">
      <canvas
        ref={canvasRef}
        aria-label="Distribusi jumlah aturan per kategori"
      />
    </div>
  );
}

interface LedgerMiniChartProps {
  labels: string[];
  values: number[];
  colors: string[];
  darkMode: boolean;
  ariaLabel: string;
}

export function LedgerMiniChart({
  labels,
  values,
  colors,
  darkMode,
  ariaLabel,
}: LedgerMiniChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const total = values.reduce((acc, v) => acc + v, 0);
    const borderColor = darkMode ? '#0F172A' : '#FFFFFF';

    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data: total > 0 ? values : [1],
            backgroundColor:
              total > 0 ? colors : [darkMode ? '#1E293B' : '#E2E8F0'],
            borderColor,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: total > 0,
            backgroundColor: darkMode ? '#0F172A' : '#1E293B',
            padding: 8,
            cornerRadius: 6,
          },
        },
      },
    });

    return () => chart.destroy();
  }, [labels, values, colors, darkMode]);

  return (
    <div className="relative size-14 shrink-0">
      <canvas ref={canvasRef} aria-label={ariaLabel} />
    </div>
  );
}
