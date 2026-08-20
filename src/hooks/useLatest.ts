import { useEffect, useRef, type RefObject } from 'react';

/**
 * Conserve la derniere valeur d'une prop dans une ref, mise a jour apres le
 * rendu. Permet aux callbacks et aux effets asynchrones de lire la valeur
 * courante sans se re-creer a chaque rendu — et sans lire de ref pendant le
 * rendu, ce que React interdit.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef<T>(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
