const cache = new Map();

export async function getSpeciesImage(name) {
  if (!name) return null;

  if (cache.has(name)) {
    return cache.get(name);
  }

  const title = encodeURIComponent(name);

  const url =
    `https://en.wikipedia.org/w/api.php?action=query` +
    `&prop=pageimages` +
    `&format=json` +
    `&piprop=thumbnail` +
    `&pithumbsize=300` +
    `&redirects` +
    `&origin=*` +
    `&titles=${title}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    const pages = data?.query?.pages || {};
    const page = Object.values(pages)[0];

    const img = page?.thumbnail?.source || null;

    cache.set(name, img);

    return img;
  } catch {
    return null;
  }
}