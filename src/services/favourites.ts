import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'vsdr_favourites';

export type Favourite = { name: string; url: string };

export async function getFavourites(): Promise<Favourite[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveFavourites(favs: Favourite[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(favs));
}

export async function toggleFavourite(fav: Favourite, current: Favourite[]): Promise<Favourite[]> {
  const exists = current.some(f => f.url === fav.url);
  const next = exists
    ? current.filter(f => f.url !== fav.url)
    : [...current, { name: fav.name, url: fav.url }];
  await saveFavourites(next);
  return next;
}
