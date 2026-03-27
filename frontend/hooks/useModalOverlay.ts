'use client';

import { useRef, useCallback } from 'react';

/**
 * Hook for safe modal overlay dismiss behavior.
 * Only closes the modal if mousedown AND mouseup both happen on the overlay.
 * Prevents closing when user drags/selects text inside the modal and releases outside.
 *
 * Usage:
 *   const { overlayProps } = useModalOverlay(onClose, { disabled: loading });
 *   <div {...overlayProps}> ... <div onClick={e => e.stopPropagation()}> modal </div> </div>
 */
export function useModalOverlay(onClose: () => void, options?: { disabled?: boolean }) {
  const mouseDownTarget = useRef<EventTarget | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    mouseDownTarget.current = e.target;
  }, []);

  const onClick = useCallback((e: React.MouseEvent) => {
    if (options?.disabled) return;
    // Only close if mousedown started on this same overlay element
    if (mouseDownTarget.current === e.currentTarget && e.target === e.currentTarget) {
      onClose();
    }
    mouseDownTarget.current = null;
  }, [onClose, options?.disabled]);

  return {
    overlayProps: { onMouseDown, onClick },
  };
}
