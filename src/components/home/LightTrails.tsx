"use client";

import { useEffect, useRef } from "react";

/**
 * Traînées lumineuses façon photo en pose longue : phares blancs qui arrivent,
 * feux arrière qui s'éloignent, le long d'une courbe d'autoroute nocturne.
 * Économe : démarre après le chargement de la page, fond pré-rendu, pause hors écran, onglet caché et pendant la
 * saisie dans un champ ; téléphone : 30 images/s, moins de traînées, pause pendant le défilement, image fixe après
 * 25 s ; image fixe d'emblée si « réduire les animations » ou économiseur de données.
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

/** Image par seconde visée : 30 sur téléphone (mouvement lent, moitié moins de calcul), 60 sur ordinateur. */
const FPS_TOUCH = 30;
const FPS_DESKTOP = 60;
/** Reprise de l'animation après la fin du défilement (téléphone : défilement fluide, l'image reste figée pendant). */
const SCROLL_RESUME_MS = 180;
/** Téléphone : durée d'animation, puis image fixe (pose longue) — l'effet d'arrivée reste, la batterie aussi. */
const TOUCH_ANIMATION_MS = 25_000;

export default function LightTrails({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    // Image fixe (pose longue) : « réduire les animations » ou économiseur de données
    const still = reduce || saveData;
    const frameMs = 1000 / (touch ? FPS_TOUCH : FPS_DESKTOP);
    let w = 0;
    let h = 0;
    let dpr = 1;
    let lanes: Lane[] = [];
    let streaks: Streak[] = [];
    /** Fond pré-rendu à chaque redimensionnement (lueur + rubans) : recopié tel quel à chaque image. */
    let backdrop: HTMLCanvasElement | null = null;
    let raf = 0;
    let onScreen = true;
    let scrolling = false;
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    /** L'animation démarre après le chargement de la page : elle ne retarde ni l'affichage ni la réservation. */
    let ready = false;
    /** Champ du formulaire en cours de saisie : pas de dessin (le clavier et l'autocomplétion passent avant). */
    let typing = false;
    /** Temps d'animation déjà écoulé (téléphone : arrêt après TOUCH_ANIMATION_MS). */
    let animated = 0;
    let idleId = 0;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let last = performance.now();
    let lastDraw = 0;
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
      w = canvas!.clientWidth;
      h = canvas!.clientHeight;
      // Téléphone : densité limitée à 1,5 (traînées fines identiques à l'œil, 45 % de pixels en moins qu'en ×2)
      dpr = Math.min(w < 760 || touch ? 1.5 : 2, window.devicePixelRatio || 1);
      canvas!.width = Math.max(1, Math.round(w * dpr));
      canvas!.height = Math.max(1, Math.round(h * dpr));
      buildLanes();
      buildBackdrop();
      const count = w < 760 ? 22 : touch ? 40 : 72;
      streaks = Array.from({ length: count }, () => spawn(true));
    }

    /** Lueur de la ville et rubans permanents : immobiles, dessinés une fois par taille d'écran. */
    function buildBackdrop() {
      backdrop = document.createElement("canvas");
      backdrop.width = canvas!.width;
      backdrop.height = canvas!.height;
      const b = backdrop.getContext("2d");
      if (!b) {
        backdrop = null;
        return;
      }
      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Lueur de la ville à l'horizon
      const far = lanes[0]?.p0 ?? { x: w, y: h / 2 };
      const glow = b.createRadialGradient(far.x - w * 0.12, far.y, 0, far.x - w * 0.12, far.y, w * 0.55);
      glow.addColorStop(0, "rgba(169,187,197,0.16)");
      glow.addColorStop(0.4, "rgba(169,187,197,0.05)");
      glow.addColorStop(1, "rgba(169,187,197,0)");
      b.fillStyle = glow;
      b.fillRect(0, 0, w, h);

      // Rubans permanents (pose longue) — mélange additif : même rendu que dessinés à chaque image
      b.globalCompositeOperation = "lighter";
      for (const l of lanes) {
        b.beginPath();
        for (let i = 0; i <= 40; i++) {
          const p = bezier(l, i / 40);
          if (i === 0) b.moveTo(p.x, p.y);
          else b.lineTo(p.x, p.y);
        }
        b.strokeStyle = l.dir === 1 ? "rgba(220,232,238,0.035)" : "rgba(214,64,52,0.03)";
        b.lineWidth = 6;
        b.stroke();
      }
    }

    function drawBackground(time: number) {
      ctx!.globalCompositeOperation = "source-over";
      ctx!.setTransform(1, 0, 0, 1, 0, 0);
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      if (backdrop) ctx!.drawImage(backdrop, 0, 0);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Lumières lointaines
      ctx!.globalCompositeOperation = "lighter";
      for (const c of city) {
        const tw = still ? 0.6 : 0.45 + 0.35 * Math.sin(time / 900 + c.p);
        ctx!.fillStyle = `rgba(220,230,236,${0.25 * tw})`;
        ctx!.beginPath();
        ctx!.arc(c.x + pointer.x * 6, c.y + pointer.y * 3, c.r, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    function drawStreak(s: Streak) {
      const l = lanes[s.lane];
      if (!l) return;
      const head = s.t;
      const tail = s.t - s.len * l.dir;
      const steps = touch ? 8 : 12;
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
      // Halo : premier plan seulement (au loin il est invisible, large et coûteux en pixels)
      if (depth < (touch ? 0.45 : 0.3)) return;
      ctx!.lineWidth = (0.4 + depth * depth * 3.6) * 4;
      ctx!.strokeStyle = `rgba(${r},${g},${b},${s.alpha * 0.06})`;
      ctx!.stroke();
    }

    function draw(now: number, dt: number) {
      const ease = 1 - Math.pow(0.96, dt * 60);
      pointer.x += (pointer.tx - pointer.x) * ease;
      pointer.y += (pointer.ty - pointer.y) * ease;
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
    }

    const spent = () => touch && animated >= TOUCH_ANIMATION_MS;
    const running = () => !still && ready && onScreen && !scrolling && !typing && !spent() && document.visibilityState === "visible";

    function loop(now: number) {
      raf = 0;
      if (!running()) return;
      raf = requestAnimationFrame(loop);
      // Cadence plafonnée (écrans 90/120 Hz compris)
      if (now - lastDraw < frameMs - 2) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      lastDraw = now;
      animated += dt * 1000;
      draw(now, dt);
    }

    function start() {
      if (raf || !running()) return;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    resize();
    // Première image tout de suite (traînées déjà en place), animation ensuite
    draw(performance.now(), 0);

    const begin = () => {
      idleId = 0;
      ready = true;
      start();
    };
    // Safari (iOS) n'a pas requestIdleCallback
    const hasIdle = typeof window.requestIdleCallback === "function";
    const whenIdle = () => {
      if (hasIdle) idleId = window.requestIdleCallback(begin, { timeout: 2000 });
      else idleTimer = setTimeout(begin, 800);
    };
    if (!still) {
      if (document.readyState === "complete") whenIdle();
      else window.addEventListener("load", whenIdle, { once: true });
    }

    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now(), 0);
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    io.observe(canvas);

    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    document.addEventListener("visibilitychange", onVisibility);

    // Téléphone : pas de dessin pendant le défilement (le doigt garde toute la fluidité)
    const onScroll = () => {
      scrolling = true;
      stop();
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        scrolling = false;
        start();
      }, SCROLL_RESUME_MS);
    };
    if (touch && !still) window.addEventListener("scroll", onScroll, { passive: true });

    const isField = (el: EventTarget | null) => el instanceof HTMLElement && el.matches("input, select, textarea, [contenteditable]");
    const onFocusIn = (e: FocusEvent) => {
      if (!isField(e.target)) return;
      typing = true;
      stop();
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!isField(e.target) || isField(e.relatedTarget)) return;
      typing = false;
      start();
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    const onPointer = (e: PointerEvent) => {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    if (!touch) window.addEventListener("pointermove", onPointer, { passive: true });

    return () => {
      stop();
      clearTimeout(scrollTimer);
      if (idleId) window.cancelIdleCallback(idleId);
      clearTimeout(idleTimer);
      window.removeEventListener("load", whenIdle);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
