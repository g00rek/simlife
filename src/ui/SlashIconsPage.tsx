import { useEffect, useRef, useState } from 'react';

const MINI_MEDIEVAL_BASE = '/assets/mini-medieval/Mini-Medieval-8x8';
const UNITS = `${MINI_MEDIEVAL_BASE}/Units.png`;
const STRUCTURES = `${MINI_MEDIEVAL_BASE}/Structures.png`;
const MISC = `${MINI_MEDIEVAL_BASE}/Misc.png`;
const OVERWORLD = `${MINI_MEDIEVAL_BASE}/Overworld.png`;
const ANIMALS = `${MINI_MEDIEVAL_BASE}/Animals.png`;

function SpriteAnimation({ src, frames, label, size = 48, ms = 200 }: {
  src: string;
  frames: Array<{ sx: number; sy: number }>;
  label: string;
  size?: number;
  ms?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frameIdx, setFrameIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setFrameIdx(i => (i + 1) % frames.length), ms);
    return () => clearInterval(id);
  }, [frames.length, ms]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#1b1f2b';
      ctx.fillRect(0, 0, size, size);
      const f = frames[frameIdx];
      ctx.drawImage(img, f.sx, f.sy, 8, 8, 0, 0, size, size);
    };
    img.src = src;
  }, [src, frames, frameIdx, size]);

  return (
    <div style={{ textAlign: 'center' }}>
      <canvas ref={canvasRef} width={size} height={size} style={{ borderRadius: 4, imageRendering: 'pixelated' as const }} />
      <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 9, color: '#555' }}>frame {frameIdx + 1}/{frames.length}</div>
    </div>
  );
}

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

// Composite sprite: assembles multiple 8x8 tiles into one preview
function CompositeSprite({ tiles, cols, scale = 6 }: {
  tiles: Array<{ src: string; sx: number; sy: number }>;
  cols: number;
  scale?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rows = Math.ceil(tiles.length / cols);
  const w = cols * 8 * scale;
  const h = rows * 8 * scale;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1b1f2b';
    ctx.fillRect(0, 0, w, h);

    // Load unique images
    const srcs = [...new Set(tiles.map(t => t.src))];
    const imgs = new Map<string, HTMLImageElement>();
    let loaded = 0;
    for (const s of srcs) {
      const img = new Image();
      img.onload = () => {
        imgs.set(s, img);
        loaded++;
        if (loaded === srcs.length) {
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = '#1b1f2b';
          ctx.fillRect(0, 0, w, h);
          tiles.forEach((t, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const img = imgs.get(t.src)!;
            ctx.drawImage(img, t.sx, t.sy, 8, 8, col * 8 * scale, row * 8 * scale, 8 * scale, 8 * scale);
          });
        }
      };
      img.src = s;
    }
  }, [tiles, cols, scale, w, h]);

  return <canvas ref={canvasRef} width={w} height={h} style={{ borderRadius: 6, border: '1px solid #30384c', imageRendering: 'pixelated' as const }} />;
}

// Animated house: static 3x3 tiles + animated chimney on top-right
function AnimatedHouse({ roofSx = 40, roofSy, label }: { roofSx?: number; roofSy: number; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scale = 6;
  const w = 3 * 8 * scale; // 144
  const h = 4 * 8 * scale; // 192 (1 row chimney + 2 rows roof + 1 row walls)

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    let raf: number;
    let frame = 0;
    let lastSwitch = 0;

    img.onload = () => {
      const draw = (now: number) => {
        if (now - lastSwitch > 200) { frame = (frame + 1) % 6; lastSwitch = now; }
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#1b1f2b';
        ctx.fillRect(0, 0, w, h);
        const s = 8 * scale;

        const chimSx = 88 + frame * 8;

        // Row 0: chimney smoke (top) on right column
        ctx.drawImage(img, chimSx, 208, 8, 8, 2 * s, 0, s, s);

        // Row 1: roof top row + chimney base on right
        ctx.drawImage(img, roofSx, roofSy, 8, 8, 0, s, s, s);
        ctx.drawImage(img, roofSx + 8, roofSy, 8, 8, s, s, s, s);
        ctx.drawImage(img, roofSx + 16, roofSy, 8, 8, 2 * s, s, s, s);
        // Draw chimney base on top of roof tile
        ctx.drawImage(img, chimSx, 216, 8, 8, 2 * s, s, s, s);

        // Row 2: roof bottom row
        ctx.drawImage(img, roofSx, roofSy + 8, 8, 8, 0, 2 * s, s, s);
        ctx.drawImage(img, roofSx + 8, roofSy + 8, 8, 8, s, 2 * s, s, s);
        ctx.drawImage(img, roofSx + 16, roofSy + 8, 8, 8, 2 * s, 2 * s, s, s);

        // Row 3: walls
        ctx.drawImage(img, 56, 280, 8, 8, 0, 3 * s, s, s);
        ctx.drawImage(img, 0, 360, 8, 8, s, 3 * s, s, s);
        ctx.drawImage(img, 72, 280, 8, 8, 2 * s, 3 * s, s, s);

        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    };
    img.src = STRUCTURES;
    return () => cancelAnimationFrame(raf);
  }, [roofSx, roofSy]);

  return (
    <div style={{ textAlign: 'center' }}>
      <canvas ref={canvasRef} width={w} height={h} style={{ borderRadius: 6, border: '1px solid #30384c', imageRendering: 'pixelated' as const }} />
      <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{label}</div>
    </div>
  );
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

      {/* ── People Animations ── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>People — Idle (3 frames)</h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <SpriteAnimation src={UNITS} frames={[24,32,40].map(sx => ({ sx, sy: 32 }))} label="male red" />
          <SpriteAnimation src={UNITS} frames={[24,32,40].map(sx => ({ sx, sy: 64 }))} label="male blue" />
          <SpriteAnimation src={UNITS} frames={[24,32,40].map(sx => ({ sx, sy: 56 }))} label="male green" />
          <SpriteAnimation src={UNITS} frames={[24,32,40].map(sx => ({ sx, sy: 96 }))} label="female red" />
          <SpriteAnimation src={UNITS} frames={[24,32,40].map(sx => ({ sx, sy: 128 }))} label="female blue" />
          <SpriteAnimation src={UNITS} frames={[24,32,40].map(sx => ({ sx, sy: 120 }))} label="female green" />
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>People — Walk (4 frames)</h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <SpriteAnimation src={UNITS} frames={[152,160,168,176].map(sx => ({ sx, sy: 32 }))} label="male red" />
          <SpriteAnimation src={UNITS} frames={[152,160,168,176].map(sx => ({ sx, sy: 64 }))} label="male blue" />
          <SpriteAnimation src={UNITS} frames={[152,160,168,176].map(sx => ({ sx, sy: 56 }))} label="male green" />
          <SpriteAnimation src={UNITS} frames={[152,160,168,176].map(sx => ({ sx, sy: 96 }))} label="female red" ms={150} />
          <SpriteAnimation src={UNITS} frames={[152,160,168,176].map(sx => ({ sx, sy: 128 }))} label="female blue" ms={150} />
          <SpriteAnimation src={UNITS} frames={[152,160,168,176].map(sx => ({ sx, sy: 120 }))} label="female green" ms={150} />
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>People — Run (4 frames)</h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <SpriteAnimation src={UNITS} frames={[80,88,96,104].map(sx => ({ sx, sy: 32 }))} label="male red" ms={120} />
          <SpriteAnimation src={UNITS} frames={[80,88,96,104].map(sx => ({ sx, sy: 64 }))} label="male blue" ms={120} />
          <SpriteAnimation src={UNITS} frames={[80,88,96,104].map(sx => ({ sx, sy: 56 }))} label="male green" ms={120} />
          <SpriteAnimation src={UNITS} frames={[80,88,96,104].map(sx => ({ sx, sy: 96 }))} label="female red" ms={120} />
          <SpriteAnimation src={UNITS} frames={[80,88,96,104].map(sx => ({ sx, sy: 128 }))} label="female blue" ms={120} />
          <SpriteAnimation src={UNITS} frames={[80,88,96,104].map(sx => ({ sx, sy: 120 }))} label="female green" ms={120} />
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>People — March (4 frames)</h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <SpriteAnimation src={UNITS} frames={[224,232,240,248].map(sx => ({ sx, sy: 32 }))} label="male red" ms={180} />
          <SpriteAnimation src={UNITS} frames={[224,232,240,248].map(sx => ({ sx, sy: 64 }))} label="male blue" ms={180} />
          <SpriteAnimation src={UNITS} frames={[224,232,240,248].map(sx => ({ sx, sy: 56 }))} label="male green" ms={180} />
          <SpriteAnimation src={UNITS} frames={[224,232,240,248].map(sx => ({ sx, sy: 96 }))} label="female red" ms={180} />
          <SpriteAnimation src={UNITS} frames={[224,232,240,248].map(sx => ({ sx, sy: 128 }))} label="female blue" ms={180} />
          <SpriteAnimation src={UNITS} frames={[224,232,240,248].map(sx => ({ sx, sy: 120 }))} label="female green" ms={180} />
        </div>
      </section>

      {/* ── Animals ── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>Animals — Idle (2 frames)</h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <SpriteAnimation src={ANIMALS} frames={[{sx:0,sy:464},{sx:8,sy:464}]} label="female idle" />
          <SpriteAnimation src={ANIMALS} frames={[{sx:0,sy:472},{sx:8,sy:472}]} label="male idle" />
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Animals — Run (2 frames)</h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <SpriteAnimation src={ANIMALS} frames={[{sx:80,sy:464},{sx:88,sy:464}]} label="female run" ms={120} />
          <SpriteAnimation src={ANIMALS} frames={[{sx:80,sy:472},{sx:88,sy:472}]} label="male run" ms={120} />
        </div>
      </section>

      {/* ── Houses ── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>Houses 3×3 (with animated chimney)</h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <AnimatedHouse roofSx={40} roofSy={96} label="red v1" />
          <AnimatedHouse roofSx={104} roofSy={96} label="red v2" />
          <AnimatedHouse roofSx={168} roofSy={96} label="red v3" />
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
          <AnimatedHouse roofSx={40} roofSy={56} label="green v1" />
          <AnimatedHouse roofSx={104} roofSy={56} label="green v2" />
          <AnimatedHouse roofSx={168} roofSy={56} label="green v3" />
        </div>
      </section>

      {/* ── Trees & Nature ── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>Trees</h2>
        <Row name="normal" id="Overworld.png|64,408,32,32" preview={<MapSpritePreview src={OVERWORLD} sx={64} sy={408} sw={32} sh={32} wFrac={1} hFrac={1} tileBg="#22301e" />} />
        <Row name="winter" id="Overworld.png|64,368,32,32" preview={<MapSpritePreview src={OVERWORLD} sx={64} sy={368} sw={32} sh={32} wFrac={1} hFrac={1} tileBg="#1b2230" />} />
        <Row name="fruit (empty)" id="Overworld.png|160,488,32,32" preview={<MapSpritePreview src={OVERWORLD} sx={160} sy={488} sw={32} sh={32} wFrac={1} hFrac={1} tileBg="#22301e" />} />
        <Row name="fruit (with fruit)" id="Overworld.png|112,488,32,32" preview={<MapSpritePreview src={OVERWORLD} sx={112} sy={488} sw={32} sh={32} wFrac={1} hFrac={1} tileBg="#22301e" />} />
        <Row name="stump" id="Overworld.png|80,720,16,8" preview={<MapSpritePreview src={OVERWORLD} sx={80} sy={720} sw={16} sh={8} wFrac={0.6} hFrac={0.3} />} />
        <Row name="grass (food)" id="Overworld.png|24,8,8,8" preview={<MapSpritePreview src={OVERWORLD} sx={24} sy={8} sw={8} sh={8} wFrac={0.6} hFrac={0.6} />} />
      </section>

      {/* ── Action Badges ── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>Action Badges</h2>
        <Row name="build" id="Walls.png|72,24,8,8" preview={<MapSpritePreview src={`${MINI_MEDIEVAL_BASE}/Walls.png`} sx={72} sy={24} sw={8} sh={8} wFrac={0.8} hFrac={0.8} />} />
        <Row name="chop" id="Items.png|16,56,8,8" preview={<MapSpritePreview src={`${MINI_MEDIEVAL_BASE}/Items.png`} sx={16} sy={56} sw={8} sh={8} wFrac={0.8} hFrac={0.8} />} />
        <Row name="fight" id="Items.png|0,16,8,8" preview={<MapSpritePreview src={`${MINI_MEDIEVAL_BASE}/Items.png`} sx={0} sy={16} sw={8} sh={8} wFrac={0.8} hFrac={0.8} />} />
        <Row name="train" id="Misc.png|0,384,8,8" preview={<MapSpritePreview src={MISC} sx={0} sy={384} sw={8} sh={8} wFrac={0.8} hFrac={0.8} />} />
        <Row name="hunt" id="Items.png|0,24,8,8" preview={<MapSpritePreview src={`${MINI_MEDIEVAL_BASE}/Items.png`} sx={0} sy={24} sw={8} sh={8} wFrac={0.8} hFrac={0.8} />} />
        <Row name="gather" id="Items.png|0,160,8,8" preview={<MapSpritePreview src={`${MINI_MEDIEVAL_BASE}/Items.png`} sx={0} sy={160} sw={8} sh={8} wFrac={0.8} hFrac={0.8} />} />
      </section>

      {/* ── UI ── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>Selection</h2>
        <Row name="tile select" id="Interface.png|32,8,8,8" preview={<MapSpritePreview src={`${MINI_MEDIEVAL_BASE}/Interface.png`} sx={32} sy={8} sw={8} sh={8} wFrac={1} hFrac={1} />} />
      </section>

      {/* ── Water (Wang tiles) ── */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>Water — Wang Tile Frames</h2>
        <WangFrameTable />
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


