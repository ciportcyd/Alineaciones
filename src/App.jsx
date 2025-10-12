import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";

const NAMES = [
  "AITOR","ALVARO","BELOPE","CUESTA","EIZAN","GABI","HIDALGO","IZAN",
  "JASON","JOSE MCO","KAI","LUCA","LUCAS","LUCASP","MARCOS","NASA",
  "PABLO","RAUL","RIOJA ED","ROBER","ROMO","RUBEN","SAUL","SULI","VIGO MC",
];

const makePlayers = () =>
  NAMES.map((name, i) => ({
    id: i + 1,
    name,
    img: `/jugadores/${encodeURIComponent(name)}.png`,
    area: "home",
    x: 120,
    y: 120,
  }));

export default function App() {
  const fieldRef  = useRef(null);
  const topRef    = useRef(null);
  const botRef    = useRef(null);
  const exportRef = useRef(null);

  const [players, setPlayers] = useState(() => {
    const saved = localStorage.getItem("alineacion-v3");
    return saved ? JSON.parse(saved) : makePlayers();
  });

  useEffect(() => {
    localStorage.setItem("alineacion-v3", JSON.stringify(players));
  }, [players]);

  // ---- Drag state (con long-press en paneles) ----
  const drag = useRef({
    id: null,
    dx: 0,
    dy: 0,
    started: false,
    timer: null,
    startX: 0,
    startY: 0,
  });
  const LONG_PRESS_MS = 250;
  const CANCEL_MOVE_PX = 10;

  function onPointerDown(e, id) {
    const p = players.find(x => x.id === id);
    if (!p) return;

    // Si está en CAMPO: drag inmediato
    if (p.area === "field" && fieldRef.current) {
      e.preventDefault();
      const rect = fieldRef.current.getBoundingClientRect();
      drag.current = {
        id,
        dx: e.clientX - (rect.left + p.x),
        dy: e.clientY - (rect.top  + p.y),
        started: true,
        timer: null,
        startX: e.clientX,
        startY: e.clientY,
      };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }

    // Si está en panel (CASA/BANQUILLO): NO prevenimos por defecto (para permitir scroll).
    drag.current = {
      id: null,       // aún no “agarramos” al jugador; se activa tras long-press
      dx: 0,
      dy: 0,
      started: false,
      startX: e.clientX,
      startY: e.clientY,
      timer: window.setTimeout(() => {
        // activa el drag desde panel tras mantener pulsado
        drag.current.id = id;
        drag.current.started = true;
      }, LONG_PRESS_MS),
    };
  }

  function onPointerMove(e) {
    // Si todavía no empezó (antes del long-press), cancela si el dedo se mueve (scroll natural)
    if (!drag.current.started && drag.current.timer) {
      const dx = Math.abs(e.clientX - drag.current.startX);
      const dy = Math.abs(e.clientY - drag.current.startY);
      if (dx > CANCEL_MOVE_PX || dy > CANCEL_MOVE_PX) {
        clearTimeout(drag.current.timer);
        drag.current.timer = null; // el usuario está haciendo scroll, no drag
      }
      return;
    }

    // Movimiento en CAMPO (drag vivo)
    const id = drag.current.id;
    if (!id) return;
    const target = players.find(p => p.id === id);
    if (!target || target.area !== "field") return;

    const rect = fieldRef.current.getBoundingClientRect();
    const CARD_W = 90, CARD_H = 112;

    let x = e.clientX - rect.left - drag.current.dx;
    let y = e.clientY - rect.top  - drag.current.dy;
    x = Math.max(0, Math.min(x, rect.width  - CARD_W));
    y = Math.max(0, Math.min(y, rect.height - CARD_H));

    setPlayers(prev => prev.map(p => p.id === id ? ({ ...p, x, y }) : p));
  }

  function clearTimer() {
    if (drag.current.timer) {
      clearTimeout(drag.current.timer);
      drag.current.timer = null;
    }
  }

  function finishDrag(e) {
    // si no llegó a comenzar (no hubo long-press), no hacemos nada
    if (!drag.current.started) { clearTimer(); return; }

    const id = drag.current.id;
    clearTimer();
    drag.current.started = false;

    if (!id) return;

    const pt = { x: e.clientX, y: e.clientY };
    const inField = inside(pt, fieldRef.current);
    const inTop   = inside(pt, topRef.current);
    const inBot   = inside(pt, botRef.current);

    if (inField) {
      const rect = fieldRef.current.getBoundingClientRect();
      const CARD_W = 90, CARD_H = 112;
      let x = pt.x - rect.left - CARD_W / 2;
      let y = pt.y - rect.top  - CARD_H / 2;
      x = Math.max(0, Math.min(x, rect.width  - CARD_W));
      y = Math.max(0, Math.min(y, rect.height - CARD_H));
      setPlayers(prev => prev.map(p => p.id === id ? ({ ...p, area: "field", x, y }) : p));
    } else if (inTop) {
      setPlayers(prev => prev.map(p => p.id === id ? ({ ...p, area: "home" }) : p));
    } else if (inBot) {
      setPlayers(prev => prev.map(p => p.id === id ? ({ ...p, area: "bench" }) : p));
    }

    drag.current.id = null;
  }

  // Listeners globales para terminar drag aunque sueltes fuera
  useEffect(() => {
    const up = (e) => finishDrag(e);
    const cancel = (e) => { clearTimer(); drag.current.started = false; drag.current.id = null; };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, []);

  function inside(point, el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom;
  }

  const onField = players.filter(p => p.area === "field");
  const onBench = players.filter(p => p.area === "bench");
  const atHome  = players.filter(p => p.area === "home");

  // Exportar PNG (con fecha)
  async function exportPNG() {
    const canvas = await html2canvas(exportRef.current, {
      backgroundColor: "#0f0f0f",
      scale: 2,
    });
    const date = new Date().toISOString().split("T")[0];
    const link = document.createElement("a");
    link.download = `alineacion_${date}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function sendAllHome() {
    setPlayers(prev => prev.map(p => ({ ...p, area: "home" })));
  }

  return (
    <div className="w-screen min-h-screen bg-neutral-900 text-white flex flex-col gap-2 p-2" onPointerMove={onPointerMove}>

      {/* Barra de acciones */}
      <div className="flex gap-2 justify-end">
        <button
          onClick={sendAllHome}
          className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm"
        >
          🏠 Todos a casa
        </button>
        <button
          onClick={exportPNG}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-semibold text-sm"
        >
          📸 Exportar Alineación
        </button>
      </div>

      <div ref={exportRef} className="flex flex-col gap-2">

        {/* 🏠 CASA — scroll suave */}
        <section
          ref={topRef}
          className="bg-neutral-800 rounded-xl p-2 overflow-y-auto max-h-[38vh]"
          style={{ touchAction: 'pan-y' }}
        >
          <Header title="🏠 En casa" count={atHome.length} />
          <StripGrid players={atHome} onPointerDown={onPointerDown} />
        </section>

        {/* ⚽ CAMPO */}
        <main className="flex-1 flex items-center justify-center">
          <div
            ref={fieldRef}
            className="relative w-full max-w-[360px] sm:max-w-[420px] md:max-w-[480px] aspect-[9/20] bg-cover bg-center bg-no-repeat touch-none"
            style={{ backgroundImage: "url('/campo.png')" }}
          >
            {onField.map(p => (
              <div
                key={p.id}
                className="absolute cursor-grab active:cursor-grabbing touch-none"
                style={{ left: p.x, top: p.y }}
                onPointerDown={(e) => onPointerDown(e, p.id)}
              >
                <img
                  src={p.img}
                  alt={p.name}
                  className="w-20 sm:w-24 md:w-28 h-auto shadow-md pointer-events-none select-none"
                  draggable={false}
                  onError={(e) => { e.currentTarget.style.opacity = 0.3; }}
                />
              </div>
            ))}
          </div>
        </main>

        {/* 🪑 BANQUILLO — scroll suave */}
        <section
          ref={botRef}
          className="bg-neutral-800 rounded-xl p-2 overflow-y-auto max-h-[38vh]"
          style={{ touchAction: 'pan-y' }}
        >
          <Header title="🪑 Banquillo" count={onBench.length} />
          <StripGrid players={onBench} onPointerDown={onPointerDown} />
        </section>

      </div>
    </div>
  );
}

function Header({ title, count }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="font-semibold text-sm sm:text-base">{title}</h2>
      <span className="text-[10px] sm:text-xs bg-neutral-700 rounded px-2 py-0.5">{count}</span>
    </div>
  );
}

// Rejilla más densa para ver más jugadores sin hacer tanto scroll
function StripGrid({ players, onPointerDown }) {
  return (
    <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-7 gap-2 sm:gap-3">
      {players.map(p => (
        <div
          key={p.id}
          className="bg-neutral-700 rounded-lg p-1 sm:p-2 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => onPointerDown(e, p.id)}
          title={p.name}
        >
          <img
            src={p.img}
            alt={p.name}
            className="w-12 sm:w-14 md:w-16 h-auto pointer-events-none select-none"
            draggable={false}
            onError={(e)=>{ e.currentTarget.style.opacity = 0.3; }}
          />
          <div className="text-[9px] sm:text-[10px] leading-none mt-1 opacity-80 truncate w-full text-center px-1">
            {p.name}
          </div>
        </div>
      ))}
    </div>
  );
}
