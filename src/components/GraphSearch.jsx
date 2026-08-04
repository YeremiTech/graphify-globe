import React, {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

function normalize(value) {
  return String(value || '').toLocaleLowerCase('es');
}

function scoreNode(node, term) {
  const label = normalize(node.label);
  const id = normalize(node.id);
  if (label === term) return 0;
  if (label.startsWith(term)) return 1;
  if (label.includes(term)) return 2;
  if (id === term) return 3;
  const secondary = normalize([
    node.file,
    node.communityName,
    node.group,
    node.kind,
    node.metadata?.originalKind,
    node.fileType,
    node.metadata?.package,
    node.metadata?.namespace,
  ].join(' '));
  if (secondary.includes(term)) return 4;
  return 5;
}

/**
 * Search across all normalized nodes (not just the visible subset).
 * Uses precomputed searchText and ranks every match before slicing top results.
 */
export default function GraphSearch({ nodes, onSelectNode }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const rootRef = useRef(null);

  const results = useMemo(() => {
    const term = normalize(deferredQuery).trim();
    if (!term || !nodes?.length) return [];

    const tokens = term.split(/\s+/).filter(Boolean);
    const matches = [];

    for (const node of nodes) {
      const haystack = node.searchText || normalize([
        node.label,
        node.normalizedLabel,
        node.id,
        node.kind,
        node.metadata?.originalKind,
        node.file,
        node.communityName,
        node.group,
        node.fileType,
        node.metadata?.package,
        node.metadata?.namespace,
      ].join(' '));

      if (!tokens.every((token) => haystack.includes(token))) continue;
      matches.push(node);
    }

    matches.sort((a, b) => {
      const scoreDifference = scoreNode(a, term) - scoreNode(b, term);
      if (scoreDifference !== 0) return scoreDifference;
      return b.degree - a.degree || a.label.localeCompare(b.label);
    });

    return matches.slice(0, 18);
  }, [nodes, deferredQuery]);

  useEffect(() => {
    setActiveIndex(0);
    setOpen(Boolean(query.trim()));
  }, [query, results.length]);

  useEffect(() => {
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);

  const choose = (node) => {
    setQuery(node.label);
    setOpen(false);
    onSelectNode(node);
  };

  const clear = () => {
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((value) => Math.min(value + 1, Math.max(0, results.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((value) => Math.max(0, value - 1));
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      choose(results[activeIndex]);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <section className="graph-search" ref={rootRef} aria-label="Buscar nodos">
      <div className="search-label-row">
        <span>BUSCADOR DE NODOS</span>
        {query.trim() && <small>{results.length} resultados</small>}
      </div>
      <div className="search-field">
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => query.trim() && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Clase, método, archivo, paquete o ID…"
          autoComplete="off"
          spellCheck="false"
        />
        {query && (
          <button type="button" onClick={clear} aria-label="Limpiar búsqueda">
            ×
          </button>
        )}
      </div>

      {open && (
        <div className="search-results">
          {results.length ? (
            results.map((node, index) => (
              <button
                type="button"
                key={node.id}
                className={index === activeIndex ? 'is-active' : ''}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(node)}
              >
                <span className="search-kind-dot" style={{ background: node.color, color: node.color }} />
                <span className="search-result-copy">
                  <strong>{node.label}</strong>
                  <small>{node.kind} · {node.communityName || node.group || node.file || node.id}</small>
                </span>
                <b>{node.degree}</b>
              </button>
            ))
          ) : (
            <p>No se encontraron nodos para “{query}”.</p>
          )}
        </div>
      )}
    </section>
  );
}
