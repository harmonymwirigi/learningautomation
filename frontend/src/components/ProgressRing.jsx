// A circular progress meter drawn as SVG. The track and the arc share a
// circle; the arc is dashed to exactly the fraction that should be filled.
export default function ProgressRing({
  percent = 0,
  size = 160,
  stroke = 12,
  label,
  sublabel,
  color = '#6366f1',
  trackColor = 'rgb(30 41 59)',
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (clamped / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        // Rotated so the arc starts at 12 o'clock rather than 3 o'clock.
        className="-rotate-90"
        role="img"
        aria-label={`${label || 'Progress'}: ${clamped} percent`}
      >
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={trackColor} strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          style={{ transition: 'stroke-dasharray 600ms ease-out' }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-bold text-white" style={{ fontSize: size / 4.5 }}>{clamped}%</span>
        {sublabel && (
          <span className="mt-0.5 px-2 text-xs leading-tight text-slate-400">{sublabel}</span>
        )}
      </div>
    </div>
  );
}

// Horizontal equivalent, for listing the components that make up the ring.
export function ProgressBar({ percent = 0, color = '#6366f1', muted = false }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${clamped}%`, backgroundColor: muted ? 'rgb(71 85 105)' : color }}
      />
    </div>
  );
}
