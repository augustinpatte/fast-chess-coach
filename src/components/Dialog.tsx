import { useEffect, useRef, type ReactNode } from 'react';

export interface DialogProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Actions affichees en pied de fenetre. */
  footer?: ReactNode;
}

/**
 * Fenetre modale simple : fermeture par Echap, focus initial place dans la
 * boite, retour du focus a l'element precedent.
 */
export function Dialog(props: DialogProps): React.JSX.Element | null {
  const boxRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!props.open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    boxRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previousFocus.current?.focus?.();
    };
  }, [props.open, props]);

  if (!props.open) return null;

  return (
    <div className="dialog-overlay" onMouseDown={props.onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        tabIndex={-1}
        ref={boxRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-head">
          <h2>{props.title}</h2>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={props.onClose}
            aria-label="Fermer"
          >
            ✕
          </button>
        </header>
        <div className="dialog-body">{props.children}</div>
        {props.footer ? <footer className="dialog-foot">{props.footer}</footer> : null}
      </div>
    </div>
  );
}
