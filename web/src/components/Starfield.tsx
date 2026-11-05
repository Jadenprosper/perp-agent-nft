"use client";
import { useEffect, useRef } from "react";

const TINTS = ["255,254,239", "212,184,150", "196,165,116", "232,200,150"];

/** App-wide deep-space background: depth-layered warm stars slowly orbiting screen center. */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 768px)").matches;
    const COUNT = mobile ? 500 : 1400;
    let w = 0, h = 0, R = 0, raf = 0, last = 0, rot = 0;
    // Vortex cycle (seconds): wait → ease-in spin-up → hold → ease-out.
    const IN = 4.5, HOLD = 1.5, OUT = 3;
    const nextGap = () => 25 + Math.random() * 15;
    let vt = -nextGap(); // negative = time until next vortex
    const easeIn = (x: number) => x * x * x;
    const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
    const vortex = () => { // 0..1 intensity
      if (vt < 0) return 0;
      if (vt < IN) return easeIn(vt / IN);
      if (vt < IN + HOLD) return 1;
      if (vt < IN + HOLD + OUT) return 1 - easeOut((vt - IN - HOLD) / OUT);
      return 0;
    };
    // z: 0 far → 1 near. Polar coords around center so rotation is exact.
    type S = { rad: number; ang: number; z: number; c: string; tw: number };
    const stars: S[] = Array.from({ length: COUNT }, () => {
      const z = Math.pow(Math.random(), 1.8); // most stars far away
      return { rad: Math.sqrt(Math.random()), ang: Math.random() * Math.PI * 2, z,
        c: TINTS[(Math.random() * TINTS.length) | 0], tw: Math.random() * 6.28 };
    });
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight; R = Math.hypot(w, h) / 2;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(0);
    };
    const draw = (t: number, k = 0) => {
      if (k > 0.6) {
        // motion-blur trails at peak: translucent clear
        ctx.fillStyle = `rgba(10,9,8,${(0.35 - (k - 0.6) * 0.5).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      } else ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      for (const s of stars) {
        const a = s.ang + rot * (0.35 + s.z * 0.65);
        // lerp from home radius toward center; inner stars pulled less → spiral shape
        const rr = s.rad * (1 - k * (0.55 + 0.3 * s.rad));
        const x = cx + Math.cos(a) * rr * R, y = cy + Math.sin(a) * rr * R;
        if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
        const base = 0.4 + s.z * 0.6;
        const alpha = reduce ? base : Math.min(1, base * (0.85 + 0.15 * Math.sin(t / 1100 + s.tw)) + k * 0.15);
        const size = 0.6 + s.z * 1.6;
        if (!mobile && s.z > 0.75) { ctx.shadowColor = `rgba(${s.c},0.9)`; ctx.shadowBlur = 6; } else ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(${s.c},${alpha.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, size, 0, 6.2832); ctx.fill();
      }
      ctx.shadowBlur = 0;
    };
    const tick = (t: number) => {
      const dt = Math.min(0.05, last ? (t - last) / 1000 : 0); last = t;
      vt += dt;
      if (vt > IN + HOLD + OUT) vt = -nextGap();
      const k = vortex();
      rot += dt * (0.012 + k * 2.4); // slow drift → very fast spin at peak
      draw(t, k);
      raf = requestAnimationFrame(tick);
    };
    const start = () => { if (!reduce && !raf) { last = 0; raf = requestAnimationFrame(tick); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const onVis = () => (document.hidden ? stop() : start());
    resize(); start();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return (
    <>
      <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 h-screen w-screen" style={{ zIndex: -1 }} />
      <div aria-hidden className="pointer-events-none fixed inset-0" style={{ zIndex: -1,
        background: "radial-gradient(ellipse at center, rgba(10,9,8,0) 50%, rgba(10,9,8,0.3) 82%, rgba(10,9,8,0.6) 100%)" }} />
    </>
  );
}
