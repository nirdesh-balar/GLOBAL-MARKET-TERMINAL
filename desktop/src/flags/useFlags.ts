import { useEffect, useState } from 'react';
import { flagStore } from './flagStore';
import type { FlagStoreState } from './types';

export function useFlags(): FlagStoreState & {
  assignFlag: typeof flagStore.assignFlag;
  removeFlag: typeof flagStore.removeFlag;
  clearColor: typeof flagStore.clearColor;
  setAlias: typeof flagStore.setAlias;
  getFlag: typeof flagStore.getFlag;
  getSymbolsForColor: typeof flagStore.getSymbolsForColor;
} {
  const [current, setCurrent] = useState<FlagStoreState>(flagStore.getState);

  useEffect(() => {
    void flagStore.init();
    const unsubscribe = flagStore.subscribe(() => {
      setCurrent(flagStore.getState());
    });
    return unsubscribe;
  }, []);

  return {
    ...current,
    assignFlag: flagStore.assignFlag,
    removeFlag: flagStore.removeFlag,
    clearColor: flagStore.clearColor,
    setAlias: flagStore.setAlias,
    getFlag: flagStore.getFlag,
    getSymbolsForColor: flagStore.getSymbolsForColor
  };
}
