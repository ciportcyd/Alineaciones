import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";

/** Lista de imágenes en /public/jugadores/*.png (mismo nombre) */
const NAMES = [
  "AITOR","ALVARO","BELOPE","CUESTA","EIZAN","GABI","HIDALGO","IZAN",
  "JASON","JOSE MCO","KAI","LUCA","LUCAS","LUCASP","MARCOS","NASA",
  "PABLO","RAUL","RIOJA ED","ROBER","ROMO","RUBEN","SAUL","SULI","VIGO MC",
];

/** Crea jugadores: por defecto “home” (si no hay guardado) */
const makePlayers = () =>
  NAMES.map((name, i) => ({
    id: i + 1,
    name,
    img: `/jugadores/${encodeURIComponent(name)}.png`,
    area: "home", // "home" | "bench" | "field"
    x: 120,
    y: 120,
  }));

/** Plantilla por filas (como en tu foto): 5 filas de arriba a abajo.
 *  Reparte a TODOS en orden, de izquierda a derecha, en estas filas.
 *  Si quieres otras cantidades por fila, cambia ROW_COUNTS.
 */
const ROW_COUNTS = [5, 5, 5, 5, 4]; // total 24
const ROW_Y = [0.08, 0.28, 0.48, 0.68, 0.86]; // altura (0..1) de cada fila

// tamaño aprox de tarjeta cuando está en el campo (para centrar)
const CARD_W = 90;
const CARD_H = 112;

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

  /** DRAG */
  const drag = useRef({ id: null, dx: 0, dy: 0 });

  function onPointerDown(e, id) {
    e.preventDefault(); // arrastre inmediato
    const p = players.find(x => x.id === id);
    drag.current.id = id;

    if (p.area === "field" && fieldRef.current) {
      const rect = fieldRef.current.getBoundingClientRect();
      drag.current.dx = e.clientX - (rect.left + p.x);
      drag.current.dy = e.clientY - (rect.top  + p.y);
    } else {
      drag.current.dx = 0;
      drag.current.dy = 0;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    const id = drag.current.id;
    if (!id) return;
    const target = players.find(p => p.id === id);
    if (target.area !== "field") return;

    const rect = fieldRef.current.getBoundingClientRect();

    let x = e.clientX - rect.left - drag.current.dx;
    let y = e.clientY - rect.top  - drag.current.dy;

    x = Math.max(0, Math.min(x, rect.width  - CARD_W));
    y = Math.max(0, Math.min(y, rect.height - CARD_H));

    setPlayers(prev => prev.map(p => p.id === id ? ({ ...p, x, y }) : p));
  }

  function finishDrag(e) {
    const id = drag.current.id;
    if (!id) return;
    drag.current.id = null;

    const pt = { x: e.clientX, y: e.clientY };
    const inField = inside(pt, fieldRef.current);
    const inTop   = inside(pt, topRef.current);
    const inBot   = inside(pt, botRef.current);

    if (inField) {
      const rect = fieldRef.current.getBoundingClientRect();
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
  }

  useEffect(() => {
    const up = (e) => finishDrag(e);
    const cancel = () => { drag.current.id = null; };
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

  /** 👉 Colocar TODOS en el campo con la distribución por filas (plantilla) */
  function placeAllToFieldGrid() {
    if (!fieldRef.current) return;
    const rect = fieldRef.current.getBoundingClientRect();

    // Márgenes laterales para que no queden pegados al borde
    const leftMargin = 0.06 * rect.width;
    const rightMargin = 0.06 * rect.width;
    const usableWidth = rect.width - leftMargin - rightMargin;

    // Reparte N jugadores por filas según ROW_COUNTS
    const newPlayers = [...players];
    let idx = 0;

    ROW_COUNTS.forEach((perRow, rowIndex) => {
      const y = ROW_Y[rowIndex] * (rect.height - CARD_H);
      if (perRow <= 0) return;

      // espacios horizontales equidistantes
      for (let i = 0; i < perRow && idx < newPlayers.length; i++, idx++) {
        const t = perRow === 1 ? 0.5 : i / (perRow - 1); // 0..1
        const x = leftMargin + t * usableWidth - CARD_W / 2;
        newPlayers[idx] = {
          ...newPlayers[idx],
          area: "field",
          x: clamp(x, 0, rect.width - CARD_W),
          y: clamp(y, 0, rect.height - CARD_H),
        };
      }
    });

    // Si sobran jugadores (más que el total de la plantilla), colócalos al final abajo
    while (idx < newPlayers.length) {
      const x = leftMargin + (Math.random() * usableWidth) - CARD_W / 2;
      const y = 0.92 * (rect.height - CARD_H);
      newPlayers[idx] = {
        ...newPlayers[idx],
        area: "field",
        x: clamp(x, 0, rect.width - CARD_W),
        y: clamp(y, 0, rect.height - CARD_H),
      };
      idx++;
    }

    setPlayers(newPlayers);
  }

  /** Al cargar por primera vez, si no hay guardado, pon plantilla en campo */
  useEffect(() => {
    const saved = localStorage.getItem("alineacion-v3");
    if (!saved) {
      // Espera a que el campo tenga su tamaño
      requestAnimationFrame(() => placeAllToFieldGrid());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Exportar PNG con fecha */
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

  return (
    <div
      className="w-screen min-h-screen bg-neutral-900 text-white flex flex-col gap-2 p-2"
      onPointerMove={onPointerMove}
    >
      {/* Barra de acciones */}
      <div className="flex gap-2 justify-end flex-wrap">
        <button
          onClick={placeAllToFieldGrid}
          className="px-3 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-sm font-semibold"
        >
          ⚽ Todos al campo (plantilla)
        </button>
        <button
          onClick={exportPNG}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-semibold text-sm"
        >
          📸 Exportar Alineación
        </button>
      </div>

      {/* Exportable: CASA + CAMPO + BANQUILLO */}
      <div ref={exportRef} className="flex flex-col gap-2">

        {/* 🏠 CASA (sin scroll, visible todo) */}
        <section
          ref={topRef}
          className="bg-neutral-800 rounded-xl p-2"
          style={{ touchAction: 'none' }}
        >
          <Header title="🏠 En casa" count={atHome.length} />
          <StripGrid players={atHome} onPointerDown={onPointerDown} />
        </section>

        {/* ⚽ CAMPO (mismo ancho; más alto) */}
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

        {/* 🪑 BANQUILLO (sin scroll, visible todo) */}
        <section
          ref={botRef}
          className="bg-neutral-800 rounded-xl p-2"
          style={{ touchAction: 'none' }}
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

/** Rejilla densa para ver TODOS a la vez */
function StripGrid({ players, onPointerDown }) {
  return (
    <div className="grid grid-cols-7 sm:grid-cols-9 md:grid-cols-10 lg:grid-cols-12 gap-2">
      {players.map(p => (
        <div
          key={p.id}
          className="bg-neutral-700 rounded-lg p-1 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing touch-none"
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

/** Helpers */
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
