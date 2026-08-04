import React, { useEffect, useId, useRef, useState } from 'react';

/**
 * Compact dropdown matching the quality-menu visual language.
 * options: [{ value, label, hint?, color? }]
 */
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
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!fieldRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div
      className={`filter-field ${open ? 'is-open' : ''} align-${align}`}
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
        onClick={() => setOpen((current) => !current)}
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
