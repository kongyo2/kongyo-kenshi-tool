export const normaliseSearchTarget = (value: string) => value.toLocaleLowerCase("ja");

export const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.length > 0) {
    // ipcRenderer.invoke の失敗は "Error invoking remote method '...': Error: 本文" になる
    return error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
  }

  return "不明なエラーが発生しました。";
};

export const extractDroppedPaths = (fileList: FileList) => {
  const droppedPaths: string[] = [];
  const resolveFilePath = window.electronApi?.getPathForFile;

  for (const currentFile of Array.from(fileList)) {
    const resolvedPath = resolveFilePath?.(currentFile);
    if (typeof resolvedPath === "string" && resolvedPath.length > 0) {
      droppedPaths.push(resolvedPath);
    }
  }

  return Array.from(new Set(droppedPaths));
};

export const formatNumber = (value: number) => value.toLocaleString("ja-JP");

export const formatByteSize = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

/** 1,234 → "1,234"、12,345 → "1.2万"、1,234,567 → "123万" */
export const formatCompactNumber = (value: number) => {
  if (value < 10_000) {
    return formatNumber(value);
  }
  if (value < 1_000_000) {
    return `${(value / 10_000).toFixed(1)}万`;
  }
  return `${formatNumber(Math.round(value / 10_000))}万`;
};

export const getFileName = (filePath: string) => filePath.split(/[/\\]/).pop() ?? filePath;

export const isSamePath = (left: string, right: string) =>
  left.replace(/[/\\]+$/, "").toLowerCase() === right.replace(/[/\\]+$/, "").toLowerCase();
