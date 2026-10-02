"use client";

import { useEffect, useRef } from "react";

/**
 * Traînées lumineuses façon photo en pose longue : phares blancs qui arrivent,
 * feux arrière qui s'éloignent, le long d'une courbe d'autoroute nocturne.
 * Se met en pause hors écran et respecte « réduire les animations ».
 */

type Pt = { x: number; y: number };

interface Lane {
  p0: Pt;
  p1: Pt;
  p2: Pt;
  p3: Pt;
  dir: 1 | -1;
}

interface Streak {
  lane: number;
  t: number;
  speed: number;
  len: number;
  hue: "white" | "red" | "amber";
  alpha: number;
}

function bezier(l: Lane, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * l.p0.x + b * l.p1.x + c * l.p2.x + d * l.p3.x, y: a * l.p0.y + b * l.p1.y + c * l.p2.y + d * l.p3.y };
}

const COLORS = {
  white: [236, 243, 247],
  red: [214, 64, 52],
  amber: [232, 178, 104],
} as const;

export default function LightTrails({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let lanes: Lane[] = [];
    let streaks: Streak[] = [];
    let raf = 0;
    let visible = true;
    let last = performance.now();
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const city: { x: number; y: number; r: number; p: number }[] = [];

    function buildLanes() {
      const mobile = w < 760;
      const horizon = mobile ? 0.34 : 0.5;
      lanes = [];
      for (let i = 0; i < 6; i++) {
        const o = i - 2.5;
        const dir: 1 | -1 = i < 3 ? 1 : -1;
        lanes.push({
          p0: { x: w * 1.04, y: h * (horizon + o * 0.004) },
          p1: { x: w * 0.72, y: h * (horizon + 0.015 + o * 0.009) },
          p2: { x: w * (mobile ? 0.42 : 0.5), y: h * (horizon + 0.2 + o * 0.03) },
          p3: { x: -w * 0.08, y: h * (mobile ? 0.66 : 1.02) + o * h * 0.05 },
          dir,
        });
      }
      city.length = 0;
      const n = mobile ? 28 : 60;
      for (let i = 0; i < n; i++) {
        city.push({
          x: w * (0.5 + Math.random() * 0.55),
          y: h * (horizon - 0.02 - Math.random() * 0.05),
          r: 0.4 + Math.random() * 1.2,
          p: Math.random() * Math.PI * 2,
        });
      }
    }

    function spawn(atStart: boolean): Streak {
      const lane = Math.floor(Math.random() * lanes.length);
      const dir = lanes[lane]?.dir ?? 1;
      const hue: Streak["hue"] = dir === 1 ? (Math.random() < 0.12 ? "amber" : "white") : Math.random() < 0.85 ? "red" : "amber";
      const t = atStart ? Math.random() : dir === 1 ? -0.05 : 1.05;
      return { lane, t, speed: 0.035 + Math.random() * 0.05, len: 0.06 + Math.random() * 0.1, hue, alpha: 0.35 + Math.random() * 0.55 };
    }

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas!.clientWidth;
      h = canvas!.clientHeight;
      canvas!.width = Math.max(1, Math.round(w * dpr));
      canvas!.height = Math.max(1, Math.round(h * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildLanes();
      const count = w < 760 ? 34 : 72;
      streaks = Array.from({ length: count }, () => spawn(true));
    }

    function drawBackground(time: number) {
      ctx!.globalCompositeOperation = "source-over";
      ctx!.clearRect(0, 0, w, h);
      // Lueur de la ville à l'horizon
      const far = lanes[0]?.p0 ?? { x: w, y: h / 2 };
      const glow = ctx!.createRadialGradient(far.x - w * 0.12, far.y, 0, far.x - w * 0.12, far.y, w * 0.55);
      glow.addColorStop(0, "rgba(169,187,197,0.16)");
      glow.addColorStop(0.4, "rgba(169,187,197,0.05)");
      glow.addColorStop(1, "rgba(169,187,197,0)");
      ctx!.fillStyle = glow;
      ctx!.fillRect(0, 0, w, h);

      // Lumières lointaines
      ctx!.globalCompositeOperation = "lighter";
      for (const c of city) {
        const tw = reduce ? 0.6 : 0.45 + 0.35 * Math.sin(time / 900 + c.p);
        ctx!.fillStyle = `rgba(220,230,236,${0.25 * tw})`;
        ctx!.beginPath();
        ctx!.arc(c.x + pointer.x * 6, c.y + pointer.y * 3, c.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Rubans permanents (pose longue)
      for (const l of lanes) {
        ctx!.beginPath();
        for (let i = 0; i <= 40; i++) {
          const p = bezier(l, i / 40);
          if (i === 0) ctx!.moveTo(p.x, p.y);
          else ctx!.lineTo(p.x, p.y);
        }
        ctx!.strokeStyle = l.dir === 1 ? "rgba(220,232,238,0.035)" : "rgba(214,64,52,0.03)";
        ctx!.lineWidth = 6;
        ctx!.stroke();
      }
    }

    function drawStreak(s: Streak) {
      const l = lanes[s.lane];
      if (!l) return;
      const head = s.t;
      const tail = s.t - s.len * l.dir;
      const steps = 12;
      const pts: Pt[] = [];
      for (let i = 0; i <= steps; i++) {
        const tt = tail + ((head - tail) * i) / steps;
        if (tt < 0 || tt > 1) continue;
        pts.push(bezier(l, tt));
      }
      if (pts.length < 2) return;
      const [r, g, b] = COLORS[s.hue];
      const a = pts[0];
      const z = pts[pts.length - 1];
      const grad = ctx!.createLinearGradient(a.x, a.y, z.x, z.y);
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},${s.alpha})`);
      const depth = Math.max(0, Math.min(1, head));
      ctx!.strokeStyle = grad;
      ctx!.lineCap = "round";
      ctx!.lineWidth = 0.4 + depth * depth * 3.6;
      ctx!.beginPath();
      ctx!.moveTo(a.x, a.y);
      for (let i = 1; i < pts.length; i++) ctx!.lineTo(pts[i].x, pts[i].y);
      ctx!.stroke();
      // Halo
      ctx!.lineWidth = (0.4 + depth * depth * 3.6) * 4;
      ctx!.strokeStyle = `rgba(${r},${g},${b},${s.alpha * 0.06})`;
      ctx!.stroke();
    }

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;
      drawBackground(now);
      ctx!.globalCompositeOperation = "lighter";
      for (let i = 0; i < streaks.length; i++) {
        const s = streaks[i];
        const l = lanes[s.lane];
        if (!l) continue;
        // Plus rapide au premier plan (perspective)
        const persp = 0.25 + Math.max(0, Math.min(1, s.t)) * 1.7;
        s.t += l.dir * s.speed * persp * dt;
        if ((l.dir === 1 && s.t - s.len > 1) || (l.dir === -1 && s.t + s.len < 0)) streaks[i] = spawn(false);
        drawStreak(streaks[i]);
      }
      if (visible && !reduce) raf = requestAnimationFrame(frame);
    }

    resize();
    if (reduce) {
      frame(performance.now());
    } else {
      raf = requestAnimationFrame(frame);
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) frame(performance.now());
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = entry.isIntersecting && document.visibilityState === "visible";
      if (visible && !was && !reduce) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
    io.observe(canvas);

    const onVisibility = () => {
      const was = visible;
      visible = document.visibilityState === "visible";
      if (visible && !was && !reduce) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onPointer = (e: PointerEvent) => {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
