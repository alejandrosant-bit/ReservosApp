// Red de partículas animada (la misma de la página web de Reservo).
// Se pausa sola cuando el lienzo no se ve y respeta "reducir movimiento".
export function iniciarRed(lienzo) {
  if (!lienzo || lienzo.dataset.red) return;
  lienzo.dataset.red = "1";
  const ctx = lienzo.getContext("2d");
  if (!ctx) return;
  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let puntos = [], ancho = 0, alto = 0, visible = true, raton = null, pedido = 0;

  function medir() {
    const r = lienzo.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    if (!r.width || !r.height) return;
    ancho = r.width; alto = r.height;
    lienzo.width = ancho * dpr; lienzo.height = alto * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(80, Math.round((ancho * alto) / 14000));
    puntos = Array.from({ length: n }, () => ({
      x: Math.random() * ancho, y: Math.random() * alto,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35, c: Math.random() < 0.18,
    }));
  }
  function dibujar() {
    pedido = 0;
    ctx.clearRect(0, 0, ancho, alto);
    for (const p of puntos) {
      if (!quieto) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > ancho) p.vx *= -1;
        if (p.y < 0 || p.y > alto) p.vy *= -1;
      }
      if (raton) {
        const dx = raton.x - p.x, dy = raton.y - p.y;
        if (Math.hypot(dx, dy) < 160) { p.x -= dx * 0.006; p.y -= dy * 0.006; }
      }
    }
    for (let i = 0; i < puntos.length; i++) {
      for (let j = i + 1; j < puntos.length; j++) {
        const a = puntos[i], b = puntos[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 130) {
          ctx.strokeStyle = `rgba(227,166,110,${(1 - d / 130) * 0.28})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    for (const p of puntos) {
      ctx.fillStyle = p.c ? "rgba(94,231,212,.9)" : "rgba(247,213,176,.75)";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.c ? 2 : 1.5, 0, 7); ctx.fill();
    }
    if (!quieto && visible && lienzo.isConnected && lienzo.offsetParent) pedido = requestAnimationFrame(dibujar);
  }
  const arrancar = () => { if (!pedido) pedido = requestAnimationFrame(dibujar); };

  medir();
  dibujar();
  addEventListener("resize", () => { medir(); arrancar(); });
  const zona = lienzo.parentElement;
  zona.addEventListener("pointermove", (e) => {
    const r = lienzo.getBoundingClientRect();
    raton = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  zona.addEventListener("pointerleave", () => (raton = null));
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) { if (!ancho) medir(); arrancar(); }
  }).observe(lienzo);
}
