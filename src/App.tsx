import {
  type DragEventHandler,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import cx from 'clsx';
import type {
  ExportOptions,
  TranslationProject,
  TranslationRecord,
} from './shared/models.ts';

type NoticeKind = 'error' | 'info' | 'success';
type SectionFilter = 'all' | 'description' | 'dialog' | 'name';

interface NoticeState {
  kind: NoticeKind;
  message: string;
}

interface EditorRow {
  id: string;
  itemIndex: number;
  original: string;
  recordIndex: number;
  section: Exclude<SectionFilter, 'all'>;
  stringId: string;
  subtitle: string;
  textId: string;
  title: string;
  translation: string;
  type: number;
  wordswapCount: number;
}

interface ProjectStats {
  descriptionCount: number;
  dialogCount: number;
  nameCount: number;
  recordCount: number;
  translatedCount: number;
  totalCount: number;
}

const initialExportOptions: ExportOptions = {
  includeDescriptions: true,
  includeDialogs: true,
  includeNames: false,
};

const sectionLabels: Record<SectionFilter, string> = {
  all: 'すべて',
  description: '説明文',
  dialog: 'ダイアログ',
  name: '名称',
};

const noticeClassNames: Record<NoticeKind, string> = {
  error: 'notice-error',
  info: 'notice-info',
  success: 'notice-success',
};

const replaceAt = <T,>(items: T[], index: number, value: T) =>
  items.map((item, currentIndex) =>
    currentIndex === index ? value : item,
  );

const normaliseSearchTarget = (value: string) =>
  value.toLocaleLowerCase('ja');

const countProjectStats = (project: TranslationProject): ProjectStats => {
  let dialogCount = 0;
  let nameCount = 0;
  let descriptionCount = 0;
  let translatedCount = 0;

  for (const record of project.records) {
    if (record.kind === 'dialog') {
      dialogCount += record.texts.length;
      translatedCount += record.texts.filter(
        (text) => text.translation.length > 0,
      ).length;
      continue;
    }

    nameCount += 1;
    if (record.nameTranslation.length > 0) {
      translatedCount += 1;
    }

    if (record.description.length > 0) {
      descriptionCount += 1;
      if (record.descriptionTranslation.length > 0) {
        translatedCount += 1;
      }
    }
  }

  return {
    descriptionCount,
    dialogCount,
    nameCount,
    recordCount: project.records.length,
    totalCount: dialogCount + nameCount + descriptionCount,
    translatedCount,
  };
};

const buildEditorRows = (
  project: TranslationProject,
  sectionFilter: SectionFilter,
  searchText: string,
) => {
  const searchToken = normaliseSearchTarget(searchText.trim());
  const rows: EditorRow[] = [];

  project.records.forEach((record, recordIndex) => {
    if (record.kind === 'dialog') {
      record.texts.forEach((text, textIndex) => {
        if (sectionFilter !== 'all' && sectionFilter !== 'dialog') {
          return;
        }

        const row: EditorRow = {
          id: `${record.stringId}:dialog:${text.textId}`,
          itemIndex: textIndex,
          original: text.original,
          recordIndex,
          section: 'dialog',
          stringId: record.stringId,
          subtitle: record.name,
          textId: text.textId,
          title: 'ダイアログ',
          translation: text.translation,
          type: record.type,
          wordswapCount: record.wordswapMap.length,
        };

        if (searchToken.length === 0) {
          rows.push(row);
          return;
        }

        const searchTarget = normaliseSearchTarget(
          [
            row.original,
            row.translation,
            row.stringId,
            row.subtitle,
            row.textId,
          ].join('\n'),
        );

        if (searchTarget.includes(searchToken)) {
          rows.push(row);
        }
      });

      return;
    }

    if (sectionFilter === 'all' || sectionFilter === 'name') {
      const nameRow: EditorRow = {
        id: `${record.stringId}:name`,
        itemIndex: -1,
        original: record.name,
        recordIndex,
        section: 'name',
        stringId: record.stringId,
        subtitle: `type ${record.type}`,
        textId: '',
        title: '名称',
        translation: record.nameTranslation,
        type: record.type,
        wordswapCount: record.wordswapMap.length,
      };

      const searchTarget = normaliseSearchTarget(
        [
          nameRow.original,
          nameRow.translation,
          nameRow.stringId,
          nameRow.subtitle,
        ].join('\n'),
      );

      if (
        searchToken.length === 0 ||
        searchTarget.includes(searchToken)
      ) {
        rows.push(nameRow);
      }
    }

    if (
      record.description.length > 0 &&
      (sectionFilter === 'all' || sectionFilter === 'description')
    ) {
      const descriptionRow: EditorRow = {
        id: `${record.stringId}:description`,
        itemIndex: -1,
        original: record.description,
        recordIndex,
        section: 'description',
        stringId: record.stringId,
        subtitle: record.name,
        textId: '',
        title: '説明文',
        translation: record.descriptionTranslation,
        type: record.type,
        wordswapCount: record.wordswapMap.length,
      };

      const searchTarget = normaliseSearchTarget(
        [
          descriptionRow.original,
          descriptionRow.translation,
          descriptionRow.stringId,
          descriptionRow.subtitle,
        ].join('\n'),
      );

      if (
        searchToken.length === 0 ||
        searchTarget.includes(searchToken)
      ) {
        rows.push(descriptionRow);
      }
    }
  });

  return rows;
};

const extractDroppedPaths = (fileList: FileList) => {
  const droppedPaths: string[] = [];

  for (const currentFile of Array.from(fileList)) {
    const maybePath = (currentFile as File & { path?: string }).path;
    if (typeof maybePath === 'string' && maybePath.length > 0) {
      droppedPaths.push(maybePath);
    }
  }

  return Array.from(new Set(droppedPaths));
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return '不明なエラーが発生しました。';
};

const App = () => {
  const [project, setProject] = useState<TranslationProject | null>(null);
  const [replaceWordSwap, setReplaceWordSwap] = useState(true);
  const [exportOptions, setExportOptions] = useState(initialExportOptions);
  const [searchText, setSearchText] = useState('');
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all');
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement | null>(null);
  const deferredSearchText = useDeferredValue(searchText);

  const stats = useMemo(
    () => (project ? countProjectStats(project) : null),
    [project],
  );
  const editorRows = useMemo(
    () =>
      project
        ? buildEditorRows(project, sectionFilter, deferredSearchText)
        : [],
    [deferredSearchText, project, sectionFilter],
  );

  const virtualizer = useVirtualizer({
    count: editorRows.length,
    estimateSize: () => 320,
    getScrollElement: () => listRef.current,
    overscan: 6,
  });

  const updateDialogTranslation = (
    recordIndex: number,
    textIndex: number,
    value: string,
  ) => {
    setProject((currentProject) => {
      if (!currentProject) {
        return currentProject;
      }

      const currentRecord = currentProject.records[recordIndex];
      if (!currentRecord || currentRecord.kind !== 'dialog') {
        return currentProject;
      }

      const nextTexts = replaceAt(currentRecord.texts, textIndex, {
        ...currentRecord.texts[textIndex],
        translation: value,
      });
      const nextRecord: TranslationRecord = {
        ...currentRecord,
        texts: nextTexts,
      };

      return {
        ...currentProject,
        records: replaceAt(
          currentProject.records,
          recordIndex,
          nextRecord,
        ),
      };
    });
  };

  const updateEntityTranslation = (
    recordIndex: number,
    section: 'description' | 'name',
    value: string,
  ) => {
    setProject((currentProject) => {
      if (!currentProject) {
        return currentProject;
      }

      const currentRecord = currentProject.records[recordIndex];
      if (!currentRecord || currentRecord.kind !== 'entity') {
        return currentProject;
      }

      const nextRecord: TranslationRecord =
        section === 'name'
          ? {
              ...currentRecord,
              nameTranslation: value,
            }
          : {
              ...currentRecord,
              descriptionTranslation: value,
            };

      return {
        ...currentProject,
        records: replaceAt(
          currentProject.records,
          recordIndex,
          nextRecord,
        ),
      };
    });
  };

  const loadFromPaths = async (paths: string[]) => {
    if (paths.length === 0) {
      return;
    }

    setIsLoadingProject(true);
    setLastSavedPath(null);
    setNotice({
      kind: 'info',
      message: 'modを読み込んでいます。',
    });

    try {
      const loadedProject = await window.electronApi.loadMods({
        paths,
        replaceWordSwap,
      });
      startTransition(() => {
        setProject(loadedProject);
        setSearchText('');
        setSectionFilter('all');
      });
      setNotice({
        kind: 'success',
        message: `${loadedProject.records.length}件のレコードを読み込みました。`,
      });
    } catch (error) {
      setNotice({
        kind: 'error',
        message: getErrorMessage(error),
      });
    } finally {
      setIsLoadingProject(false);
    }
  };

  const handlePickModFiles = async () => {
    const selectedPaths = await window.electronApi.pickModFiles();
    await loadFromPaths(selectedPaths);
  };

  const handlePickModFolders = async () => {
    const selectedPaths = await window.electronApi.pickModFolders();
    await loadFromPaths(selectedPaths);
  };

  const handleSave = async () => {
    if (!project) {
      return;
    }

    setIsSaving(true);
    setNotice({
      kind: 'info',
      message: '翻訳modを書き出しています。',
    });

    try {
      const result = await window.electronApi.saveTranslationMod({
        exportOptions,
        project,
      });

      if (result.canceled) {
        setNotice({
          kind: 'info',
          message: '保存をキャンセルしました。',
        });
        return;
      }

      setLastSavedPath(result.filePath);
      setNotice({
        kind: 'success',
        message: '翻訳modを保存しました。',
      });
    } catch (error) {
      setNotice({
        kind: 'error',
        message: getErrorMessage(error),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDrop: DragEventHandler<HTMLDivElement> = async (
    event,
  ) => {
    event.preventDefault();
    setIsDragging(false);
    const droppedPaths = extractDroppedPaths(event.dataTransfer.files);

    if (droppedPaths.length === 0) {
      setNotice({
        kind: 'error',
        message:
          'ドラッグ&ドロップからファイルパスを取得できませんでした。選択ボタンを使ってください。',
      });
      return;
    }

    await loadFromPaths(droppedPaths);
  };

  const hasEditableContent =
    stats !== null && stats.translatedCount > 0;

  return (
    <div className="app-shell">
      <header className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Windows専用 / 手動翻訳専用</p>
          <h1>Kenshi翻訳ヘルパー</h1>
          <p className="hero-text">
            参考元の挙動を踏まえつつ、CSV とブラウザ機械翻訳依存を削り、
            mod を直接読み込んで翻訳用 .mod を書き出すデスクトップアプリへ移植しました。
          </p>
        </div>
        <div className="hero-meta">
          <div className="meta-card">
            <span className="meta-label">読み込み</span>
            <strong>{stats?.recordCount ?? 0} レコード</strong>
          </div>
          <div className="meta-card">
            <span className="meta-label">編集対象</span>
            <strong>{stats?.totalCount ?? 0} 項目</strong>
          </div>
          <div className="meta-card">
            <span className="meta-label">翻訳入力済み</span>
            <strong>{stats?.translatedCount ?? 0} 項目</strong>
          </div>
        </div>
      </header>

      <main className="content-grid">
        <section className="panel stack-panel">
          <div
            className={cx('dropzone', {
              'is-dragging': isDragging,
              'is-loading': isLoadingProject || isPending,
            })}
            onDragEnter={() => setIsDragging(true)}
            onDragLeave={() => setIsDragging(false)}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={handleDrop}
          >
            <p className="dropzone-title">Drop mod files here</p>
            <p className="dropzone-text">
              .mod ファイルのドラッグ&ドロップに対応しています。
              フォルダ読み込みは下のボタンから選択してください。
            </p>
          </div>

          <div className="action-row">
            <button
              className="primary-button"
              disabled={isLoadingProject || isSaving}
              onClick={() => {
                void handlePickModFiles();
              }}
              type="button"
            >
              modファイルを選択
            </button>
            <button
              className="secondary-button"
              disabled={isLoadingProject || isSaving}
              onClick={() => {
                void handlePickModFolders();
              }}
              type="button"
            >
              フォルダを選択
            </button>
            <button
              className="accent-button"
              disabled={
                !project ||
                !hasEditableContent ||
                isLoadingProject ||
                isSaving
              }
              onClick={() => {
                void handleSave();
              }}
              type="button"
            >
              {isSaving ? '保存中...' : '翻訳modを保存'}
            </button>
          </div>

          <label className="toggle-line">
            <input
              checked={replaceWordSwap}
              onChange={(event) => {
                setReplaceWordSwap(event.target.checked);
              }}
              type="checkbox"
            />
            WordSwap を記号へ置換して読み込む
          </label>
          <p className="subtle-text">
            参考元と同じく、この設定は読み込み時のみ反映されます。
          </p>

          {notice ? (
            <div className={cx('notice', noticeClassNames[notice.kind])}>
              {notice.message}
            </div>
          ) : null}

          {lastSavedPath ? (
            <div className="saved-box">
              <p className="saved-label">直近の保存先</p>
              <p className="saved-path">{lastSavedPath}</p>
              <button
                className="secondary-button"
                onClick={() => {
                  void window.electronApi.revealFileInFolder(lastSavedPath);
                }}
                type="button"
              >
                保存先を開く
              </button>
            </div>
          ) : null}
        </section>

        <section className="panel info-panel">
          <h2>出力設定</h2>
          <label className="toggle-line">
            <input
              checked={exportOptions.includeDialogs}
              onChange={(event) => {
                setExportOptions((currentOptions) => ({
                  ...currentOptions,
                  includeDialogs: event.target.checked,
                }));
              }}
              type="checkbox"
            />
            ダイアログの翻訳を出力する
          </label>
          <label className="toggle-line">
            <input
              checked={exportOptions.includeDescriptions}
              onChange={(event) => {
                setExportOptions((currentOptions) => ({
                  ...currentOptions,
                  includeDescriptions: event.target.checked,
                }));
              }}
              type="checkbox"
            />
            説明文の翻訳を出力する
          </label>
          <label className="toggle-line">
            <input
              checked={exportOptions.includeNames}
              onChange={(event) => {
                setExportOptions((currentOptions) => ({
                  ...currentOptions,
                  includeNames: event.target.checked,
                }));
              }}
              type="checkbox"
            />
            名称の翻訳を出力する
          </label>
          <p className="warning-text">
            名称翻訳は重複や文脈崩れを起こしやすいため、機械的に埋めず手動調整前提で使ってください。
          </p>

          <h2>読み込み中のmod</h2>
          {project ? (
            <div className="tag-list">
              {project.dependencies.map((dependency) => (
                <span
                  className="tag"
                  key={dependency}
                >
                  {dependency}.mod
                </span>
              ))}
            </div>
          ) : (
            <p className="subtle-text">
              まだ mod は読み込まれていません。
            </p>
          )}

          <h2>内訳</h2>
          <div className="metric-grid">
            <div className="metric-card">
              <span>ダイアログ</span>
              <strong>{stats?.dialogCount ?? 0}</strong>
            </div>
            <div className="metric-card">
              <span>名称</span>
              <strong>{stats?.nameCount ?? 0}</strong>
            </div>
            <div className="metric-card">
              <span>説明文</span>
              <strong>{stats?.descriptionCount ?? 0}</strong>
            </div>
          </div>
        </section>

        <section className="panel editor-panel">
          <div className="editor-toolbar">
            <input
              className="search-input"
              onChange={(event) => {
                setSearchText(event.target.value);
              }}
              placeholder="stringID / 原文 / 翻訳 / textID を検索"
              type="search"
              value={searchText}
            />
            <div className="segment-row">
              {(Object.keys(sectionLabels) as SectionFilter[]).map(
                (section) => (
                  <button
                    className={cx('segment-button', {
                      'is-active': sectionFilter === section,
                    })}
                    key={section}
                    onClick={() => {
                      setSectionFilter(section);
                    }}
                    type="button"
                  >
                    {sectionLabels[section]}
                  </button>
                ),
              )}
            </div>
          </div>

          {project ? (
            editorRows.length > 0 ? (
              <div
                className="editor-list"
                ref={listRef}
              >
                <div
                  className="editor-list-inner"
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                  }}
                >
                  {virtualizer.getVirtualItems().map((virtualItem) => {
                    const row = editorRows[virtualItem.index];
                    return (
                      <article
                        className={cx(
                          'entry-card',
                          `entry-${row.section}`,
                        )}
                        key={row.id}
                        style={{
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                      >
                        <div className="entry-meta">
                          <span className="entry-chip">
                            {sectionLabels[row.section]}
                          </span>
                          <span className="entry-token">
                            type {row.type}
                          </span>
                          <span className="entry-token">{row.stringId}</span>
                          {row.textId.length > 0 ? (
                            <span className="entry-token">
                              {row.textId}
                            </span>
                          ) : null}
                          {row.wordswapCount > 0 ? (
                            <span className="entry-token">
                              WordSwap {row.wordswapCount}
                            </span>
                          ) : null}
                        </div>
                        <h3>{row.title}</h3>
                        <p className="entry-subtitle">{row.subtitle}</p>
                        <div className="editor-columns">
                          <label className="editor-pane">
                            <span>原文</span>
                            <textarea
                              readOnly
                              spellCheck={false}
                              value={row.original}
                            />
                          </label>
                          <label className="editor-pane">
                            <span>翻訳</span>
                            <textarea
                              onChange={(event) => {
                                if (row.section === 'dialog') {
                                  updateDialogTranslation(
                                    row.recordIndex,
                                    row.itemIndex,
                                    event.target.value,
                                  );
                                  return;
                                }

                                updateEntityTranslation(
                                  row.recordIndex,
                                  row.section,
                                  event.target.value,
                                );
                              }}
                              placeholder="ここに手動翻訳を入力"
                              spellCheck={false}
                              value={row.translation}
                            />
                          </label>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                条件に一致する項目がありません。
              </div>
            )
          ) : (
            <div className="empty-state">
              mod を読み込むと、ここに手動翻訳用エディタが表示されます。
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default App;
