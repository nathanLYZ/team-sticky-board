import { useEffect, useState } from 'react';
import Home from './components/Home';
import BoardSession from './components/BoardSession';

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHashRoute();
  const match = hash.match(/^#\/b\/([A-Za-z0-9]+)/);

  if (match) return <BoardSession boardId={match[1]} />;
  return <Home />;
}
