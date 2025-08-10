# vu-meter-react

<img width="1090" height="592" alt="image" src="https://github.com/user-attachments/assets/413aaa8c-b1f7-4366-88ec-96cf7c307e3a" />

React VU meter component designed to work from legacy React (16.8+) up to React 19. It computes RMS from Web Audio in real time and drives the needle with VU ballistics (~300 ms attack/release). Comes with light/dark themes and responsive sizing.

## Demo
[CodeSandBox](https://codesandbox.io/p/sandbox/2kwnxh)

## Installation
When published on npm:

```bash
npm i vu-meter-react
```

## Quick start

```tsx
import { VUMeter } from "vu-meter-react";

// Stereo (L/R)
<VUMeter
  audioContext={audioContext}
  sourceNode={sourceNode}
  referenceLevel={-18}
  options={{ width: 300, theme: "light" }}
/>

// Mono
<VUMeter
  audioContext={audioContext}
  sourceNode={sourceNode}
  mono
  referenceLevel={-20}
  options={{ width: 260, theme: "dark" }}
/>
```

## API

### Component
- `VUMeter(props: VUMeterProps)`
  - Single component that renders either a single (mono) meter or a stereo pair (L/R)

### Types
- `VUMeterProps`
  - `audioContext: AudioContext | null`
  - `sourceNode: AudioNode | null`
  - `mono?: boolean` — mono meter when true, stereo when false (default: false)
  - `label?: string` — mono: "MONO", stereo: "L"/"R" by default
  - `referenceLevel?: number` — dBFS treated as 0 VU (default: -18)
  - `options?: VUMeterOptions`

- `VUMeterOptions`
  - `theme?: 'dark' | 'light'` (default: 'light')
  - `needleColor?: string`
  - `labelColor?: string`
  - `backgroundColor?: string`
  - `boxColor?: string`
  - `fontFamily?: string`
  - `width?: number` — height is auto-calculated by aspect ratio when unspecified
  - `height?: number` — width is auto-calculated by aspect ratio when unspecified

### Rendering and metering
- SVG scale rendering with color accents for warning zones
- Needle is rotated via CSS transform; tuned for smooth animation
- Peak lamp turns on near the upper range and fades out after ~1s
- RMS via `getFloatTimeDomainData()`, converted to dBFS, then mapped to VU with measured piecewise interpolation
- VU ballistics (~300 ms attack/release) for natural motion

### Notes
- Due to browser autoplay policies, create/resume `AudioContext` from a user gesture (e.g., clicking Play)
- In stereo mode, the component internally uses a `ChannelSplitterNode` to meter L/R

## Build / Types / Docs
- Build (ESM/CJS + d.ts): `npm run build` → `dist/index.mjs`, `dist/index.cjs`, `dist/index.d.ts`
- Generate docs (TypeDoc): `npm run docs` → outputs to `docs/`

## License
MIT

