import { useEffect, useRef, useState } from 'react';

const MINI_MEDIEVAL_BASE = '/assets/mini-medieval/Mini-Medieval-8x8';
const TILE = 8;
const SCALE = 3;

type Selection = {
  sheet: string;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

const SHEETS = [
  'Animals.png',
  'Crops.png',
  'dMVoRP.png',
  'Interface.png',
  'Items.png',
  'Misc.png',
  'Ores.png',
  'Overworld.png',
  'Ships.png',
  'Structures.png',
  'Units.png',
  'Walls.png',
];

function formatSpriteId(s: Selection): string {
  return `${s.sheet}|${s.sx},${s.sy},${s.sw},${s.sh}`;
}

function SheetPicker({
  sheet,
  onPick,
  frameW,
  frameH,
}: {
  sheet: string;
  onPick: (pick: Selection) => void;
  frameW: number;
  frameH: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [selected, setSelected] = useState<{ tx: number; ty: number } | null>(null);

  useEffect(() => {
    setSelected(null);
  }, [frameW, frameH, sheet]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setImgSize({ w, h });

      canvas.width = w * SCALE;
      canvas.height = h * SCALE;
      canvas.style.width = `${w * SCALE}px`;
      canvas.style.height = `${h * SCALE}px`;

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(130,140,170,0.25)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += TILE) {
        const px = x * SCALE + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, canvas.height);
      }
      for (let y = 0; y <= h; y += TILE) {
        const py = y * SCALE + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(canvas.width, py);
      }
      ctx.stroke();
    };
    img.src = `${MINI_MEDIEVAL_BASE}/${sheet}`;
  }, [sheet]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!imgSize) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / SCALE);
    const y = Math.floor((e.clientY - rect.top) / SCALE);
    const tx = Math.floor(x / TILE) * TILE;
    const ty = Math.floor(y / TILE) * TILE;
    setSelected({ tx, ty });
    onPick({ sheet, sx: tx, sy: ty, sw: frameW, sh: frameH });
  };

  // Draw + auto-clear yellow selection rectangle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgSize || !selected) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#ffdc74';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      selected.tx * SCALE + 1,
      selected.ty * SCALE + 1,
      frameW * SCALE - 2,
      frameH * SCALE - 2,
    );
    const timer = setTimeout(() => {
      // Redraw the image to clear the rectangle
      const img = new Image();
      img.onload = () => {
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(130,140,170,0.25)';
        ctx.lineWidth = 1;
        for (let gx = 0; gx <= img.naturalWidth; gx += TILE) {
          const px = gx * SCALE + 0.5;
          ctx.moveTo(px, 0); ctx.lineTo(px, canvas.height);
        }
        for (let gy = 0; gy <= img.naturalHeight; gy += TILE) {
          const py = gy * SCALE + 0.5;
          ctx.moveTo(0, py); ctx.lineTo(canvas.width, py);
        }
        ctx.stroke();
      };
      img.src = `${MINI_MEDIEVAL_BASE}/${sheet}`;
      setSelected(null);
    }, 800);
    return () => clearTimeout(timer);
  }, [imgSize, selected, frameW, frameH, sheet]);

  return (
    <details style={detailsStyle}>
      <summary style={summaryStyle}>{sheet}</summary>
      <div style={sheetWrapStyle}>
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          style={{ cursor: 'crosshair', imageRendering: 'pixelated', border: '1px solid #2f3648', borderRadius: 8 }}
        />
      </div>
      <div style={hintStyle}>Kliknij sprite, a u góry dostaniesz identyfikator do podania w rozmowie.</div>
    </details>
  );
}

export function LibraryPage() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [frameW, setFrameW] = useState(8);
  const [frameH, setFrameH] = useState(8);
  const [animFrames, setAnimFrames] = useState(1);
  const [copyStatus, setCopyStatus] = useState<string>('');
  const spriteId = selection ? formatSpriteId(selection) : null;
  const animId = selection
    ? `${selection.sheet}|${selection.sx},${selection.sy},${selection.sw},${selection.sh};frames=${animFrames};step=${selection.sw}`
    : null;

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('Skopiowano do schowka');
      setTimeout(() => setCopyStatus(''), 1000);
    } catch {
      setCopyStatus('Nie udalo sie skopiowac');
      setTimeout(() => setCopyStatus(''), 1200);
    }
  }

  function handlePick(next: Selection) {
    setSelection(next);
    copyText(formatSpriteId(next) + ' ');
  }

  return (
    <main style={pageStyle}>
      <p style={descStyle}>
        Pełna biblioteka atlasów. Identyfikator sprite do rozmowy: `Sheet.png|sx,sy,sw,sh`
      </p>

      <div style={controlsStyle}>
        <label style={controlLabelStyle}>
          Frame W
          <input
            type="number"
            min={8}
            step={8}
            value={frameW}
            onChange={(e) => setFrameW(Math.max(8, Math.min(128, Number(e.target.value) || 8)))}
            style={inputStyle}
          />
        </label>
        <label style={controlLabelStyle}>
          Frame H
          <input
            type="number"
            min={8}
            step={8}
            value={frameH}
            onChange={(e) => setFrameH(Math.max(8, Math.min(128, Number(e.target.value) || 8)))}
            style={inputStyle}
          />
        </label>
        <label style={controlLabelStyle}>
          Anim Frames
          <input
            type="number"
            min={1}
            step={1}
            value={animFrames}
            onChange={(e) => setAnimFrames(Math.max(1, Math.min(32, Number(e.target.value) || 1)))}
            style={inputStyle}
          />
        </label>
      </div>

      <div style={selectionBoxStyle}>
        {!selection && <span>Kliknij dowolny tile, żeby wybrać ikonę.</span>}
        {selection && (
          <>
            <div style={{ fontWeight: 700 }}>{selection.sheet}</div>
            <div>{`sx=${selection.sx}, sy=${selection.sy}, sw=${selection.sw}, sh=${selection.sh}`}</div>
            <div style={{ color: '#9aa4bf' }}>{`ID: ${spriteId}`}</div>
            <div style={{ color: '#9aa4bf' }}>{`ANIM ID: ${animId}`}</div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <button type="button" style={buttonStyle} onClick={() => spriteId && copyText(spriteId)}>Copy ID</button>
              <button type="button" style={buttonStyle} onClick={() => animId && copyText(animId)}>Copy ANIM ID</button>
              {copyStatus && <span style={{ fontSize: '12px', color: '#9ece6a' }}>{copyStatus}</span>}
            </div>
          </>
        )}
      </div>

      {SHEETS.map((sheet) => (
        <SheetPicker key={sheet} sheet={sheet} onPick={handlePick} frameW={frameW} frameH={frameH} />
      ))}
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#12141c',
  color: '#d8deea',
  padding: '24px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
};

const h1Style: React.CSSProperties = {
  margin: 0,
  fontSize: '28px',
  letterSpacing: '0.02em',
};

const descStyle: React.CSSProperties = {
  margin: '8px 0 14px 0',
  color: '#9aa4bf',
  fontSize: '13px',
};

const selectionBoxStyle: React.CSSProperties = {
  background: '#1b1f2b',
  border: '1px solid #2f3648',
  borderRadius: '10px',
  padding: '10px 12px',
  marginBottom: '12px',
  fontSize: '13px',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
};

const controlsStyle: React.CSSProperties = {
  background: '#1b1f2b',
  border: '1px solid #2f3648',
  borderRadius: '10px',
  padding: '10px 12px',
  marginBottom: '10px',
  display: 'flex',
  gap: '10px',
  alignItems: 'center',
  flexWrap: 'wrap',
};

const controlLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '12px',
  color: '#9aa4bf',
};

const inputStyle: React.CSSProperties = {
  width: '64px',
  background: '#10141d',
  border: '1px solid #2f3648',
  color: '#d8deea',
  borderRadius: '6px',
  padding: '3px 6px',
};

const detailsStyle: React.CSSProperties = {
  background: '#1b1f2b',
  border: '1px solid #2f3648',
  borderRadius: '10px',
  marginBottom: '10px',
  overflow: 'hidden',
};

const summaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: '10px 12px',
  fontWeight: 700,
  fontSize: '13px',
  borderBottom: '1px solid #2f3648',
};

const sheetWrapStyle: React.CSSProperties = {
  overflow: 'auto',
  padding: '10px',
  maxHeight: '65vh',
};

const hintStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#8e98b3',
  padding: '0 12px 10px 12px',
};

const buttonStyle: React.CSSProperties = {
  background: '#2a3245',
  color: '#d8deea',
  border: '1px solid #3a465f',
  borderRadius: '6px',
  padding: '4px 8px',
  cursor: 'pointer',
  fontSize: '12px',
};

const linkStyle: React.CSSProperties = {
  color: '#8cb4ff',
  textDecoration: 'none',
  fontSize: '13px',
};
