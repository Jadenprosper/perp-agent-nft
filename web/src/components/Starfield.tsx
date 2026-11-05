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
    const COUNT = mobile ? 260 : 780;
    let w = 0, h = 0, R = 0, raf = 0, last = 0, rot = 0;
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
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      for (const s of stars) {
        const a = s.ang + rot * (0.35 + s.z * 0.65); // near layers turn faster → parallax
        const x = cx + Math.cos(a) * s.rad * R, y = cy + Math.sin(a) * s.rad * R;
        if (x < -2 || y < -2 || x > w + 2 || y > h + 2) continue;
        const base = 0.18 + s.z * 0.7;
        const alpha = reduce ? base : base * (0.8 + 0.2 * Math.sin(t / 1100 + s.tw));
        ctx.fillStyle = `rgba(${s.c},${alpha.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, 0.35 + s.z * 1.5, 0, 6.2832); ctx.fill();
      }
    };
    const tick = (t: number) => {
      const dt = Math.min(0.05, last ? (t - last) / 1000 : 0); last = t;
      rot += dt * 0.012; // ~1 turn every ~9 min
      draw(t);
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
        background: "radial-gradient(ellipse at center, rgba(10,9,8,0) 35%, rgba(10,9,8,0.55) 75%, rgba(10,9,8,0.92) 100%)" }} />
    </>
  );
}
