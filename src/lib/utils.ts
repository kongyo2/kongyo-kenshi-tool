export const replaceAt = <T>(items: T[], index: number, value: T) =>
  items.map((item, currentIndex) =>
    currentIndex === index ? value : item,
  );

export const normaliseSearchTarget = (value: string) =>
  value.toLocaleLowerCase('ja');

export const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return '不明なエラーが発生しました。';
};

export const extractDroppedPaths = (fileList: FileList) => {
  const droppedPaths: string[] = [];

  for (const currentFile of Array.from(fileList)) {
    const maybePath = (currentFile as File & { path?: string }).path;
    if (typeof maybePath === 'string' && maybePath.length > 0) {
      droppedPaths.push(maybePath);
    }
  }

  return Array.from(new Set(droppedPaths));
};

export const formatNumber = (value: number) =>
  value.toLocaleString('ja-JP');

export const formatPercentage = (numerator: number, denominator: number) => {
  if (denominator <= 0) {
    return '0%';
  }

  return `${Math.round((numerator / denominator) * 100)}%`;
};
