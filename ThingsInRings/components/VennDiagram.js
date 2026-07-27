"use client"
/*
  VennDiagram — tappable 3-circle Venn diagram with additive-color zones
  ───────────────────────────────────────────────────────────────────────
  Renders the 7 overlap regions of 3 circles (A, B, C) as exact polygons
  (sampled from the analytically-derived circle geometry — not SVG arc
  commands, since the arc endpoint parameterization is ambiguous about
  which of the two candidate circles it resolves to at a fixed radius),
  plus a wobbly dark blob filling the whole background representing
  "outside all rings" as something vague/amorphous rather than a
  hard-edged zone. Tapping any zone calls onZoneTap(zone) — no drag,
  no pan/zoom needed.

  Zone colors are additive-light style: primaries on the single circles,
  secondaries on the two-way overlaps, pale sage at the triple overlap.
  There are no text labels on the rings — color alone distinguishes them.

  Props:
    onZoneTap    (zone: string) => void   — zone is one of
                 'A','B','C','AB','AC','BC','ABC','OUTSIDE', or 'NA' (only
                 fires for 'NA' when showNA is true)
    selectedZone string | null            — highlights this zone with a ring
    disabled     bool                     — dims and disables tap handling
    full         bool                     — show the whole diagram with its
                 normal margins instead of the edge-to-edge crop
    showNA       bool                     — render the N/A zone marker (a
                 small asterisk circle, bottom-right) — the Knower's spot for
                 a word that doesn't fit any real zone
*/

export const ZONE_COLORS = {
  A: "#D8524A",     // muted red
  B: "#4C9A5B",     // muted forest green
  C: "#4066C9",     // muted royal blue
  AB: "#D9B54E",    // muted gold (red+green)
  AC: "#A6529C",    // muted purple (red+blue)
  BC: "#48A0A6",    // muted teal (green+blue)
  ABC: "#D9E3D4",   // off-white (all three)
  OUTSIDE: "#2D3B52",
  NA: "#DAE1D4",    // pale, low-contrast — quiet/secondary, unlike the bold real zones
}

// The N/A marker's "N/A" label is a muted sage-gray, not full-contrast text —
// it reads as deliberately quiet next to the bold, saturated zone colors.
const NA_TEXT_COLOR = "#828C79"

// Human-readable color names for each zone, used throughout the game's
// text (zone descriptions, guess/placement messages) instead of the
// internal A/B/C/AB/... keys.
export const ZONE_NAMES = {
  A: "Red", B: "Green", C: "Blue",
  AB: "Gold", AC: "Purple", BC: "Teal", ABC: "White", OUTSIDE: "Outer",
  NA: "N/A",
}

// Zones whose fill contrasts poorly enough with dark text (per computed
// luminance) that they're forced to use light text regardless — teal and
// green read better with white text even though the auto contrast pick
// would otherwise choose dark.
export const FORCE_LIGHT_TEXT_ZONES = new Set(["B", "BC"])

// A wobbly, irregular ring drawn around the whole diagram (not a fill) —
// represents "outside all rings" as something vague/amorphous rather than
// a hard-edged boundary. Generated once from a base radius perturbed by a
// few sine harmonics; centered on the same (160,160) point the zone
// geometry uses, with enough clearance that it never touches the circles.
const OUTSIDE_RING = "M 371.13 160 L 369.67 169.42 L 367.53 178.68 L 365.14 187.78 L 362.8 196.8 L 360.69 205.8 L 358.74 214.84 L 356.78 223.93 L 354.52 233.01 L 351.69 241.93 L 348.09 250.57 L 343.66 258.84 L 338.49 266.64 L 332.78 274.06 L 326.79 281.18 L 320.74 288.18 L 314.77 295.22 L 308.89 302.35 L 302.96 309.53 L 296.78 316.56 L 290.12 323.16 L 282.77 328.99 L 274.65 333.69 L 265.83 337.11 L 256.45 339.25 L 246.8 340.25 L 237.18 340.56 L 227.8 340.64 L 218.81 341.03 L 210.26 342.13 L 202.03 344.16 L 193.95 347.1 L 185.84 350.7 L 177.5 354.51 L 168.89 358.01 L 160 360.73 L 150.92 362.3 L 141.76 362.59 L 132.68 361.65 L 123.74 359.75 L 114.99 357.22 L 106.35 354.43 L 97.74 351.61 L 89.1 348.92 L 80.38 346.27 L 71.63 343.51 L 62.94 340.37 L 54.46 336.64 L 46.36 332.15 L 38.75 326.9 L 31.61 321 L 24.88 314.67 L 18.35 308.14 L 11.82 301.68 L 5.06 295.37 L -1.99 289.19 L -9.31 283.02 L -16.66 276.61 L -23.67 269.74 L -29.88 262.18 L -34.85 253.84 L -38.28 244.76 L -40.08 235.09 L -40.34 225.09 L -39.44 215.04 L -37.86 205.17 L -36.17 195.61 L -34.85 186.4 L -34.22 177.48 L -34.35 168.73 L -35.11 160 L -36.16 151.19 L -37.09 142.27 L -37.44 133.26 L -36.93 124.26 L -35.38 115.41 L -32.86 106.76 L -29.59 98.4 L -25.83 90.26 L -21.87 82.27 L -17.93 74.31 L -14.08 66.32 L -10.25 58.28 L -6.26 50.25 L -1.87 42.39 L 3.13 34.89 L 8.83 27.93 L 15.25 21.6 L 22.22 15.89 L 29.5 10.63 L 36.82 5.54 L 43.97 0.32 L 50.86 -5.35 L 57.46 -11.62 L 63.95 -18.5 L 70.54 -25.76 L 77.5 -33 L 85.05 -39.7 L 93.27 -45.34 L 102.19 -49.49 L 111.64 -51.9 L 121.41 -52.62 L 131.3 -51.87 L 141.09 -50.09 L 150.67 -47.83 L 160 -45.53 L 169.15 -43.53 L 178.18 -42.03 L 187.22 -40.93 L 196.29 -39.97 L 205.38 -38.85 L 214.42 -37.19 L 223.27 -34.75 L 231.85 -31.43 L 240.05 -27.29 L 247.9 -22.52 L 255.45 -17.37 L 262.83 -12.11 L 270.17 -6.9 L 277.53 -1.77 L 284.91 3.37 L 292.16 8.72 L 299.1 14.51 L 305.46 20.93 L 311.01 28.07 L 315.62 35.9 L 319.35 44.23 L 322.37 52.82 L 325.08 61.37 L 327.87 69.67 L 331.17 77.56 L 335.27 85.08 L 340.26 92.34 L 346.03 99.55 L 352.17 106.95 L 358.2 114.77 L 363.55 123.06 L 367.72 131.86 L 370.41 141.07 L 371.49 150.51 Z"

// Painted in this order: single-only zones first, then two-way overlaps,
// then the triple overlap last, so shared-edge anti-aliasing seams are
// covered by the smaller region drawn on top rather than leaving gaps.
const PATHS = {
  A: "M 60.29 102.43 L 61.03 95.68 L 62.23 88.99 L 63.88 82.40 L 65.98 75.94 L 68.51 69.63 L 71.46 63.51 L 74.82 57.61 L 78.58 51.94 L 82.71 46.55 L 87.20 41.45 L 92.02 36.66 L 97.15 32.22 L 102.58 28.13 L 108.27 24.42 L 114.20 21.10 L 120.35 18.20 L 126.67 15.72 L 133.15 13.67 L 139.75 12.07 L 146.45 10.92 L 153.21 10.23 L 160.00 10.00 L 166.79 10.23 L 173.55 10.92 L 180.25 12.07 L 186.85 13.67 L 193.33 15.72 L 199.65 18.20 L 205.80 21.10 L 211.73 24.42 L 217.42 28.13 L 222.85 32.22 L 227.98 36.66 L 232.80 41.45 L 237.29 46.55 L 241.42 51.94 L 245.18 57.61 L 248.54 63.51 L 251.49 69.63 L 254.02 75.94 L 256.12 82.40 L 257.77 88.99 L 258.97 95.68 L 259.71 102.43 L 257.73 101.11 L 255.72 99.84 L 253.68 98.62 L 251.61 97.44 L 249.51 96.32 L 247.39 95.24 L 245.24 94.22 L 243.07 93.25 L 240.87 92.33 L 238.66 91.46 L 236.42 90.64 L 234.17 89.88 L 231.89 89.17 L 229.60 88.52 L 227.30 87.92 L 224.98 87.38 L 222.65 86.89 L 220.31 86.46 L 217.96 86.08 L 215.61 85.76 L 213.24 85.50 L 210.87 85.29 L 208.50 85.13 L 206.12 85.04 L 203.74 85.00 L 201.36 85.02 L 198.98 85.09 L 196.60 85.22 L 194.23 85.41 L 191.86 85.66 L 189.50 85.96 L 187.15 86.31 L 184.81 86.73 L 182.47 87.19 L 180.15 87.72 L 177.84 88.30 L 175.55 88.93 L 173.27 89.62 L 171.01 90.36 L 168.76 91.15 L 166.54 92.00 L 164.34 92.90 L 162.16 93.86 L 160.00 94.86 L 157.84 93.86 L 155.66 92.90 L 153.46 92.00 L 151.24 91.15 L 148.99 90.36 L 146.73 89.62 L 144.45 88.93 L 142.16 88.30 L 139.85 87.72 L 137.53 87.19 L 135.19 86.73 L 132.85 86.31 L 130.50 85.96 L 128.14 85.66 L 125.77 85.41 L 123.40 85.22 L 121.02 85.09 L 118.64 85.02 L 116.26 85.00 L 113.88 85.04 L 111.50 85.13 L 109.13 85.29 L 106.76 85.50 L 104.39 85.76 L 102.04 86.08 L 99.69 86.46 L 97.35 86.89 L 95.02 87.38 L 92.70 87.92 L 90.40 88.52 L 88.11 89.17 L 85.83 89.88 L 83.58 90.64 L 81.34 91.46 L 79.13 92.33 L 76.93 93.25 L 74.76 94.22 L 72.61 95.24 L 70.49 96.32 L 68.39 97.44 L 66.32 98.62 L 64.28 99.84 L 62.27 101.11 L 60.29 102.43 Z",
  B: "M 259.71 102.43 L 259.87 104.81 L 259.96 107.18 L 260.00 109.56 L 259.98 111.94 L 259.91 114.32 L 259.78 116.70 L 259.59 119.07 L 259.34 121.44 L 259.04 123.80 L 258.69 126.15 L 258.27 128.50 L 257.81 130.83 L 257.28 133.15 L 256.70 135.46 L 256.07 137.75 L 255.38 140.03 L 254.64 142.29 L 253.85 144.54 L 253.00 146.76 L 252.10 148.96 L 251.14 151.14 L 250.14 153.30 L 249.08 155.43 L 247.98 157.54 L 246.82 159.62 L 245.61 161.67 L 244.36 163.70 L 243.06 165.69 L 241.71 167.65 L 240.32 169.58 L 238.87 171.47 L 237.39 173.33 L 235.86 175.16 L 234.29 176.94 L 232.67 178.69 L 231.02 180.40 L 229.32 182.07 L 227.59 183.70 L 225.82 185.29 L 224.01 186.83 L 222.16 188.33 L 220.28 189.79 L 218.36 191.20 L 216.41 192.57 L 216.20 194.94 L 215.94 197.31 L 215.62 199.66 L 215.24 202.01 L 214.81 204.35 L 214.32 206.68 L 213.78 209.00 L 213.18 211.30 L 212.52 213.59 L 211.82 215.86 L 211.06 218.12 L 210.24 220.36 L 209.37 222.57 L 208.45 224.77 L 207.48 226.94 L 206.46 229.09 L 205.38 231.21 L 204.26 233.31 L 203.08 235.38 L 201.86 237.42 L 200.59 239.43 L 199.27 241.41 L 197.90 243.36 L 196.49 245.28 L 195.03 247.16 L 193.53 249.01 L 191.99 250.82 L 190.40 252.59 L 188.77 254.32 L 187.10 256.02 L 185.39 257.67 L 183.64 259.29 L 181.85 260.86 L 180.03 262.39 L 178.17 263.87 L 176.28 265.32 L 174.35 266.71 L 172.39 268.06 L 170.39 269.36 L 168.37 270.61 L 166.32 271.82 L 164.24 272.98 L 162.13 274.08 L 160.00 275.14 L 166.22 277.87 L 172.61 280.17 L 179.15 282.04 L 185.79 283.46 L 192.52 284.42 L 199.29 284.92 L 206.09 284.96 L 212.87 284.54 L 219.61 283.66 L 226.27 282.33 L 232.82 280.54 L 239.24 278.32 L 245.50 275.66 L 251.56 272.59 L 257.39 269.11 L 262.98 265.24 L 268.29 261.00 L 273.30 256.42 L 277.99 251.50 L 282.33 246.27 L 286.31 240.77 L 289.90 235.00 L 293.10 229.00 L 295.88 222.80 L 298.23 216.43 L 300.15 209.91 L 301.62 203.28 L 302.63 196.56 L 303.19 189.79 L 303.28 183.00 L 302.91 176.21 L 302.09 169.47 L 300.80 162.80 L 299.07 156.23 L 296.90 149.79 L 294.29 143.51 L 291.26 137.43 L 287.83 131.57 L 284.01 125.95 L 279.81 120.61 L 275.26 115.56 L 270.38 110.84 L 265.19 106.45 L 259.71 102.43 Z",
  C: "M 103.59 192.57 L 101.64 191.20 L 99.72 189.79 L 97.84 188.33 L 95.99 186.83 L 94.18 185.29 L 92.41 183.70 L 90.68 182.07 L 88.98 180.40 L 87.33 178.69 L 85.71 176.94 L 84.14 175.16 L 82.61 173.33 L 81.13 171.47 L 79.68 169.58 L 78.29 167.65 L 76.94 165.69 L 75.64 163.70 L 74.39 161.67 L 73.18 159.62 L 72.02 157.54 L 70.92 155.43 L 69.86 153.30 L 68.86 151.14 L 67.90 148.96 L 67.00 146.76 L 66.15 144.54 L 65.36 142.29 L 64.62 140.03 L 63.93 137.75 L 63.30 135.46 L 62.72 133.15 L 62.19 130.83 L 61.73 128.50 L 61.31 126.15 L 60.96 123.80 L 60.66 121.44 L 60.41 119.07 L 60.22 116.70 L 60.09 114.32 L 60.02 111.94 L 60.00 109.56 L 60.04 107.18 L 60.13 104.81 L 60.29 102.43 L 54.81 106.45 L 49.62 110.84 L 44.74 115.56 L 40.19 120.61 L 35.99 125.95 L 32.17 131.57 L 28.74 137.43 L 25.71 143.51 L 23.10 149.79 L 20.93 156.23 L 19.20 162.80 L 17.91 169.47 L 17.09 176.21 L 16.72 183.00 L 16.81 189.79 L 17.37 196.56 L 18.38 203.28 L 19.85 209.91 L 21.77 216.43 L 24.12 222.80 L 26.90 229.00 L 30.10 235.00 L 33.69 240.77 L 37.67 246.27 L 42.01 251.50 L 46.70 256.42 L 51.71 261.00 L 57.02 265.24 L 62.61 269.11 L 68.44 272.59 L 74.50 275.66 L 80.76 278.32 L 87.18 280.54 L 93.73 282.33 L 100.39 283.66 L 107.13 284.54 L 113.91 284.96 L 120.71 284.92 L 127.48 284.42 L 134.21 283.46 L 140.85 282.04 L 147.39 280.17 L 153.78 277.87 L 160.00 275.14 L 157.87 274.08 L 155.76 272.98 L 153.68 271.82 L 151.63 270.61 L 149.61 269.36 L 147.61 268.06 L 145.65 266.71 L 143.72 265.32 L 141.83 263.87 L 139.97 262.39 L 138.15 260.86 L 136.36 259.29 L 134.61 257.67 L 132.90 256.02 L 131.23 254.32 L 129.60 252.59 L 128.01 250.82 L 126.47 249.01 L 124.97 247.16 L 123.51 245.28 L 122.10 243.36 L 120.73 241.41 L 119.41 239.43 L 118.14 237.42 L 116.92 235.38 L 115.74 233.31 L 114.62 231.21 L 113.54 229.09 L 112.52 226.94 L 111.55 224.77 L 110.63 222.57 L 109.76 220.36 L 108.94 218.12 L 108.18 215.86 L 107.48 213.59 L 106.82 211.30 L 106.22 209.00 L 105.68 206.68 L 105.19 204.35 L 104.76 202.01 L 104.38 199.66 L 104.06 197.31 L 103.80 194.94 L 103.59 192.57 Z",
  AB: "M 259.71 102.43 L 259.87 104.81 L 259.96 107.18 L 260.00 109.56 L 259.98 111.94 L 259.91 114.32 L 259.78 116.70 L 259.59 119.07 L 259.34 121.44 L 259.04 123.80 L 258.69 126.15 L 258.27 128.50 L 257.81 130.83 L 257.28 133.15 L 256.70 135.46 L 256.07 137.75 L 255.38 140.03 L 254.64 142.29 L 253.85 144.54 L 253.00 146.76 L 252.10 148.96 L 251.14 151.14 L 250.14 153.30 L 249.08 155.43 L 247.98 157.54 L 246.82 159.62 L 245.61 161.67 L 244.36 163.70 L 243.06 165.69 L 241.71 167.65 L 240.32 169.58 L 238.87 171.47 L 237.39 173.33 L 235.86 175.16 L 234.29 176.94 L 232.67 178.69 L 231.02 180.40 L 229.32 182.07 L 227.59 183.70 L 225.82 185.29 L 224.01 186.83 L 222.16 188.33 L 220.28 189.79 L 218.36 191.20 L 216.41 192.57 L 216.58 189.85 L 216.68 187.13 L 216.70 184.40 L 216.64 181.68 L 216.52 178.96 L 216.31 176.24 L 216.04 173.53 L 215.69 170.83 L 215.27 168.14 L 214.77 165.46 L 214.20 162.80 L 213.56 160.15 L 212.85 157.52 L 212.06 154.91 L 211.21 152.32 L 210.28 149.76 L 209.29 147.22 L 208.23 144.72 L 207.09 142.24 L 205.90 139.79 L 204.63 137.38 L 203.30 135.00 L 201.91 132.66 L 200.45 130.36 L 198.93 128.10 L 197.35 125.88 L 195.71 123.70 L 194.01 121.57 L 192.25 119.49 L 190.44 117.46 L 188.57 115.47 L 186.65 113.54 L 184.68 111.66 L 182.66 109.84 L 180.59 108.07 L 178.47 106.36 L 176.30 104.70 L 174.09 103.11 L 171.84 101.58 L 169.55 100.11 L 167.21 98.70 L 164.84 97.35 L 162.44 96.07 L 160.00 94.86 L 162.16 93.86 L 164.34 92.90 L 166.54 92.00 L 168.76 91.15 L 171.01 90.36 L 173.27 89.62 L 175.55 88.93 L 177.84 88.30 L 180.15 87.72 L 182.47 87.19 L 184.81 86.73 L 187.15 86.31 L 189.50 85.96 L 191.86 85.66 L 194.23 85.41 L 196.60 85.22 L 198.98 85.09 L 201.36 85.02 L 203.74 85.00 L 206.12 85.04 L 208.50 85.13 L 210.87 85.29 L 213.24 85.50 L 215.61 85.76 L 217.96 86.08 L 220.31 86.46 L 222.65 86.89 L 224.98 87.38 L 227.30 87.92 L 229.60 88.52 L 231.89 89.17 L 234.17 89.88 L 236.42 90.64 L 238.66 91.46 L 240.87 92.33 L 243.07 93.25 L 245.24 94.22 L 247.39 95.24 L 249.51 96.32 L 251.61 97.44 L 253.68 98.62 L 255.72 99.84 L 257.73 101.11 L 259.71 102.43 Z",
  AC: "M 103.59 192.57 L 101.64 191.20 L 99.72 189.79 L 97.84 188.33 L 95.99 186.83 L 94.18 185.29 L 92.41 183.70 L 90.68 182.07 L 88.98 180.40 L 87.33 178.69 L 85.71 176.94 L 84.14 175.16 L 82.61 173.33 L 81.13 171.47 L 79.68 169.58 L 78.29 167.65 L 76.94 165.69 L 75.64 163.70 L 74.39 161.67 L 73.18 159.62 L 72.02 157.54 L 70.92 155.43 L 69.86 153.30 L 68.86 151.14 L 67.90 148.96 L 67.00 146.76 L 66.15 144.54 L 65.36 142.29 L 64.62 140.03 L 63.93 137.75 L 63.30 135.46 L 62.72 133.15 L 62.19 130.83 L 61.73 128.50 L 61.31 126.15 L 60.96 123.80 L 60.66 121.44 L 60.41 119.07 L 60.22 116.70 L 60.09 114.32 L 60.02 111.94 L 60.00 109.56 L 60.04 107.18 L 60.13 104.81 L 60.29 102.43 L 62.27 101.11 L 64.28 99.84 L 66.32 98.62 L 68.39 97.44 L 70.49 96.32 L 72.61 95.24 L 74.76 94.22 L 76.93 93.25 L 79.13 92.33 L 81.34 91.46 L 83.58 90.64 L 85.83 89.88 L 88.11 89.17 L 90.40 88.52 L 92.70 87.92 L 95.02 87.38 L 97.35 86.89 L 99.69 86.46 L 102.04 86.08 L 104.39 85.76 L 106.76 85.50 L 109.13 85.29 L 111.50 85.13 L 113.88 85.04 L 116.26 85.00 L 118.64 85.02 L 121.02 85.09 L 123.40 85.22 L 125.77 85.41 L 128.14 85.66 L 130.50 85.96 L 132.85 86.31 L 135.19 86.73 L 137.53 87.19 L 139.85 87.72 L 142.16 88.30 L 144.45 88.93 L 146.73 89.62 L 148.99 90.36 L 151.24 91.15 L 153.46 92.00 L 155.66 92.90 L 157.84 93.86 L 160.00 94.86 L 157.56 96.07 L 155.16 97.35 L 152.79 98.70 L 150.45 100.11 L 148.16 101.58 L 145.91 103.11 L 143.70 104.70 L 141.53 106.36 L 139.41 108.07 L 137.34 109.84 L 135.32 111.66 L 133.35 113.54 L 131.43 115.47 L 129.56 117.46 L 127.75 119.49 L 125.99 121.57 L 124.29 123.70 L 122.65 125.88 L 121.07 128.10 L 119.55 130.36 L 118.09 132.66 L 116.70 135.00 L 115.37 137.38 L 114.10 139.79 L 112.91 142.24 L 111.77 144.72 L 110.71 147.22 L 109.72 149.76 L 108.79 152.32 L 107.94 154.91 L 107.15 157.52 L 106.44 160.15 L 105.80 162.80 L 105.23 165.46 L 104.73 168.14 L 104.31 170.83 L 103.96 173.53 L 103.69 176.24 L 103.48 178.96 L 103.36 181.68 L 103.30 184.40 L 103.32 187.13 L 103.42 189.85 L 103.59 192.57 Z",
  BC: "M 216.41 192.57 L 214.14 194.08 L 211.83 195.52 L 209.48 196.90 L 207.10 198.21 L 204.68 199.47 L 202.22 200.65 L 199.74 201.77 L 197.22 202.81 L 194.68 203.79 L 192.11 204.70 L 189.52 205.54 L 186.91 206.31 L 184.27 207.01 L 181.62 207.63 L 178.96 208.19 L 176.27 208.67 L 173.58 209.07 L 170.88 209.41 L 168.16 209.67 L 165.45 209.85 L 162.72 209.96 L 160.00 210.00 L 157.28 209.96 L 154.55 209.85 L 151.84 209.67 L 149.12 209.41 L 146.42 209.07 L 143.73 208.67 L 141.04 208.19 L 138.38 207.63 L 135.73 207.01 L 133.09 206.31 L 130.48 205.54 L 127.89 204.70 L 125.32 203.79 L 122.78 202.81 L 120.26 201.77 L 117.78 200.65 L 115.32 199.47 L 112.90 198.21 L 110.52 196.90 L 108.17 195.52 L 105.86 194.08 L 103.59 192.57 L 103.80 194.94 L 104.06 197.31 L 104.38 199.66 L 104.76 202.01 L 105.19 204.35 L 105.68 206.68 L 106.22 209.00 L 106.82 211.30 L 107.48 213.59 L 108.18 215.86 L 108.94 218.12 L 109.76 220.36 L 110.63 222.57 L 111.55 224.77 L 112.52 226.94 L 113.54 229.09 L 114.62 231.21 L 115.74 233.31 L 116.92 235.38 L 118.14 237.42 L 119.41 239.43 L 120.73 241.41 L 122.10 243.36 L 123.51 245.28 L 124.97 247.16 L 126.47 249.01 L 128.01 250.82 L 129.60 252.59 L 131.23 254.32 L 132.90 256.02 L 134.61 257.67 L 136.36 259.29 L 138.15 260.86 L 139.97 262.39 L 141.83 263.87 L 143.72 265.32 L 145.65 266.71 L 147.61 268.06 L 149.61 269.36 L 151.63 270.61 L 153.68 271.82 L 155.76 272.98 L 157.87 274.08 L 160.00 275.14 L 162.13 274.08 L 164.24 272.98 L 166.32 271.82 L 168.37 270.61 L 170.39 269.36 L 172.39 268.06 L 174.35 266.71 L 176.28 265.32 L 178.17 263.87 L 180.03 262.39 L 181.85 260.86 L 183.64 259.29 L 185.39 257.67 L 187.10 256.02 L 188.77 254.32 L 190.40 252.59 L 191.99 250.82 L 193.53 249.01 L 195.03 247.16 L 196.49 245.28 L 197.90 243.36 L 199.27 241.41 L 200.59 239.43 L 201.86 237.42 L 203.08 235.38 L 204.26 233.31 L 205.38 231.21 L 206.46 229.09 L 207.48 226.94 L 208.45 224.77 L 209.37 222.57 L 210.24 220.36 L 211.06 218.12 L 211.82 215.86 L 212.52 213.59 L 213.18 211.30 L 213.78 209.00 L 214.32 206.68 L 214.81 204.35 L 215.24 202.01 L 215.62 199.66 L 215.94 197.31 L 216.20 194.94 L 216.41 192.57 Z",
  ABC: "M 216.41 192.57 L 214.14 194.08 L 211.83 195.52 L 209.48 196.90 L 207.10 198.21 L 204.68 199.47 L 202.22 200.65 L 199.74 201.77 L 197.22 202.81 L 194.68 203.79 L 192.11 204.70 L 189.52 205.54 L 186.91 206.31 L 184.27 207.01 L 181.62 207.63 L 178.96 208.19 L 176.27 208.67 L 173.58 209.07 L 170.88 209.41 L 168.16 209.67 L 165.45 209.85 L 162.72 209.96 L 160.00 210.00 L 157.28 209.96 L 154.55 209.85 L 151.84 209.67 L 149.12 209.41 L 146.42 209.07 L 143.73 208.67 L 141.04 208.19 L 138.38 207.63 L 135.73 207.01 L 133.09 206.31 L 130.48 205.54 L 127.89 204.70 L 125.32 203.79 L 122.78 202.81 L 120.26 201.77 L 117.78 200.65 L 115.32 199.47 L 112.90 198.21 L 110.52 196.90 L 108.17 195.52 L 105.86 194.08 L 103.59 192.57 L 103.42 189.85 L 103.32 187.13 L 103.30 184.40 L 103.36 181.68 L 103.48 178.96 L 103.69 176.24 L 103.96 173.53 L 104.31 170.83 L 104.73 168.14 L 105.23 165.46 L 105.80 162.80 L 106.44 160.15 L 107.15 157.52 L 107.94 154.91 L 108.79 152.32 L 109.72 149.76 L 110.71 147.22 L 111.77 144.72 L 112.91 142.24 L 114.10 139.79 L 115.37 137.38 L 116.70 135.00 L 118.09 132.66 L 119.55 130.36 L 121.07 128.10 L 122.65 125.88 L 124.29 123.70 L 125.99 121.57 L 127.75 119.49 L 129.56 117.46 L 131.43 115.47 L 133.35 113.54 L 135.32 111.66 L 137.34 109.84 L 139.41 108.07 L 141.53 106.36 L 143.70 104.70 L 145.91 103.11 L 148.16 101.58 L 150.45 100.11 L 152.79 98.70 L 155.16 97.35 L 157.56 96.07 L 160.00 94.86 L 162.44 96.07 L 164.84 97.35 L 167.21 98.70 L 169.55 100.11 L 171.84 101.58 L 174.09 103.11 L 176.30 104.70 L 178.47 106.36 L 180.59 108.07 L 182.66 109.84 L 184.68 111.66 L 186.65 113.54 L 188.57 115.47 L 190.44 117.46 L 192.25 119.49 L 194.01 121.57 L 195.71 123.70 L 197.35 125.88 L 198.93 128.10 L 200.45 130.36 L 201.91 132.66 L 203.30 135.00 L 204.63 137.38 L 205.90 139.79 L 207.09 142.24 L 208.23 144.72 L 209.29 147.22 L 210.28 149.76 L 211.21 152.32 L 212.06 154.91 L 212.85 157.52 L 213.56 160.15 L 214.20 162.80 L 214.77 165.46 L 215.27 168.14 L 215.69 170.83 L 216.04 173.53 L 216.31 176.24 L 216.52 178.96 L 216.64 181.68 L 216.70 184.40 L 216.68 187.13 L 216.58 189.85 L 216.41 192.57 Z",
}

// Approximate centroid of each zone (used to place the word-count digit),
// plus a manually-chosen point for OUTSIDE near the bottom of the visible
// blob area (below the circles), since the blob's own geometric centroid
// sits underneath the circles and would never be visible.
export const ZONE_CENTERS = {
  A: [159.5, 57.5],
  B: [254, 215],
  C: [66.5, 215],
  AB: [224, 120.5],
  AC: [96.5, 120.5],
  BC: [159.5, 230],
  ABC: [159.5, 162.5],
  OUTSIDE: [160, 328],
}


function relLuminance(hex) {
  const n = parseInt(hex.replace("#", ""), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function contrastRatio(hexA, hexB) {
  const l1 = relLuminance(hexA), l2 = relLuminance(hexB)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}
const DIGIT_DARK = "#2A303C"
const DIGIT_LIGHT = "#FFF4F0"
function digitColorFor(zone) {
  const bg = ZONE_COLORS[zone]
  if (FORCE_LIGHT_TEXT_ZONES.has(zone)) return DIGIT_LIGHT
  return contrastRatio(DIGIT_DARK, bg) >= contrastRatio(DIGIT_LIGHT, bg) ? DIGIT_DARK : DIGIT_LIGHT
}

// Per-zone text budget: an approximate rectangle (in the diagram's own user
// units) that fits inside each irregular region, with the anchor point the
// stacked words are centered on. Hand-tuned to the zone geometry — single-ring
// crescents are tall, overlap lenses are narrower, the triple center is small.
const ZONE_TEXT_BUDGET = {
  A: { w: 80.1, h: 34.2, cx: 159.5, cy: 57.5 },
  B: { w: 47.7, h: 72, cx: 254, cy: 215 },
  C: { w: 48.6, h: 71.1, cx: 66.5, cy: 215 },
  AB: { w: 33.3, h: 41.4, cx: 224, cy: 120.5 },
  AC: { w: 33.3, h: 41.4, cx: 96.5, cy: 120.5 },
  BC: { w: 45, h: 28.8, cx: 159.5, cy: 230 },
  ABC: { w: 45.9, h: 45, cx: 159.5, cy: 162.5 },
  OUTSIDE: { w: 205, h: 46, cx: 160, cy: 326 },
}

// Best-fit sizing: pick the largest font (capped) at which every word fits the
// budget's width (sized off the longest word) and the whole stack fits its
// height. More/longer words -> smaller text, so all placed words stay visible.
const CHAR_W = 0.58   // mean glyph advance as a fraction of font size (bold sans)
const LINE_H = 1.16   // line height as a fraction of font size
const MAX_FONT = 17
const MIN_FONT = 4.5
function fitWords(words, b) {
  const n = words.length
  if (!n) return null
  const longest = words.reduce((m, w) => Math.max(m, w.length), 1)
  const byWidth = b.w / (longest * CHAR_W)
  const byHeight = b.h / (n * LINE_H)
  const fontSize = Math.max(MIN_FONT, Math.min(MAX_FONT, byWidth, byHeight))
  return { fontSize, lineH: fontSize * LINE_H }
}

// Zoomed crop: trim the viewBox down close to the circles' own bounding box
// (x≈17..303) rather than the wider blob, so the ring group fills most of the
// width and only a sliver of the blob's outward bulge remains visible at the
// edges. Centered on the circle group's center (x=160), not the blob's own
// center, since it's the circles we're zooming to.
const CROP_W = 300
const VIEWBOX = `${(160 - CROP_W / 2).toFixed(1)} -65 ${CROP_W} 450`
// Pass `full` to show the whole diagram with its normal margins (edges not
// shaved) instead of the edge-to-edge crop — e.g. the secret-rules screen.
const FULL_VIEWBOX = "-65 -65 450 450"

export default function VennDiagram({ onZoneTap, selectedZone = null, disabled = false, zoneWords = {}, full = false, showNA = false }) {
  function tap(zone) {
    if (disabled) return
    onZoneTap?.(zone)
  }

  return (
    <svg viewBox={full ? FULL_VIEWBOX : VIEWBOX} width="100%" style={{ display: "block", touchAction: "manipulation", opacity: disabled ? 0.6 : 1 }}>
      <path
        d={OUTSIDE_RING}
        fill={ZONE_COLORS.OUTSIDE}
        onClick={() => tap("OUTSIDE")}
        stroke={ZONE_COLORS.OUTSIDE}
        strokeWidth={1}
        strokeLinejoin="round"
        style={{ cursor: disabled ? "default" : "pointer" }}
      />
      {selectedZone === "OUTSIDE" && (
        <path d={OUTSIDE_RING} fill="none" stroke="white" strokeWidth={4} strokeLinejoin="round" style={{ pointerEvents: "none" }} />
      )}
      {Object.entries(PATHS).map(([zone, d]) => (
        <path
          key={zone}
          d={d}
          fill={ZONE_COLORS[zone]}
          onClick={() => tap(zone)}
          stroke={ZONE_COLORS[zone]}
          strokeWidth={1}
          style={{ cursor: disabled ? "default" : "pointer" }}
        />
      ))}
      {/* Selection highlight is drawn as its own outline pass, on top of every
          fill, so a shared-edge neighbor painted afterward can never cover
          part of it (which is what caused the uneven/broken border before). */}
      {selectedZone && PATHS[selectedZone] && (
        <path
          d={PATHS[selectedZone]}
          fill="none"
          stroke="white"
          strokeWidth={4}
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
      )}
      {Object.entries(ZONE_TEXT_BUDGET).map(([zone, b]) => {
        const words = zoneWords[zone] ?? []
        const fit = fitWords(words, b)
        if (!fit) return null
        const top = b.cy - (words.length * fit.lineH) / 2 + fit.lineH / 2
        return (
          <g key={zone} style={{ pointerEvents: "none" }}>
            {words.map((word, i) => (
              <text
                key={i}
                x={b.cx}
                y={top + i * fit.lineH}
                textAnchor="middle"
                dominantBaseline="central"
                fill={digitColorFor(zone)}
                fontSize={fit.fontSize}
                fontWeight={800}
              >
                {word}
              </text>
            ))}
          </g>
        )
      })}
      {/* N/A zone — a small asterisk marker at the bottom-right. Its own zone
          the Knower can place words into; always shows just "*" (never words). */}
      {showNA && (
        <g data-testid="na-zone-marker" onClick={() => tap("NA")} style={{ cursor: disabled ? "default" : "pointer" }}>
          <circle cx={332} cy={336} r={27} fill={ZONE_COLORS.NA} stroke={ZONE_COLORS.NA} strokeWidth={1} />
          <text x={332} y={337} textAnchor="middle" dominantBaseline="central" fill={NA_TEXT_COLOR} fontSize={17} fontWeight={800} style={{ pointerEvents: "none" }}>N/A</text>
          {/* Selection highlight matches the ring/zone paths' own pattern: no
              border at rest, a white outline drawn only when selected. */}
          {selectedZone === "NA" && (
            <circle cx={332} cy={336} r={27} fill="none" stroke="white" strokeWidth={4} style={{ pointerEvents: "none" }} />
          )}
        </g>
      )}
    </svg>
  )
}
