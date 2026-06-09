// View mode: 'default' | 'accessibility' (larger text, higher contrast)
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ViewMode = 'default' | 'accessibility';

const KEY = '@vibesdr/view_mode';

export async function getViewMode(): Promise<ViewMode> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return (v === 'accessibility') ? 'accessibility' : 'default';
  } catch { return 'default'; }
}

export async function setViewMode(mode: ViewMode): Promise<void> {
  try { await AsyncStorage.setItem(KEY, mode); } catch {}
}

export async function clearViewMode(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY); } catch {}
}
