import type { VehicleId } from "@/config/pricing";

/** Silhouettes de profil, tracé fin « platine ». */
const SHAPES: Record<VehicleId, { body: string; windows: string[]; belt: string; wheels: [number, number]; lights: [string, string] }> = {
  business: {
    body: "M18 88 L18 76 Q20 68 34 66 L92 60 Q106 46 138 38 L204 36 Q226 37 246 56 L288 62 Q300 64 302 74 L302 88 L268 88 A21 21 0 0 0 226 88 L102 88 A21 21 0 0 0 60 88 Z",
    windows: ["M104 60 Q116 47 140 42 L170 41 L170 59 Z", "M176 41 L204 40 Q220 41 236 56 L176 58 Z"],
    belt: "M36 70 L292 67",
    wheels: [81, 247],
    lights: ["M22 72 L38 70", "M292 65 L300 70"],
  },
  van: {
    body: "M16 88 L16 70 Q18 60 30 58 L58 52 Q72 32 92 26 L282 24 Q298 24 300 38 L302 88 L270 88 A21 21 0 0 0 228 88 L106 88 A21 21 0 0 0 64 88 Z",
    windows: [
      "M70 52 Q80 36 96 32 L130 31 L130 51 Z",
      "M136 31 L176 31 L176 50 L136 50 Z",
      "M182 31 L222 31 L222 50 L182 50 Z",
      "M228 31 L282 31 Q292 31 292 40 L292 50 L228 50 Z",
    ],
    belt: "M30 62 L298 60",
    wheels: [85, 249],
    lights: ["M20 66 L34 64", "M297 44 L300 56"],
  },
  prestige: {
    body: "M14 88 L14 77 Q16 69 32 67 L96 62 Q112 47 146 40 L218 38 Q244 39 262 56 L294 61 Q306 63 308 74 L308 88 L276 88 A21 21 0 0 0 234 88 L104 88 A21 21 0 0 0 62 88 Z",
    windows: ["M108 61 Q122 48 148 44 L180 43 L180 60 Z", "M186 43 L216 42 Q236 43 250 57 L186 59 Z"],
    belt: "M32 71 L298 68",
    wheels: [83, 255],
    lights: ["M18 73 L36 71", "M298 64 L306 70"],
  },
};

export default function VehicleGlyph({ id, className, detailed = false }: { id: VehicleId; className?: string; detailed?: boolean }) {
  const s = SHAPES[id];
  const gid = `veh-${id}-${detailed ? "d" : "s"}`;
  const w = detailed ? 1.4 : 1.2;
  return (
    <svg className={className} viewBox="0 0 320 112" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6f828d" />
          <stop offset="0.45" stopColor="#eef3f5" />
          <stop offset="1" stopColor="#8fa3ae" />
        </linearGradient>
      </defs>
      <path d={s.body} stroke={`url(#${gid})`} strokeWidth={w} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {s.windows.map((d) => (
        <path key={d} d={d} stroke={`url(#${gid})`} strokeWidth={w * 0.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" opacity="0.7" />
      ))}
      <path d={s.belt} stroke="#dbe3e8" strokeWidth={w * 0.6} vectorEffect="non-scaling-stroke" opacity="0.45" />
      {s.wheels.map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={88} r={15} stroke={`url(#${gid})`} strokeWidth={w} vectorEffect="non-scaling-stroke" />
          {detailed && <circle cx={cx} cy={88} r={6} stroke="#a9bbc5" strokeWidth={w * 0.7} vectorEffect="non-scaling-stroke" opacity="0.7" />}
        </g>
      ))}
      <path d={s.lights[0]} stroke="#f4f7f8" strokeWidth={w * 1.6} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      <path d={s.lights[1]} stroke="#c8463a" strokeWidth={w * 1.6} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      {detailed && <path d="M6 104 H314" stroke="url(#ground-fade)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      {detailed && (
        <defs>
          <linearGradient id="ground-fade" x1="0" x2="1">
            <stop offset="0" stopColor="#a9bbc5" stopOpacity="0" />
            <stop offset="0.5" stopColor="#a9bbc5" stopOpacity="0.5" />
            <stop offset="1" stopColor="#a9bbc5" stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
    </svg>
  );
}
