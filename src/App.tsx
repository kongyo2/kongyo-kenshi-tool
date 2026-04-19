import {
  useCallback,
  useMemo,
  useState,
  useTransition,
  type DragEventHandler,
} from 'react';
import {
  CloseIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  InspectorIcon,
  ModsIcon,
  OpenIcon,
  OverviewIcon,
  SaveIcon,
  TranslateIcon,
  UploadIcon,
} from './components/Icons.tsx';
import { LoaderPanel } from './components/LoaderPanel.tsx';
import { Notice, type NoticeState } from './components/Notice.tsx';
import { Sidebar, type SidebarItem, type ViewId } from './components/Sidebar.tsx';
import { countProjectStats } from './lib/project-stats.ts';
import {
  extractDroppedPaths,
  formatNumber,
  formatPercentage,
  getErrorMessage,
} from './lib/utils.ts';
import { translationProjectSchema } from './shared/models.ts';
import type {
  DialogRecord,
  EntityRecord,
  TranslationProject,
  TranslationRecord,
} from './shared/models.ts';
import { InspectorView } from './views/InspectorView.tsx';
import { ModsView } from './views/ModsView.tsx';
import { OverviewView } from './views/OverviewView.tsx';
import { TranslationView } from './views/TranslationView.tsx';

const replaceAt = <T,>(items: T[], index: number, value: T) =>
  items.map((item, currentIndex) =>
    currentIndex === index ? value : item,
  );

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const App = () => {
  const [project, setProject] = useState<TranslationProject | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewId>('overview');
  const [, startTransition] = useTransition();

  const stats = useMemo(
    () => (project ? countProjectStats(project) : null),
    [project],
  );

  const isBusy = isLoadingProject || isSaving;

  const showNotice = useCallback((next: NoticeState) => {
    setNotice(next);
  }, []);

  const loadFromPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) {
        return;
      }

      setIsLoadingProject(true);
      setLastSavedPath(null);
      showNotice({
        kind: 'info',
        message: 'modを読み込んでいます。',
      });

      try {
        const loadedProject = await window.electronApi.loadMods({
          paths,
        });
        startTransition(() => {
          setProject(loadedProject);
          setActiveView('overview');
        });
        showNotice({
          kind: 'success',
          message: `${formatNumber(loadedProject.records.length)}件の翻訳対象レコードを読み込みました。`,
        });
      } catch (error) {
        showNotice({
          kind: 'error',
          message: getErrorMessage(error),
        });
      } finally {
        setIsLoadingProject(false);
      }
    },
    [showNotice],
  );

  const handlePickModFiles = useCallback(async () => {
    const selectedPaths = await window.electronApi.pickModFiles();
    await loadFromPaths(selectedPaths);
  }, [loadFromPaths]);

  const handlePickModFolders = useCallback(async () => {
    const selectedPaths = await window.electronApi.pickModFolders();
    await loadFromPaths(selectedPaths);
  }, [loadFromPaths]);

  const handleDrop = useCallback<DragEventHandler<HTMLDivElement>>(
    async (event) => {
      event.preventDefault();
      setIsDragging(false);
      const droppedPaths = extractDroppedPaths(event.dataTransfer.files);

      if (droppedPaths.length === 0) {
        showNotice({
          kind: 'error',
          message:
            'ドラッグ&ドロップからファイルパスを取得できませんでした。選択ボタンを使ってください。',
        });
        return;
      }

      await loadFromPaths(droppedPaths);
    },
    [loadFromPaths, showNotice],
  );

  const handleSave = useCallback(async () => {
    if (!project) {
      return;
    }

    setIsSaving(true);
    showNotice({
      kind: 'info',
      message: '翻訳modを書き出しています。',
    });

    try {
      const result = await window.electronApi.saveTranslationMod({
        project,
      });

      if (result.canceled) {
        showNotice({
          kind: 'info',
          message: '保存をキャンセルしました。',
        });
        return;
      }

      setLastSavedPath(result.filePath);
      showNotice({
        kind: 'success',
        message: '翻訳modを保存しました。',
      });
    } catch (error) {
      showNotice({
        kind: 'error',
        message: getErrorMessage(error),
      });
    } finally {
      setIsSaving(false);
    }
  }, [project, showNotice]);

  const handleExportMarkdown = useCallback(async () => {
    if (!project) {
      return;
    }

    try {
      const result = await window.electronApi.exportModMarkdown({
        project,
      });

      if (result.canceled) {
        showNotice({
          kind: 'info',
          message: 'Markdown書き出しをキャンセルしました。',
        });
        return;
      }

      showNotice({
        kind: 'success',
        message: `modデータをMarkdownで保存しました: ${result.filePath}`,
      });
    } catch (error) {
      showNotice({
        kind: 'error',
        message: `Markdown書き出しに失敗しました: ${getErrorMessage(error)}`,
      });
    }
  }, [project, showNotice]);

  const handleExportJson = useCallback(async () => {
    if (!project) {
      return;
    }

    try {
      const payload = JSON.stringify(project, null, 2);
      const result = await window.electronApi.exportTranslationJson({
        fileName: `${project.sourceModName}_translation.json`,
        payload,
      });

      if (result.canceled) {
        showNotice({
          kind: 'info',
          message: 'プロジェクトのエクスポートをキャンセルしました。',
        });
        return;
      }

      showNotice({
        kind: 'success',
        message: `翻訳プロジェクトを保存しました: ${result.filePath}`,
      });
    } catch (error) {
      showNotice({
        kind: 'error',
        message: getErrorMessage(error),
      });
    }
  }, [project, showNotice]);

  const handleImportJson = useCallback(async () => {
    try {
      const result = await window.electronApi.importTranslationJson();

      if (result.canceled || !result.payload) {
        showNotice({
          kind: 'info',
          message: 'インポートをキャンセルしました。',
        });
        return;
      }

      const parsedProject = translationProjectSchema.parse(
        JSON.parse(result.payload),
      );
      startTransition(() => {
        setProject(parsedProject);
        setActiveView('overview');
      });
      showNotice({
        kind: 'success',
        message: `翻訳プロジェクトを復元しました。(${formatNumber(parsedProject.records.length)}レコード)`,
      });
    } catch (error) {
      showNotice({
        kind: 'error',
        message: `プロジェクトの読み込みに失敗しました: ${getErrorMessage(error)}`,
      });
    }
  }, [showNotice]);

  const updateDialogTranslation = useCallback(
    (recordIndex: number, textIndex: number, value: string) => {
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
    },
    [],
  );

  const updateEntityTranslation = useCallback(
    (
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
    },
    [],
  );

  const replaceAllInProject = useCallback(
    (
      pattern: string,
      replacement: string,
      options: { caseSensitive: boolean; regex: boolean },
    ): number => {
      if (!project) {
        return 0;
      }

      const flags = options.caseSensitive ? 'g' : 'gi';
      const source = options.regex ? pattern : escapeRegExp(pattern);
      const matcher = new RegExp(source, flags);
      let replaced = 0;

      const nextRecords = project.records.map(
        (record): TranslationRecord => {
          if (record.kind === 'dialog') {
            const nextTexts = record.texts.map((text) => {
              if (text.translation.length === 0) {
                return text;
              }

              matcher.lastIndex = 0;
              const nextValue = text.translation.replace(
                matcher,
                (match) => {
                  replaced += 1;
                  return replacement.replace(/\$/g, () => match);
                },
              );

              return nextValue === text.translation
                ? text
                : { ...text, translation: nextValue };
            });

            const nextDialog: DialogRecord = { ...record, texts: nextTexts };
            return nextDialog;
          }

          matcher.lastIndex = 0;
          let nameTranslation = record.nameTranslation;
          if (nameTranslation.length > 0) {
            const nextName = nameTranslation.replace(matcher, (match) => {
              replaced += 1;
              return replacement.replace(/\$/g, () => match);
            });
            nameTranslation = nextName;
          }

          matcher.lastIndex = 0;
          let descriptionTranslation = record.descriptionTranslation;
          if (descriptionTranslation.length > 0) {
            const nextDesc = descriptionTranslation.replace(
              matcher,
              (match) => {
                replaced += 1;
                return replacement.replace(/\$/g, () => match);
              },
            );
            descriptionTranslation = nextDesc;
          }

          if (
            nameTranslation === record.nameTranslation &&
            descriptionTranslation === record.descriptionTranslation
          ) {
            return record;
          }

          const nextEntity: EntityRecord = {
            ...record,
            descriptionTranslation,
            nameTranslation,
          };
          return nextEntity;
        },
      );

      if (replaced > 0) {
        setProject({ ...project, records: nextRecords });
      }

      return replaced;
    },
    [project],
  );

  const handleRevealFile = useCallback(async (filePath: string) => {
    await window.electronApi.revealFileInFolder(filePath);
  }, []);

  const handleCloseProject = useCallback(() => {
    setProject(null);
    setLastSavedPath(null);
    setActiveView('overview');
    showNotice({
      kind: 'info',
      message: 'プロジェクトを閉じました。',
    });
  }, [showNotice]);

  const sidebarItems = useMemo<readonly SidebarItem[]>(() => {
    const baseItems: SidebarItem[] = [
      {
        icon: <OverviewIcon />,
        id: 'overview',
        label: '概要',
      },
      {
        badge:
          stats && stats.totalCount > 0
            ? formatPercentage(stats.translatedCount, stats.totalCount)
            : undefined,
        disabled: !project,
        icon: <TranslateIcon />,
        id: 'translate',
        label: '翻訳エディタ',
      },
      {
        badge: project
          ? formatNumber(project.inspectorRecords.length)
          : undefined,
        disabled: !project,
        icon: <InspectorIcon />,
        id: 'inspector',
        label: 'インスペクタ',
      },
      {
        badge: project ? formatNumber(project.mods.length) : undefined,
        disabled: !project,
        icon: <ModsIcon />,
        id: 'mods',
        label: 'mod情報',
      },
    ];

    return baseItems;
  }, [project, stats]);

  const handleSelectView = useCallback((view: ViewId) => {
    setActiveView(view);
  }, []);

  const renderActiveView = () => {
    if (!project || !stats) {
      return (
        <div className="view-empty">
          <header className="view-header">
            <div>
              <p className="eyebrow">ようこそ</p>
              <h1 className="view-title">Kenshi多機能modツール</h1>
              <p className="view-subtitle">
                翻訳・インスペクト・メタ情報確認を一体化したデスクトップアプリ。
              </p>
            </div>
          </header>
          <LoaderPanel
            isBusy={isBusy}
            isDragging={isDragging}
            onDrop={handleDrop}
            onImportJson={handleImportJson}
            onPickFiles={() => {
              void handlePickModFiles();
            }}
            onPickFolders={() => {
              void handlePickModFolders();
            }}
            setDragging={setIsDragging}
          />
        </div>
      );
    }

    switch (activeView) {
      case 'overview':
        return (
          <OverviewView
            onJumpToEditor={() => setActiveView('translate')}
            onJumpToInspector={() => setActiveView('inspector')}
            onJumpToMods={() => setActiveView('mods')}
            project={project}
            stats={stats}
          />
        );
      case 'translate':
        return (
          <TranslationView
            onDialogChange={updateDialogTranslation}
            onEntityChange={updateEntityTranslation}
            onReplaceAll={replaceAllInProject}
            project={project}
          />
        );
      case 'inspector':
        return <InspectorView records={project.inspectorRecords} />;
      case 'mods':
        return (
          <ModsView mods={project.mods} onRevealFile={handleRevealFile} />
        );
      default:
        return null;
    }
  };

  return (
    <div className="app-shell">
      <Sidebar
        activeId={activeView}
        items={sidebarItems}
        onSelect={handleSelectView}
      />
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-info">
            {project ? (
              <>
                <span className="topbar-project">
                  <strong>{project.sourceModName}</strong>
                  <span className="topbar-chip">
                    {formatNumber(project.mods.length)} mod
                  </span>
                  {stats ? (
                    <span className="topbar-chip">
                      {formatPercentage(stats.translatedCount, stats.totalCount)}
                      進捗
                    </span>
                  ) : null}
                </span>
                <button
                  className="ghost-button"
                  onClick={handleCloseProject}
                  type="button"
                >
                  <CloseIcon height="14" width="14" />
                  閉じる
                </button>
              </>
            ) : (
              <span className="topbar-hint">
                modを読み込むとメニューが有効になります。
              </span>
            )}
          </div>
          <div className="topbar-actions">
            <button
              className="ghost-button"
              disabled={isBusy}
              onClick={() => {
                void handlePickModFiles();
              }}
              type="button"
            >
              <FileIcon height="14" width="14" />
              modを追加
            </button>
            <button
              className="ghost-button"
              disabled={isBusy}
              onClick={() => {
                void handlePickModFolders();
              }}
              type="button"
            >
              <FolderIcon height="14" width="14" />
              フォルダ追加
            </button>
            <button
              className="ghost-button"
              disabled={isBusy}
              onClick={() => {
                void handleImportJson();
              }}
              type="button"
            >
              <UploadIcon height="14" width="14" />
              プロジェクト読込
            </button>
            <button
              className="ghost-button"
              disabled={!project || isBusy}
              onClick={() => {
                void handleExportJson();
              }}
              type="button"
            >
              <DownloadIcon height="14" width="14" />
              プロジェクト保存
            </button>
            <button
              className="ghost-button"
              disabled={!project || isBusy}
              onClick={() => {
                void handleExportMarkdown();
              }}
              type="button"
            >
              <DownloadIcon height="14" width="14" />
              Markdown書き出し
            </button>
            <button
              className="accent-button"
              disabled={!project || isBusy}
              onClick={() => {
                void handleSave();
              }}
              type="button"
            >
              <SaveIcon height="14" width="14" />
              {isSaving ? '保存中…' : '翻訳modを書き出し'}
            </button>
          </div>
        </header>

        {notice ? (
          <div className="topbar-notice">
            <Notice
              notice={notice}
              onDismiss={() => {
                setNotice(null);
              }}
            />
          </div>
        ) : null}

        {lastSavedPath ? (
          <div className="topbar-saved">
            <span className="topbar-saved-label">直近の保存先</span>
            <span className="topbar-saved-path">{lastSavedPath}</span>
            <button
              className="ghost-button"
              onClick={() => {
                void window.electronApi.revealFileInFolder(lastSavedPath);
              }}
              type="button"
            >
              <OpenIcon height="14" width="14" />
              フォルダを開く
            </button>
          </div>
        ) : null}

        <main className="app-content">{renderActiveView()}</main>
      </div>
    </div>
  );
};

export default App;
