import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const Base = (props: IconProps) => (
  <svg
    aria-hidden="true"
    fill="none"
    height="16"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.75"
    viewBox="0 0 24 24"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  />
);

export const CopyIcon = (props: IconProps) => (
  <Base {...props}>
    <rect height="13" rx="2" width="13" x="8" y="8" />
    <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
  </Base>
);

export const SaveIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M4 19h16" />
  </Base>
);

export const FolderIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Base>
);

export const FileIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6" />
  </Base>
);

export const RefreshIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
    <path d="M4 4v4h4" />
    <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
    <path d="M20 20v-4h-4" />
  </Base>
);

export const CloseIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </Base>
);

export const ArrowUpIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 19V5" />
    <path d="M6 11l6-6 6 6" />
  </Base>
);

export const ArrowDownIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 5v14" />
    <path d="M6 13l6 6 6-6" />
  </Base>
);

export const PlusIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Base>
);

export const SearchIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Base>
);

export const WarningIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4" />
    <path d="M12 17.5v.5" />
  </Base>
);

export const RevealIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M14 4h6v6" />
    <path d="M20 4L11 13" />
    <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
  </Base>
);

export const ListIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M9 6h11" />
    <path d="M9 12h11" />
    <path d="M9 18h11" />
    <path d="M4 6h.5" />
    <path d="M4 12h.5" />
    <path d="M4 18h.5" />
  </Base>
);
