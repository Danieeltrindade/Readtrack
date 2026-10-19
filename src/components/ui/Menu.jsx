import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import './Menu.css';

/**
 * Menu de ações (padrão "menu button" da WAI-ARIA):
 * - Enter/Espaço/↓ abre e foca o primeiro item; ↑/↓ navegam; Home/End;
 * - Esc fecha e devolve o foco ao botão; clique fora fecha.
 *
 * items: [{ label, icon, onSelect, danger?, checked?, disabled? } | { separator: true }]
 */
export function Menu({ label = 'Mais ações', items, align = 'end', triggerClassName = '', icon: Icon = Ellipsis }) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ up: false, shift: 0 });
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const menuId = useId();

  const focusItem = (index) => {
    const nodes = listRef.current?.querySelectorAll('[role^="menuitem"]:not([aria-disabled="true"])');
    if (!nodes?.length) return;
    const next = (index + nodes.length) % nodes.length;
    nodes[next].focus();
  };

  // Mantém o menu dentro da tela: abre para cima se não couber embaixo
  // (descontando a barra de navegação do celular) e desloca na horizontal.
  useLayoutEffect(() => {
    if (!open || !listRef.current) return;
    const list = listRef.current.getBoundingClientRect();
    const trigger = buttonRef.current.getBoundingClientRect();
    const nav = document.querySelector('.mobile-nav');
    const navTop = nav && nav.getClientRects().length > 0 ? nav.getBoundingClientRect().top : window.innerHeight;
    const header = document.querySelector('.mobile-header');
    const topLimit = (header && header.getClientRects().length > 0 ? header.getBoundingClientRect().bottom : 0) + 8;
    const bottomLimit = Math.min(window.innerHeight, navTop) - 8;
    const up = list.bottom > bottomLimit && trigger.top - list.height - 6 >= topLimit;
    let shift = 0;
    if (list.right > window.innerWidth - 8) shift = window.innerWidth - 8 - list.right;
    if (list.left + shift < 8) shift = 8 - list.left;
    setPlacement({ up, shift });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    listRef.current?.querySelector('[role^="menuitem"]:not([aria-disabled="true"])')?.focus();
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    // Rolar a página ou redimensionar fecha o menu (a posição ficaria desatualizada).
    const onScroll = (event) => {
      if (!listRef.current?.contains(event.target)) setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  const onListKeyDown = (event) => {
    const nodes = [...(listRef.current?.querySelectorAll('[role^="menuitem"]:not([aria-disabled="true"])') ?? [])];
    const current = nodes.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') focusItem(current + 1);
    else if (event.key === 'ArrowUp') focusItem(current - 1);
    else if (event.key === 'Home') focusItem(0);
    else if (event.key === 'End') focusItem(nodes.length - 1);
    else if (event.key === 'Escape') close();
    else if (event.key === 'Tab') close(false);
    else return;
    event.preventDefault();
  };

  return (
    <div className="menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`menu__trigger ${triggerClassName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setPlacement({ up: false, shift: 0 });
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setPlacement({ up: false, shift: 0 });
            setOpen(true);
          }
        }}
      >
        <Icon size={18} aria-hidden="true" />
        <span className="visually-hidden">{label}</span>
      </button>

      {open && (
        <ul
          id={menuId}
          ref={listRef}
          role="menu"
          aria-label={label}
          className={`menu__list menu__list--${align} ${placement.up ? 'menu__list--up' : ''}`}
          style={placement.shift ? { transform: `translateX(${placement.shift}px)` } : undefined}
          onKeyDown={onListKeyDown}
        >
          {items.map((item, index) =>
            item.separator ? (
              <li key={`sep-${index}`} role="separator" className="menu__separator" />
            ) : (
              <li key={item.label} role="none">
                <button
                  type="button"
                  role={item.checked !== undefined ? 'menuitemradio' : 'menuitem'}
                  aria-checked={item.checked}
                  aria-disabled={item.disabled || undefined}
                  tabIndex={-1}
                  className={`menu__item ${item.danger ? 'menu__item--danger' : ''}`}
                  onClick={() => {
                    if (item.disabled) return;
                    close();
                    item.onSelect?.();
                  }}
                >
                  {item.icon && <item.icon size={16} aria-hidden="true" />}
                  <span>{item.label}</span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
