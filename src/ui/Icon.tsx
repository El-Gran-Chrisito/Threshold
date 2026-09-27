const PATHS: Record<string, string> = {
  select: 'M5 3l13 8-6 1.5L9 19z',
  wall: 'M3 18h18M3 18V8h6v10M9 8h12M15 8v10',
  room: 'M4 5h16v14H4zM4 5l4 4M20 5l-4 4',
  polyroom: 'M4 9l6-5 10 4-2 11H6z',
  door: 'M5 20V4h9v16M5 20h14M14 4a10 10 0 0 1 0 16',
  window: 'M4 4h16v16H4zM12 4v16M4 12h16',
  item: 'M4 12h16v5H4zM6 12V8h12v4M6 17v2M18 17v2',
  paint: 'M4 4h12v5H4zM16 6h3v6h-8v3M10 15h2v6h-2z',
  measure: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  label: 'M5 5h14M12 5v14M9 19h6',
  pan: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  catalog: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  levels: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  budget: 'M12 3v18M16 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7',
  project: 'M4 5h6l2 2h8v12H4z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  rotate: 'M20 12a8 8 0 1 1-3-6.2M20 4v5h-5',
  mirror: 'M12 3v18M8 7L3 12l5 5M16 7l5 5-5 5',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.5-2',
  explode: 'M12 2v5M12 17v5M2 12h5M17 12h5M9 9h6v6H9zM4.5 4.5l3 3M19.5 4.5l-3 3M4.5 19.5l3-3M19.5 19.5l-3-3',
  walk: 'M13 4a1.5 1.5 0 1 0 0 .1M10 21l2-6 2 2v4M12 15l-1-5 3-2 2 4 3 1M11 10l-3 2-1 3',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  roof: 'M3 12l9-7 9 7M6 10v9h12v-9',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01',
  close: 'M6 6l12 12M18 6L6 18',
  split: 'M12 4v16M4 4h16v16H4z',
  plan: 'M4 4h16v16H4zM4 12h8V4M12 16h8',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  magic: 'M5 19L19 5M15 4v3M20 9h-3M8 3v2M3 8h2',
  download: 'M12 4v11M7 10l5 5 5-5M4 20h16',
  upload: 'M12 20V9M7 14l5-5 5 5M4 4h16',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  check: 'M5 12l5 5 9-10',
  lowwalls: 'M3 19h18M5 19v-6h14v6M5 13l2-3h10l2 3',
}

export function Icon({ name, size = 20, title }: { name: string; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={PATHS[name] ?? PATHS.select} />
    </svg>
  )
}
