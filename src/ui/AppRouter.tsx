import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { App } from './App';
import { SlashIconsPage } from './SlashIconsPage';
import { LibraryPage } from './LibraryPage';
import { MapPage } from './MapPage';
import { AnimalsPage } from './AnimalsPage';

const ROUTES: Array<{ path: string; label: string }> = [
  { path: '/', label: 'Game' },
  { path: '/map', label: 'Map' },
  { path: '/animals', label: 'Animals' },
  { path: '/icons', label: 'Icons' },
  { path: '/library', label: 'Library' },
];

function readRoute(): string {
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase().replace('#', '');
  for (const r of ROUTES) {
    if (r.path === '/') continue;
    const key = r.path.slice(1);
    if (path === r.path || hash === r.path || hash === key) return key;
  }
  return 'app';
}

function Nav({ current }: { current: string }) {
  return (
    <nav style={navStyle}>
      {ROUTES.map(r => {
        const key = r.path === '/' ? 'app' : r.path.slice(1);
        const active = current === key;
        return (
          <a
            key={r.path}
            href={r.path}
            style={{ ...linkStyle, ...(active ? activeLinkStyle : {}) }}
            onClick={e => {
              e.preventDefault();
              window.history.pushState(null, '', r.path);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
          >
            {r.label}
          </a>
        );
      })}
    </nav>
  );
}

export function AppRouter() {
  const [route, setRoute] = useState<string>(() => readRoute());

  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener('popstate', onChange);
    window.addEventListener('hashchange', onChange);
    return () => {
      window.removeEventListener('popstate', onChange);
      window.removeEventListener('hashchange', onChange);
    };
  }, []);

  return (
    <>
      <Nav current={route} />
      {route === 'library' && <LibraryPage />}
      {route === 'icons' && <SlashIconsPage />}
      {route === 'map' && <MapPage />}
      {route === 'animals' && <AnimalsPage />}
      {route === 'app' && <App />}
    </>
  );
}

const navStyle: CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: '6px 12px',
  background: '#0d0f14',
  borderBottom: '1px solid #2f3648',
  position: 'sticky',
  top: 0,
  zIndex: 100,
};

const linkStyle: CSSProperties = {
  color: '#8cb4ff',
  textDecoration: 'none',
  fontSize: 13,
  padding: '4px 10px',
  borderRadius: 4,
};

const activeLinkStyle: CSSProperties = {
  background: '#1e2536',
  color: '#d8deea',
  fontWeight: 700,
};
