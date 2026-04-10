import { useEffect, useRef } from 'react';
import { Axe, BowlFood, Hammer, Leaf, Lightning, Moon, PersonSimpleRun, ShieldWarning, Sun, Sword } from '@phosphor-icons/react';

const MINI_MEDIEVAL_BASE = '/assets/mini-medieval/Mini-Medieval-8x8';
const UNITS = `${MINI_MEDIEVAL_BASE}/Units.png`;
const STRUCTURES = `${MINI_MEDIEVAL_BASE}/Structures.png`;
const MISC = `${MINI_MEDIEVAL_BASE}/Misc.png`;
const OVERWORLD = `${MINI_MEDIEVAL_BASE}/Overworld.png`;
const ANIMALS = `${MINI_MEDIEVAL_BASE}/Animals.png`;

function MapSpritePreview({
  src,
  sx,
  sy,
  sw,
  sh,
  wFrac,
  hFrac,
  align = 'center',
  tileBg = '#22301e',
}: {
  src: string;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  wFrac: number;
  hFrac: number;
  align?: 'center' | 'bottom';
  tileBg?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      const cell = 24;
      const scale = 3;
      const size = cell * scale;
      canvas.width = size;
      canvas.height = size;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = tileBg;
      ctx.fillRect(0, 0, size, size);

      const dstW = cell * wFrac;
      const dstH = cell * hFrac;
      const dx = (cell - dstW) / 2;
      const dy = align === 'bottom'
        ? cell - dstH - cell * 0.04
        : (cell - dstH) / 2;

      ctx.drawImage(
        img,
        sx, sy, sw, sh,
        Math.round(dx * scale),
        Math.round(dy * scale),
        Math.round(dstW * scale),
        Math.round(dstH * scale),
      );
    };
    img.src = src;
  }, [src, sx, sy, sw, sh, wFrac, hFrac, align, tileBg]);

  return <canvas ref={canvasRef} width={72} height={72} style={{ borderRadius: 6, border: '1px solid #30384c', imageRendering: 'pixelated' }} />;
}

function Row({ name, id, preview }: { name: string; id: string; preview: React.ReactNode }) {
  return (
    <div style={rowStyle}>
      <div style={previewWrapStyle}>{preview}</div>
      <div style={{ flex: 1 }}>
        <div style={nameStyle}>{name}</div>
        <div style={idStyle}>{id}</div>
      </div>
    </div>
  );
}

export function SlashIconsPage() {
  return (
    <main style={pageStyle}>
      <p style={descStyle}>
        Tu jest finalna, wybrana lista sprite’ów. Jeśli chcesz zmiany, podaj ID z tej listy albo wybierz nowe ID z `/library`.
      </p>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Terrain Colors</h2>
        <div style={terrainWrapStyle}>
          <div style={{ ...terrainTileStyle, background: '#7e9432' }}><span>plains</span></div>
          <div style={{ ...terrainTileStyle, background: '#56642e' }}><span>forest</span></div>
          <div style={{ ...terrainTileStyle, background: '#6f6e72' }}><span>mountain</span></div>
          <div style={{ ...terrainTileStyle, background: '#2a7d75' }}><span>water</span></div>
          <div style={{ ...terrainTileStyle, background: '#c78539' }}><span>road</span></div>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>People (Map)</h2>
        <Row name="male red" id="Units.png|0,32,8,8" preview={<MapSpritePreview src={UNITS} sx={0} sy={32} sw={8} sh={8} wFrac={0.82} hFrac={0.82} />} />
        <Row name="male blue" id="Units.png|0,64,8,8" preview={<MapSpritePreview src={UNITS} sx={0} sy={64} sw={8} sh={8} wFrac={0.82} hFrac={0.82} />} />
        <Row name="male green" id="Units.png|0,56,8,8" preview={<MapSpritePreview src={UNITS} sx={0} sy={56} sw={8} sh={8} wFrac={0.82} hFrac={0.82} />} />
        <Row name="female red" id="Units.png|0,96,8,8" preview={<MapSpritePreview src={UNITS} sx={0} sy={96} sw={8} sh={8} wFrac={0.82} hFrac={0.82} />} />
        <Row name="female blue" id="Units.png|0,128,8,8" preview={<MapSpritePreview src={UNITS} sx={0} sy={128} sw={8} sh={8} wFrac={0.82} hFrac={0.82} />} />
        <Row name="female green" id="Units.png|8,120,8,8" preview={<MapSpritePreview src={UNITS} sx={8} sy={120} sw={8} sh={8} wFrac={0.82} hFrac={0.82} />} />
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Map Objects</h2>
        <Row name="house red" id="Structures.png|0,80,32,40" preview={<MapSpritePreview src={STRUCTURES} sx={0} sy={80} sw={32} sh={40} wFrac={0.5} hFrac={0.62} align="bottom" />} />
        <Row name="house blue" id="Structures.png|0,48,32,40" preview={<MapSpritePreview src={STRUCTURES} sx={0} sy={48} sw={32} sh={40} wFrac={0.5} hFrac={0.62} align="bottom" />} />
        <Row name="house green" id="Structures.png|0,0,32,40" preview={<MapSpritePreview src={STRUCTURES} sx={0} sy={0} sw={32} sh={40} wFrac={0.5} hFrac={0.62} align="bottom" />} />
        <Row name="stockpile" id="Misc.png|0,240,8,8" preview={<MapSpritePreview src={MISC} sx={0} sy={240} sw={8} sh={8} wFrac={0.9} hFrac={0.9} />} />
        <Row name="tree winter" id="Overworld.png|0,736,8,8" preview={<MapSpritePreview src={OVERWORLD} sx={0} sy={736} sw={8} sh={8} wFrac={0.92} hFrac={0.92} />} />
        <Row name="tree spring / no fruit" id="Overworld.png|48,736,8,8" preview={<MapSpritePreview src={OVERWORLD} sx={48} sy={736} sw={8} sh={8} wFrac={0.92} hFrac={0.92} />} />
        <Row name="tree fruit" id="Overworld.png|96,736,8,8" preview={<MapSpritePreview src={OVERWORLD} sx={96} sy={736} sw={8} sh={8} wFrac={0.92} hFrac={0.92} />} />
        <Row name="tree autumn" id="Overworld.png|144,736,8,8" preview={<MapSpritePreview src={OVERWORLD} sx={144} sy={736} sw={8} sh={8} wFrac={0.92} hFrac={0.92} />} />
        <Row name="road tile" id="Overworld.png|32,320,8,8" preview={<MapSpritePreview src={OVERWORLD} sx={32} sy={320} sw={8} sh={8} wFrac={1} hFrac={1} tileBg="#7e9432" />} />
        <Row name="water base anim" id="Overworld.png|8,104,8,8;frames=2;step=24" preview={<MapSpritePreview src={OVERWORLD} sx={8} sy={104} sw={8} sh={8} wFrac={1} hFrac={1} tileBg="#245a5f" />} />
        <Row name="water edge N (rotated NESW)" id="Overworld.png|8,120,8,8" preview={<MapSpritePreview src={OVERWORLD} sx={8} sy={120} sw={8} sh={8} wFrac={1} hFrac={1} tileBg="#245a5f" />} />
        <Row name="water corner outer (rotated)" id="Overworld.png|0,64,8,8" preview={<MapSpritePreview src={OVERWORLD} sx={0} sy={64} sw={8} sh={8} wFrac={1} hFrac={1} tileBg="#245a5f" />} />
        <Row name="water corner inner (rotated)" id="Overworld.png|136,120,8,8" preview={<MapSpritePreview src={OVERWORLD} sx={136} sy={120} sw={8} sh={8} wFrac={1} hFrac={1} tileBg="#245a5f" />} />
        <Row name="animal" id="Animals.png|0,472,8,8" preview={<MapSpritePreview src={ANIMALS} sx={0} sy={472} sw={8} sh={8} wFrac={0.86} hFrac={0.86} />} />
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Wang Tile Frames (7 animation frames per type)</h2>
        <WangFrameTable />
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>UI Action Icons</h2>
        <div style={uiWrapStyle}>
          <Sword size={24} /><ShieldWarning size={24} /><PersonSimpleRun size={24} /><Leaf size={24} /><Axe size={24} /><Hammer size={24} />
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Sidebar Icons</h2>
        <div style={uiWrapStyle}>
          <BowlFood size={24} /><Leaf size={24} /><Axe size={24} /><Lightning size={24} /><Sun size={24} /><Moon size={24} />
        </div>
      </section>
    </main>
  );
}

import { OUTER_VARIANTS, INNER_VARIANTS } from './terrain/waterAutotile';

const WANG_TILE_TYPES: Array<{ name: string; src: 'outer' | 'inner' | 'water' | 'wave'; dx: number; dy: number }> = [
  { name: 'cNW', src: 'outer', dx: 0,  dy: 0 },
  { name: 'eN',  src: 'outer', dx: 8,  dy: 0 },
  { name: 'cNE', src: 'outer', dx: 16, dy: 0 },
  { name: 'eW',  src: 'outer', dx: 0,  dy: 8 },
  { name: 'eE',  src: 'outer', dx: 16, dy: 8 },
  { name: 'cSW', src: 'outer', dx: 0,  dy: 24 },
  { name: 'eS',  src: 'outer', dx: 8,  dy: 24 },
  { name: 'cSE', src: 'outer', dx: 16, dy: 24 },
  { name: 'iSE', src: 'inner', dx: 0,  dy: 0 },
  { name: 'iS',  src: 'inner', dx: 8,  dy: 0 },
  { name: 'iSW', src: 'inner', dx: 16, dy: 0 },
  { name: 'iE',  src: 'inner', dx: 0,  dy: 8 },
  { name: 'iW',  src: 'inner', dx: 16, dy: 8 },
  { name: 'iNE', src: 'inner', dx: 0,  dy: 16 },
  { name: 'iN',  src: 'inner', dx: 8,  dy: 16 },
  { name: 'iNW', src: 'inner', dx: 16, dy: 16 },
  { name: 'water',src:'water', dx: 0,  dy: 0 },
  { name: 'wave', src:'wave',  dx: 0,  dy: 0 },
];


function WangFrameTable() {
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const animRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // Single effect: load image once, draw statics, run animation loop
  useEffect(() => {
    const img = new Image();
    let raf: number;
    let frame = 0;
    let lastSwitch = -9999;
    const SIZE = 32;

    function drawSprite(c: HTMLCanvasElement, sx: number, sy: number) {
      c.width = SIZE; c.height = SIZE;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#1b1f2b';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.drawImage(img, sx, sy, 8, 8, 0, 0, SIZE, SIZE);
    }

    function drawStatics() {
      for (const tile of WANG_TILE_TYPES) {
        if (tile.src === 'water') {
          const c = canvasRefs.current.get(`${tile.name}-0-0`);
          if (c) drawSprite(c, 0, 280);
          continue;
        }
        if (tile.src === 'wave') {
          [48, 56, 64].forEach((wx, i) => {
            const c = canvasRefs.current.get(`${tile.name}-0-${i}`);
            if (c) drawSprite(c, wx, 280);
          });
          continue;
        }
        const vars = tile.src === 'outer' ? OUTER_VARIANTS : INNER_VARIANTS;
        for (let v = 0; v < 4; v++) {
          for (let f = 0; f < 2; f++) {
            const c = canvasRefs.current.get(`${tile.name}-${v}-${f}`);
            if (c) { const o = vars[v][f]; drawSprite(c, o.x + tile.dx, o.y + tile.dy); }
          }
        }
      }
    }

    function drawAnimFrame() {
      const WAVE_SEQ = [0, 1, 2, 1];
      const wf = WAVE_SEQ[Math.floor(Date.now() / 600) % 4];
      for (const tile of WANG_TILE_TYPES) {
        if (tile.src === 'water') continue;
        if (tile.src === 'wave') {
          const c = animRefs.current.get(tile.name);
          if (c) drawSprite(c, [48, 56, 64][wf], 280);
          continue;
        }
        const vars = tile.src === 'outer' ? OUTER_VARIANTS : INNER_VARIANTS;
        for (let v = 0; v < 4; v++) {
          const c = animRefs.current.get(`${tile.name}-v${v}`);
          if (c) { const o = vars[v][frame]; drawSprite(c, o.x + tile.dx, o.y + tile.dy); }
        }
      }
    }

    img.onload = () => {
      drawStatics();
      const loop = (t: number) => {
        if (t - lastSwitch > 600) {
          frame = (frame + 1) % 2;
          lastSwitch = t;
          drawAnimFrame();
        }
        raf = requestAnimationFrame(loop);
      };
      drawAnimFrame(); // immediate first draw
      raf = requestAnimationFrame(loop);
    };
    img.src = OVERWORLD;
    return () => cancelAnimationFrame(raf);
  }, []);

  const setRef = (key: string) => (el: HTMLCanvasElement | null) => {
    if (el) canvasRefs.current.set(key, el); else canvasRefs.current.delete(key);
  };
  const setAnim = (name: string) => (el: HTMLCanvasElement | null) => {
    if (el) animRefs.current.set(name, el); else animRefs.current.delete(name);
  };

  const tileCanvas: React.CSSProperties = { border: '1px solid #2f3648', borderRadius: 4, imageRendering: 'pixelated' as const, width: 32, height: 32 };
  const animCanvas: React.CSSProperties = { border: '1px solid #ffdc74', borderRadius: 4, imageRendering: 'pixelated' as const, width: 32, height: 32 };

  return (
    <div style={{ overflowX: 'auto' }}>
      {WANG_TILE_TYPES.map(tile => (
        <div key={tile.name} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <code style={{ width: 50, fontSize: 11, color: '#9aa4bf', flexShrink: 0 }}>{tile.name}</code>
          {tile.src === 'water' ? (
            <canvas ref={setRef(`${tile.name}-0-0`)} width={32} height={32} style={tileCanvas} />
          ) : tile.src === 'wave' ? (<>
            {[0,1,2].map(i => (
              <canvas key={i} ref={setRef(`${tile.name}-0-${i}`)} width={32} height={32} style={tileCanvas} />
            ))}
            <canvas ref={setAnim(tile.name)} width={32} height={32} style={animCanvas} />
          </>) : (
            [0,1,2,3].map(v => (<div key={v} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <canvas ref={setRef(`${tile.name}-${v}-0`)} width={32} height={32} style={tileCanvas} />
              <canvas ref={setRef(`${tile.name}-${v}-1`)} width={32} height={32} style={tileCanvas} />
              <canvas ref={setAnim(`${tile.name}-v${v}`)} width={32} height={32} style={animCanvas} />
              {v < 3 && <div style={{ width: 8, flexShrink: 0 }} />}
            </div>))
          )}
        </div>
      ))}
    </div>
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

const h2Style: React.CSSProperties = {
  margin: '0 0 10px 0',
  fontSize: '15px',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#9aa4bf',
};

const descStyle: React.CSSProperties = {
  margin: '8px 0 14px 0',
  color: '#9aa4bf',
  fontSize: '13px',
};

const sectionStyle: React.CSSProperties = {
  background: '#1b1f2b',
  border: '1px solid #2f3648',
  borderRadius: '10px',
  padding: '12px',
  marginBottom: '10px',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '6px 0',
  borderBottom: '1px solid #2b3245',
};

const previewWrapStyle: React.CSSProperties = {
  width: '86px',
  display: 'flex',
  justifyContent: 'center',
};

const nameStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 700,
};

const idStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#8e98b3',
};

const terrainWrapStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
};

const terrainTileStyle: React.CSSProperties = {
  width: '72px',
  height: '42px',
  border: '1px solid #2f3648',
  borderRadius: '8px',
  display: 'grid',
  placeItems: 'end center',
  paddingBottom: '4px',
  fontSize: '10px',
  color: '#d8deea',
};

const uiWrapStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
};

const linkStyle: React.CSSProperties = {
  color: '#8cb4ff',
  textDecoration: 'none',
  fontSize: '13px',
};
