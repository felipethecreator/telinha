// Ícones da Telinha — desenhados no traço do mundo fliperama (stroke 2, cantos vivos)
const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export const IconScreen = (p) => (
  <svg {...base} {...p}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M9 21h6M12 17.5V21" />
    <path d="M12 7.5v5M9.5 10.5 12 13l2.5-2.5" />
  </svg>
)

export const IconStop = (p) => (
  <svg {...base} {...p}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />
  </svg>
)

export const IconExit = (p) => (
  <svg {...base} {...p}>
    <path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" />
    <path d="M4 12h10M10 8l4 4-4 4" />
  </svg>
)

export const IconLink = (p) => (
  <svg {...base} {...p}>
    <path d="M9.5 14.5 14.5 9.5" />
    <path d="M11 6.5 13 4.5a4 4 0 0 1 5.7 5.7L16.5 12.5" />
    <path d="M13 17.5 11 19.5a4 4 0 0 1-5.7-5.7L7.5 11.5" />
  </svg>
)

export const IconSound = (p) => (
  <svg {...base} {...p}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" />
    <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
  </svg>
)

export const IconMute = (p) => (
  <svg {...base} {...p}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" />
    <path d="M15.5 9.5 20.5 14.5M20.5 9.5 15.5 14.5" />
  </svg>
)

export const IconFull = (p) => (
  <svg {...base} {...p}>
    <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
  </svg>
)

export const IconJoin = (p) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M17 8h5M19.5 5.5 22 8l-2.5 2.5" transform="translate(-2 0)" />
  </svg>
)

export const IconLeave = (p) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M16 10.5h6" />
  </svg>
)

export const IconJoystick = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="15" width="18" height="6" rx="2" />
    <path d="M9 15V8" />
    <circle cx="9" cy="5.5" r="2.5" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="18" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="18" r="1.4" fill="currentColor" stroke="none" />
  </svg>
)
