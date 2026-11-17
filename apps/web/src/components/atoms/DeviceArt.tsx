import { useId, type PointerEvent, type ReactElement } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type MotionStyle } from 'motion/react';
import { useReduced } from '@/hooks/useMotionPrefs';
import { cn } from '@/lib/cn';
import type { DeviceArtType, DeviceType } from '@/lib/devices';
import { SPRINGS, tiltFromPointer } from '@/lib/motion';

/*
 * Original, code-drawn device illustrations (generic shapes: no logos, brand marks or button glyphs).
 * Colour comes only from tokens: surface steps for the bodies, fg for edges, accent for glow.
 * Drawn on a 240x120 canvas; the ground sits at y=108.
 */

/** Banner gradient per device type; the colours are tokens (device-*). */
export const DEVICE_BANNER: Record<DeviceType, string> = {
  PC: 'from-device-pc to-device-pc-end',
  Mac: 'from-device-mac to-device-mac-end',
  Handheld: 'from-device-handheld to-device-handheld-end',
  Console: 'from-device-console to-device-console-end',
};

const BODY = 'fill-surface-3 stroke-fg/35';
const TOP = 'fill-surface-4 stroke-fg/35';
const FACE = 'fill-surface-2 stroke-fg/30';
const DARK = 'fill-surface-1 stroke-fg/25';

type Ids = { blur: string; screen: string; amb: string; id: string };

export type ArtParallax = {
  handlers: {
    onPointerMove: (e: PointerEvent<HTMLElement>) => void;
    onPointerLeave: () => void;
  };
  style: MotionStyle;
};

/** Pointer-driven tilt and slide for the art. Spread `handlers` on the hover area, pass `style` to DeviceArt. Inert when reduced. */
export function useArtParallax(): ArtParallax {
  const reduced = useReduced();
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rotateX = useSpring(tiltX, SPRINGS.tilt);
  const rotateY = useSpring(tiltY, SPRINGS.tilt);
  const x = useTransform(rotateY, (v) => v * 1.5);
  return {
    handlers: {
      onPointerMove: (e) => {
        if (reduced || e.pointerType === 'touch') return;
        const t = tiltFromPointer(
          e.clientX,
          e.clientY,
          e.currentTarget.getBoundingClientRect(),
          false,
        );
        tiltX.set(t.rotateX);
        tiltY.set(t.rotateY);
      },
      onPointerLeave: () => {
        tiltX.set(0);
        tiltY.set(0);
      },
    },
    style: { rotateX, rotateY, x, transformPerspective: 600 },
  };
}

/** A lit screen: blurred accent halo, a small game-scene inside, a hairline edge. */
function Screen({
  ids,
  name,
  x,
  y,
  w,
  h,
  r,
}: {
  ids: Ids;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}) {
  const clip = `${ids.id}-${name}`;
  const hills = `M${x} ${y + h} L${x} ${y + h * 0.7} L${x + w * 0.22} ${y + h * 0.52} L${x + w * 0.4} ${y + h * 0.72} L${x + w * 0.66} ${y + h * 0.4} L${x + w} ${y + h * 0.7} L${x + w} ${y + h} Z`;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={r}
        className="fill-accent"
        opacity={0.55}
        filter={`url(#${ids.blur})`}
      />
      <clipPath id={clip}>
        <rect x={x} y={y} width={w} height={h} rx={r} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect x={x} y={y} width={w} height={h} fill={`url(#${ids.screen})`} />
        <circle
          cx={x + w * 0.76}
          cy={y + h * 0.3}
          r={Math.max(2, h * 0.09)}
          className="fill-fg/75"
        />
        <path d={hills} className="fill-ground/45" />
      </g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={r}
        fill="none"
        className="stroke-fg/30"
        strokeWidth={1}
      />
    </g>
  );
}

/** An accent light with a soft halo. */
function Glow({ ids, cx, cy, r }: { ids: Ids; cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r * 1.8}
        className="fill-accent"
        opacity={0.6}
        filter={`url(#${ids.blur})`}
      />
      <circle cx={cx} cy={cy} r={r} className="fill-accent" />
    </g>
  );
}

/** Generic two-grip gamepad centred on the origin (about 84x46): sticks, d-pad and plain dots. */
function Pad({ ids }: { ids: Ids }) {
  return (
    <g strokeWidth={1.25} strokeLinejoin="round">
      <path
        className={BODY}
        d="M-22 -16 Q-30 -20 -38 -12 Q-44 4 -42 16 Q-40 24 -32 22 Q-26 20 -22 12 L-14 8 L14 8 L22 12 Q26 20 32 22 Q40 24 42 16 Q44 4 38 -12 Q30 -20 22 -16 Q0 -22 -22 -16 Z"
      />
      <circle cx={-24} cy={-4} r={6} className={DARK} />
      <circle cx={-24} cy={-4} r={2.6} className="fill-fg/35" />
      <circle cx={12} cy={5} r={5.5} className={DARK} />
      <circle cx={12} cy={5} r={2.4} className="fill-fg/35" />
      <path className="fill-fg/45" d="M-13 -1 h3 v3 h3 v3 h-3 v3 h-3 v-3 h-3 v-3 h3 z" />
      <circle cx={24} cy={-10} r={1.9} className="fill-fg/45" />
      <circle cx={24} cy={-2} r={1.9} className="fill-fg/45" />
      <circle cx={20} cy={-6} r={1.9} className="fill-fg/45" />
      <circle cx={28} cy={-6} r={1.9} className="fill-accent" />
      <circle cx={-3} cy={-7} r={1.2} className="fill-fg/40" />
      <circle cx={3} cy={-7} r={1.2} className="fill-fg/40" />
      <Glow ids={ids} cx={0} cy={2} r={1.4} />
    </g>
  );
}

function Desktop({ ids }: { ids: Ids }) {
  return (
    <g strokeWidth={1.5} strokeLinejoin="round">
      <path className={FACE} d="M82 90 H98 L102 104 H78 Z" />
      <rect x={62} y={102} width={56} height={5} rx={2.5} className={BODY} />
      <rect x={26} y={14} width={128} height={76} rx={6} className={BODY} />
      <Screen ids={ids} name="s" x={31} y={19} w={118} h={62} r={3} />
      <rect x={170} y={26} width={46} height={81} rx={6} className={BODY} />
      <rect x={175} y={31} width={36} height={71} rx={3} className={DARK} />
      {[50, 78].map((cy) => (
        <g key={cy}>
          <circle
            cx={193}
            cy={cy}
            r={11}
            fill="none"
            className="stroke-accent"
            opacity={0.6}
            filter={`url(#${ids.blur})`}
            strokeWidth={3}
          />
          <circle cx={193} cy={cy} r={11} fill="none" className="stroke-accent" />
          <circle cx={193} cy={cy} r={3} className="fill-accent/70" stroke="none" />
        </g>
      ))}
      <circle cx={193} cy={97} r={2.5} className="fill-fg/45" stroke="none" />
    </g>
  );
}

function Laptop({ ids }: { ids: Ids }) {
  return (
    <g strokeWidth={1.5} strokeLinejoin="round">
      <rect x={50} y={12} width={140} height={76} rx={7} className={BODY} />
      <Screen ids={ids} name="s" x={55} y={17} w={130} h={66} r={3} />
      <circle cx={120} cy={14.5} r={1} className="fill-fg/50" stroke="none" />
      <path className={FACE} d="M32 92 H208 L200 103 Q199 105 196 105 H44 Q41 105 40 103 Z" />
      <rect x={108} y={92} width={24} height={3.5} rx={1.75} className={DARK} />
      <path d="M32 92 H208" className="stroke-fg/55" fill="none" />
    </g>
  );
}

function Handheld({ ids }: { ids: Ids }) {
  return (
    <g strokeWidth={1.5} strokeLinejoin="round">
      <rect x={36} y={19} width={34} height={6} rx={3} className={FACE} />
      <rect x={170} y={19} width={34} height={6} rx={3} className={FACE} />
      <path
        className={BODY}
        d="M40 24 Q22 24 19 46 L12 90 Q10 104 26 104 Q39 104 45 94 L52 88 H188 L195 94 Q201 104 214 104 Q230 104 228 90 L221 46 Q218 24 200 24 Z"
      />
      <Screen ids={ids} name="s" x={62} y={30} w={116} h={52} r={4} />
      <circle cx={40} cy={44} r={8} className={DARK} />
      <circle cx={40} cy={44} r={3.5} className="fill-fg/35" stroke="none" />
      <path
        className="fill-fg/45"
        stroke="none"
        d="M38 63 h4 v5 h5 v4 h-5 v5 h-4 v-5 h-5 v-4 h5 z"
      />
      <circle cx={200} cy={37} r={3} className="fill-fg/45" stroke="none" />
      <circle cx={200} cy={51} r={3} className="fill-fg/45" stroke="none" />
      <circle cx={193} cy={44} r={3} className="fill-fg/45" stroke="none" />
      <circle cx={207} cy={44} r={3} className="fill-accent" stroke="none" />
      <circle cx={200} cy={72} r={8} className={DARK} />
      <circle cx={200} cy={72} r={3.5} className="fill-fg/35" stroke="none" />
    </g>
  );
}

function Hybrid({ ids }: { ids: Ids }) {
  return (
    <g strokeWidth={1.5} strokeLinejoin="round" transform="translate(0 6)">
      <rect x={60} y={20} width={120} height={72} rx={6} className={BODY} />
      <Screen ids={ids} name="s" x={65} y={25} w={110} h={62} r={3} />
      <rect x={22} y={16} width={34} height={82} rx={15} className="fill-surface-2 stroke-accent" />
      <rect x={184} y={16} width={34} height={82} rx={15} className={FACE} />
      <circle cx={39} cy={38} r={7} className={DARK} />
      <circle cx={39} cy={38} r={3} className="fill-fg/35" stroke="none" />
      {[
        [39, 63],
        [39, 77],
        [32, 70],
        [46, 70],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={2.4} className="fill-fg/45" stroke="none" />
      ))}
      {[
        [201, 31],
        [201, 45],
        [194, 38],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={2.4} className="fill-fg/45" stroke="none" />
      ))}
      <circle cx={208} cy={38} r={2.4} className="fill-accent" stroke="none" />
      <circle cx={201} cy={72} r={7} className={DARK} />
      <circle cx={201} cy={72} r={3} className="fill-fg/35" stroke="none" />
    </g>
  );
}

function ConsoleSlab({ ids }: { ids: Ids }) {
  return (
    <g strokeWidth={1.5} strokeLinejoin="round">
      <ellipse cx={84} cy={105} rx={30} ry={4.5} className={DARK} />
      <rect x={76} y={10} width={36} height={94} rx={18} className={DARK} />
      <rect x={62} y={8} width={38} height={96} rx={19} className={BODY} />
      <path
        d="M93 26 V86"
        className="stroke-accent"
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={0.6}
        filter={`url(#${ids.blur})`}
      />
      <path d="M93 26 V86" className="stroke-accent" strokeWidth={2.5} strokeLinecap="round" />
      <path d="M72 30 H84" className="stroke-fg/35" strokeWidth={2.5} strokeLinecap="round" />
      <g transform="translate(168 84)">
        <Pad ids={ids} />
      </g>
    </g>
  );
}

function ConsoleBox({ ids }: { ids: Ids }) {
  const vents: [number, number][] = [];
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 9; i++) {
      const u = 0.12 + (0.76 * i) / 8;
      const v = 0.22 + (0.56 * j) / 2;
      vents.push([28 + 104 * u + 22 * v, 56 - 16 * v]);
    }
  }
  return (
    <g strokeWidth={1.5} strokeLinejoin="round">
      <path className={DARK} d="M132 56 L154 40 V88 L132 104 Z" />
      <rect x={28} y={56} width={104} height={48} rx={4} className={BODY} />
      <path className={TOP} d="M28 56 L50 40 H154 L132 56 Z" />
      {vents.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.2} className="fill-fg/45" stroke="none" />
      ))}
      <path d="M40 70 H120" className="stroke-fg/25" strokeWidth={2.5} strokeLinecap="round" />
      <Glow ids={ids} cx={40} cy={90} r={2.6} />
      <circle cx={120} cy={90} r={3.5} className={FACE} />
      <g transform="translate(190 86) scale(0.9)">
        <Pad ids={ids} />
      </g>
    </g>
  );
}

function Generic({ ids }: { ids: Ids }) {
  return (
    <g transform="translate(120 60) scale(2.1)">
      <Pad ids={ids} />
    </g>
  );
}

const ART: Record<DeviceArtType, (p: { ids: Ids }) => ReactElement> = {
  desktop: Desktop,
  laptop: Laptop,
  handheld: Handheld,
  hybrid: Hybrid,
  'console-slab': ConsoleSlab,
  'console-box': ConsoleBox,
  generic: Generic,
};

export interface DeviceArtProps {
  type: DeviceArtType;
  className?: string;
  /** From useArtParallax(): tilts the art toward the pointer. Omit for a static drawing. */
  style?: MotionStyle;
}

/** Decorative illustration of a device type. Size it with className (the canvas is 2:1). */
export function DeviceArt({ type, className, style }: DeviceArtProps) {
  const id = useId().replace(/:/g, '');
  const ids: Ids = { id, blur: `${id}-blur`, screen: `${id}-screen`, amb: `${id}-amb` };
  const Art = ART[type];
  return (
    <motion.svg
      aria-hidden
      focusable="false"
      viewBox="0 0 240 120"
      className={cn('aspect-2/1 overflow-visible', className)}
      style={style}
    >
      <defs>
        <filter id={ids.blur} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation={7} />
        </filter>
        <linearGradient id={ids.screen} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--color-accent)', stopOpacity: 0.9 }} />
          <stop offset="1" style={{ stopColor: 'var(--color-surface-2)', stopOpacity: 1 }} />
        </linearGradient>
        <radialGradient id={ids.amb}>
          <stop offset="0" style={{ stopColor: 'var(--color-accent)', stopOpacity: 0.3 }} />
          <stop offset="1" style={{ stopColor: 'var(--color-accent)', stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <ellipse cx={120} cy={62} rx={116} ry={58} fill={`url(#${ids.amb})`} />
      <ellipse cx={120} cy={108} rx={88} ry={5} className="fill-ground/55" />
      <Art ids={ids} />
    </motion.svg>
  );
}
