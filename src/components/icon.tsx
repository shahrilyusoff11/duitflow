const paths = {
  wallet: "M3 8V6a2 2 0 0 1 2-2h12v4M3 8h16a2 2 0 0 1 2 2v9a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V8Zm18 4h-5a2 2 0 0 0 0 4h5",
  chevron: "m6 9 6 6 6-6",
  arrow: "M4 12h15m-6-6 6 6-6 6",
  plus: "M12 5v14M5 12h14",
  receipt: "M5 3l2 2 2-2 3 2 3-2 2 2 2-2v18l-2-2-2 2-3-2-3 2-2-2-2 2V3Zm4 6h6m-6 4h6",
  outward: "M5 19 18 6M7 6h11v11",
  down: "M12 4v15m-6-6 6 6 6-6",
  income: "M18 5 6 17m0-9v9h9",
  expense: "M6 18 18 6m-9 0h9v9",
  net: "M3 9h16l-4-4m6 10H5l4 4",
  book: "M4 5h13a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V5Zm0 12h15M8 9h7",
  chat: "m3 10 17-7-4 17-5-5-3 3v-6l9-7",
  chart: "M4 4v16h16M8 15v-4m5 4V7m5 8v-6",
  pin: "M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Zm-5 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  lock: "M5 10h14v11H5zM8 10V7a4 4 0 1 1 8 0v3m-4 5v2",
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  tag: "m3 4 8-1 10 10-8 8L3 11V4Zm4 3h.01",
  settings: "M4 7h9m4 0h3M4 17h3m4 0h9M13 4v6M7 14v6",
} as const;

export function Icon({ name, size = 18 }: { name: keyof typeof paths; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
