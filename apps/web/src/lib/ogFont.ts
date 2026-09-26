// Loads a tiny Noto Serif JP subset (only the glyphs we draw) for next/og image routes, since their default font has no kanji.
// Google Fonts serves a TrueType file to unknown user agents when asked with `text=`, which is what satori needs. Returns null on
// any failure so the caller can fall back to a glyph-free design instead of failing the whole image.
export async function loadJpFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@700&text=${encodeURIComponent(text)}`, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.24 Safari/534.24' } }).then((r) => r.text())
    const url = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:opentype|truetype|woff)'\)/)?.[1]
    if (!url) return null
    const res = await fetch(url)
    return res.ok ? await res.arrayBuffer() : null
  } catch {
    return null
  }
}

export const BRAND = { paper: '#f3efe6', ink: '#15171c', vermilion: '#c8412b' } as const
