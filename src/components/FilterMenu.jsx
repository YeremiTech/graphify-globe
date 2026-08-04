import React, { useEffect, useId, useRef, useState } from 'react';

function shouldOpenUpward(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const spaceBelow = viewportHeight - rect.bottom;
  const spaceAbove = rect.top;
  const preferredHeight = Math.min(280, viewportHeight * 0.42);
  const isCompact = window.matchMedia('(max-width: 760px), (hover: none) and (pointer: coarse)').matches;
  if (isCompact) return spaceAbove >= preferredHeight * 0.45 || spaceAbove > spaceBelow;
  return spaceBelow < preferredHeight && spaceAbove > spaceBelow;
}

export default function FilterMenu({
  label,
  value,
  options,
  onChange,
  align = 'right',
}) {
  const listId = useId();
  const fieldRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!fieldRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const syncDirection = () => {
      setOpensUp(shouldOpenUpward(fieldRef.current));
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', syncDirection);
    window.addEventListener('orientationchange', syncDirection);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', syncDirection);
      window.removeEventListener('orientationchange', syncDirection);
    };
  }, [open]);

  const toggle = () => {
    setOpen((current) => {
      if (!current) setOpensUp(shouldOpenUpward(fieldRef.current));
      return !current;
    });
  };

  const choose = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div
      className={`filter-field ${open ? 'is-open' : ''} ${opensUp ? 'opens-up' : 'opens-down'} align-${align}`}
      ref={fieldRef}
    >
      <span className="filter-label" id={`${listId}-label`}>
        {label}
      </span>
      <button
        type="button"
        className="filter-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${listId}-label`}
        onClick={toggle}
      >
        <span className="filter-trigger-text">
          {selected?.color ? (
            <i
              className="filter-swatch"
              style={{ background: selected.color, color: selected.color }}
              aria-hidden="true"
            />
          ) : null}
          <strong>{selected?.label || '—'}</strong>
        </span>
        <span className="filter-chevron" aria-hidden="true" />
      </button>

      {open && (
        <ul
          id={listId}
          className="filter-menu"
          role="listbox"
          aria-labelledby={`${listId}-label`}
        >
          {options.map((option) => {
            const isActive = option.value === value;
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`filter-option ${isActive ? 'is-active' : ''}`}
                  onClick={() => choose(option.value)}
                >
                  <span>
                    {option.color ? (
                      <i
                        className="filter-swatch"
                        style={{ background: option.color, color: option.color }}
                        aria-hidden="true"
                      />
                    ) : null}
                    <strong>{option.label}</strong>
                    {option.hint ? <small>{option.hint}</small> : null}
                  </span>
                  {isActive && <span className="filter-check" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
