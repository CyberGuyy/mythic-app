'use client';
// A popover under its chip: opens on the chip, closes on a pick, on Escape
// (without closing the composer under it) or on a press outside, and flips
// above the chip when there is no room below. Focus goes back to the chip.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function usePopover() {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const wrapRef = useRef(null);
  const chipRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const down = event => { if (!wrapRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open]);

  // Measured before paint: below the chip unless that runs off the window.
  useLayoutEffect(() => {
    if (!open || !popRef.current || !chipRef.current) return;
    const below = window.innerHeight - chipRef.current.getBoundingClientRect().bottom;
    setUp(below < popRef.current.offsetHeight + 16 && chipRef.current.getBoundingClientRect().top > popRef.current.offsetHeight + 16);
  }, [open]);

  const close = (refocus = true) => { setOpen(false); if (refocus) chipRef.current?.focus({ preventScroll: true }); };
  const onKeyDown = event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
  };
  return { open, setOpen, toggle: () => setOpen(value => !value), close, up, wrapRef, chipRef, popRef, onKeyDown };
}
