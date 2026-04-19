import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const Base = (props: IconProps) => (
  <svg
    fill="none"
    height="18"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.75"
    viewBox="0 0 24 24"
    width="18"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  />
);

export const OverviewIcon = (props: IconProps) => (
  <Base {...props}>
    <rect height="8" rx="1.5" width="8" x="3" y="3" />
    <rect height="5" rx="1.5" width="8" x="13" y="3" />
    <rect height="8" rx="1.5" width="8" x="13" y="11" />
    <rect height="5" rx="1.5" width="8" x="3" y="16" />
  </Base>
);

export const InspectorIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l5 5" />
    <path d="M10.5 7.5v6" />
    <path d="M7.5 10.5h6" />
  </Base>
);

export const ModsIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 3l8 4-8 4-8-4 8-4z" />
    <path d="M4 12l8 4 8-4" />
    <path d="M4 17l8 4 8-4" />
  </Base>
);

export const DownloadIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 4v12" />
    <path d="M6 12l6 6 6-6" />
    <path d="M5 20h14" />
  </Base>
);

export const UploadIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 20V8" />
    <path d="M6 12l6-6 6 6" />
    <path d="M5 4h14" />
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

export const SaveIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M7 3v6h9V3" />
    <path d="M7 14h10v7H7z" />
  </Base>
);

export const CloseIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </Base>
);

export const ReplaceIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 7h10l-3-3" />
    <path d="M14 7l-3 3" />
    <path d="M20 17H10l3 3" />
    <path d="M10 17l3-3" />
  </Base>
);

export const OpenIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M14 4h6v6" />
    <path d="M20 4L10 14" />
    <path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
  </Base>
);
