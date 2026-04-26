// Lucide-style stroked icons. Tree-shaken inline.
// Migrated from .tmp-argos-v2/argos/icons.jsx — pixel-perfect SVG paths preserved.
import * as React from 'react'

export interface IconProps {
  size?: number
  stroke?: string
  sw?: number // strokeWidth
  fill?: string
  children?: React.ReactNode
}

const Icon: React.FC<IconProps & { d?: string }> = ({
  d,
  size = 16,
  stroke = 'currentColor',
  sw = 1.6,
  fill = 'none',
  children,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke={stroke}
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {d ? <path d={d} /> : children}
  </svg>
)

export const Home: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M3 11.5L12 4l9 7.5" />
    <path d="M5 10v10h14V10" />
  </Icon>
)

export const Network: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="2" />
    <circle cx="4" cy="6" r="1.6" />
    <circle cx="20" cy="6" r="1.6" />
    <circle cx="4" cy="18" r="1.6" />
    <circle cx="20" cy="18" r="1.6" />
    <path d="M5.4 7.1L10.6 11M18.6 7.1L13.4 11M5.4 16.9L10.6 13M18.6 16.9L13.4 13" />
  </Icon>
)

export const FileText: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6" />
    <path d="M8 13h8M8 17h6" />
  </Icon>
)

export const Alert: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Icon>
)

export const Database: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
    <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
  </Icon>
)

export const Info: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8h.01M11 12h1v4h1" />
  </Icon>
)

export const X: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)

export const Send: React.FC<IconProps> = (p) => (
  <Icon {...p} sw={2}>
    <path d="M5 12l14-7-5 14-2-6-7-1z" />
  </Icon>
)

export const Eye: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)

export const Chev: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
)

export const ChevDown: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
)

export const Copy: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </Icon>
)

export const Share: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <circle cx="18" cy="5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="19" r="2.5" />
    <path d="M8.2 10.7l7.6-4.4M8.2 13.3l7.6 4.4" />
  </Icon>
)

export const Download: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M12 4v12M6 12l6 6 6-6M5 21h14" />
  </Icon>
)

export const Search: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </Icon>
)

export const Building: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <rect x="4" y="3" width="16" height="18" rx="1" />
    <path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M11 21v-4h2v4" />
  </Icon>
)

export const Briefcase: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M3 13h18" />
  </Icon>
)

export const User: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
  </Icon>
)

export const Doc: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6" />
  </Icon>
)

export const Sun: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </Icon>
)

export const Ico = {
  Home,
  Network,
  FileText,
  Alert,
  Database,
  Info,
  X,
  Send,
  Eye,
  Chev,
  ChevDown,
  Copy,
  Share,
  Download,
  Search,
  Building,
  Briefcase,
  User,
  Doc,
  Sun,
}
