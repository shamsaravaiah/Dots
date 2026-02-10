/** Custom hook for autosave with debouncing. */

import { useCallback, useRef, useEffect } from 'react';

/**
 * Custom hook for autosave with debouncing.
 * @param {Function} saveFunction - Function to call for saving
 * @param {number} delay - Debounce delay in milliseconds (default: 400ms)
 * @param {boolean} immediate - Whether to save immediately without debounce
 * @returns {Function} - Function to trigger autosave
 */
export function useAutosave(saveFunction, delay = 400, immediate = false) {
  const timeoutRef = useRef(null);
  const pendingSaveRef = useRef(null);
  const isSavingRef = useRef(false);

  const triggerSave = useCallback((data) => {
    // If immediate, save right away
    if (immediate) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      pendingSaveRef.current = null;
      isSavingRef.current = true;
      saveFunction(data)
        .then(() => {
          isSavingRef.current = false;
        })
        .catch((error) => {
          console.error('Autosave failed:', error);
          isSavingRef.current = false;
        });
      return;
    }

    // Store the latest data
    pendingSaveRef.current = data;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      if (pendingSaveRef.current && !isSavingRef.current) {
        isSavingRef.current = true;
        saveFunction(pendingSaveRef.current)
          .then(() => {
            isSavingRef.current = false;
            pendingSaveRef.current = null;
          })
          .catch((error) => {
            console.error('Autosave failed:', error);
            isSavingRef.current = false;
          });
      }
      timeoutRef.current = null;
    }, delay);
  }, [saveFunction, delay, immediate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // Save any pending data before unmount
      if (pendingSaveRef.current && !isSavingRef.current) {
        isSavingRef.current = true;
        saveFunction(pendingSaveRef.current)
          .catch((error) => {
            console.error('Final autosave failed:', error);
          });
      }
    };
  }, [saveFunction]);

  return triggerSave;
}

