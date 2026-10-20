import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-5 shrink-0"
    >
      {children}
    </svg>
  );
}

export function UsersIcon() {
  return (
    <Icon>
      <path d="M16 20v-1.2A3.8 3.8 0 0 0 12.2 15H7.8A3.8 3.8 0 0 0 4 18.8V20" strokeLinecap="round" />
      <circle cx="10" cy="8" r="3" />
      <path d="M20 20v-1.1A3.4 3.4 0 0 0 17.2 15.6" strokeLinecap="round" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6" strokeLinecap="round" />
    </Icon>
  );
}

export function CheckIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12.2 11 14.7 15.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export function MinusIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8" />
      <path d="M8 12h8" strokeLinecap="round" />
    </Icon>
  );
}

export function MoonIcon() {
  return (
    <Icon>
      <path d="M16 14.5A6.5 6.5 0 0 1 9.5 8 6.5 6.5 0 1 0 16 14.5Z" strokeLinejoin="round" />
    </Icon>
  );
}

export function CameraIcon() {
  return (
    <Icon>
      <rect x="4" y="7" width="16" height="12" rx="2" />
      <circle cx="12" cy="13" r="3" />
      <path d="M9 7 10.2 5h3.6L15 7" strokeLinejoin="round" />
    </Icon>
  );
}

export function PageIcon() {
  return (
    <Icon>
      <path d="M7 4h7l4 4v12H7V4Z" strokeLinejoin="round" />
      <path d="M14 4v4h4" strokeLinejoin="round" />
    </Icon>
  );
}

export function LinkIcon() {
  return (
    <Icon>
      <path d="M10 13a4 4 0 0 0 5.7.4l2-2A4 4 0 0 0 12 5.7l-1.2 1.1" strokeLinecap="round" />
      <path d="M14 11a4 4 0 0 0-5.7-.4l-2 2A4 4 0 0 0 12 18.3l1.1-1.1" strokeLinecap="round" />
    </Icon>
  );
}

export function MailIcon() {
  return (
    <Icon>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </Icon>
  );
}

export function LayoutIcon() {
  return (
    <Icon>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Icon>
  );
}

export function LayersIcon() {
  return (
    <Icon>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </Icon>
  );
}

export function MessageIcon() {
  return (
    <Icon>
      <path d="M5 6h14v9H8l-3 3V6Z" />
    </Icon>
  );
}

export function ActivityIcon() {
  return (
    <Icon>
      <path d="M3 12h3l2-6 4 12 2-6h3" />
      <path d="M19 8.5a5 5 0 0 1 0 7" />
      <path d="M21 5.5a9 9 0 0 1 0 13" />
    </Icon>
  );
}
