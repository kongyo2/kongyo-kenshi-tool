import {
  useCallback,
  useEffect,
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
  OverviewIcon,
} from './components/Icons.tsx';
import { LoaderPanel } from './components/LoaderPanel.tsx';
import { Notice, type NoticeState } from './components/Notice.tsx';
import { Sidebar, type SidebarItem, type ViewId } from './components/Sidebar.tsx';
import { countProjectStats } from './lib/project-stats.ts';
import { extractDroppedPaths, formatNumber, getErrorMessage } from './lib/utils.ts';
import type { ModProject } from './shared/models.ts';
import { InspectorView } from './views/InspectorView.tsx';
import { ModsView } from './views/ModsView.tsx';
import { OverviewView } from './views/OverviewView.tsx';

const App = () => {
  const [project, setProject] = useState<ModProject | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [isExportingMarkdown, setIsExportingMarkdown] = useState(false);
  const [lastExportedPath, setLastExportedPath] = useState<string | null>(null);
  const [referencePaths, setReferencePaths] = useState<string[]>([]);
  const [vanillaDataPath, setVanillaDataPath] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewId>('overview');
  const [, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      const saved = await window.electronApi.getVanillaDataPath();
      setVanillaDataPath(saved);
    })();
  }, []);

  const stats = useMemo(
    () => (project ? countProjectStats(project) : null),
    [project],
  );

  const isBusy = isLoadingProject || isExportingMarkdown;

  const showNotice = useCallback((next: NoticeState) => {
    setNotice(next);
  }, []);

  const loadFromPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) {
        return;
      }

      setIsLoadingProject(true);
      setLastExportedPath(null);
      showNotice({
        kind: 'info',
        message: 'modを解析しています。',
      });

      try {
        const loadedProject = await window.electronApi.loadMods({
          paths,
          referencePaths,
        });
        startTransition(() => {
          setProject(loadedProject);
          setActiveView('overview');
        });
        showNotice({
          kind: 'success',
          message:
            `${formatNumber(loadedProject.mods.length)} mod / ` +
            `${formatNumber(loadedProject.inspectorRecords.length)} レコード / ` +
            `${formatNumber(loadedProject.textRecords.length)} 抽出テキスト` +
            (loadedProject.contextRecords.length > 0
              ? ` / 参照 ${formatNumber(loadedProject.contextRecords.length)} レコード`
              : '') +
            'を読み込みました。',
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
    [referencePaths, showNotice],
  );

  const handlePickModFiles = useCallback(async () => {
    const selectedPaths = await window.electronApi.pickModFiles();
    await loadFromPaths(selectedPaths);
  }, [loadFromPaths]);

  const handlePickModFolders = useCallback(async () => {
    const selectedPaths = await window.electronApi.pickModFolders();
    await loadFromPaths(selectedPaths);
  }, [loadFromPaths]);

  const handlePickReferenceFolders = useCallback(async () => {
    const selectedPaths = await window.electronApi.pickModFolders();
    if (selectedPaths.length === 0) {
      return;
    }

    const additions = selectedPaths.filter(
      (selected) => !referencePaths.includes(selected),
    );
    const duplicateCount = selectedPaths.length - additions.length;

    if (additions.length === 0) {
      showNotice({
        kind: 'info',
        message: `選択した ${formatNumber(selectedPaths.length)} 件はすべて既に参照に含まれています。`,
      });
      return;
    }

    setReferencePaths((prev) => {
      const next = [...prev];
      for (const item of additions) {
        if (!next.includes(item)) {
          next.push(item);
        }
      }
      return next;
    });
    showNotice({
      kind: 'info',
      message:
        duplicateCount === 0
          ? `参照フォルダを ${formatNumber(additions.length)} 件追加しました。次の読み込みから使用します。`
          : `参照フォルダを ${formatNumber(additions.length)} 件追加しました (${formatNumber(duplicateCount)} 件は重複のため除外)。次の読み込みから使用します。`,
    });
  }, [referencePaths, showNotice]);

  const handleClearReferencePaths = useCallback(() => {
    setReferencePaths([]);
    showNotice({
      kind: 'info',
      message: '参照フォルダ設定を解除しました。',
    });
  }, [showNotice]);

  const handleApplyVanillaReference = useCallback(async () => {
    let targetPath = vanillaDataPath;
    if (!targetPath) {
      targetPath = await window.electronApi.pickAndSaveVanillaDataPath();
      if (!targetPath) {
        return;
      }
      setVanillaDataPath(targetPath);
    }

    const resolved = targetPath;
    if (referencePaths.includes(resolved)) {
      showNotice({
        kind: 'info',
        message: `バニラは既に参照に含まれています: ${resolved}`,
      });
      return;
    }

    setReferencePaths((prev) =>
      prev.includes(resolved) ? prev : [...prev, resolved],
    );
    showNotice({
      kind: 'success',
      message: `バニラを参照に追加しました。次の読み込みから使用します: ${resolved}`,
    });
  }, [referencePaths, vanillaDataPath, showNotice]);

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

  const handleExportMarkdown = useCallback(async () => {
    if (!project) {
      return;
    }

    setIsExportingMarkdown(true);
    showNotice({
      kind: 'info',
      message: 'Markdownを書き出しています。',
    });

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

      setLastExportedPath(result.filePath);
      showNotice({
        kind: 'success',
        message: `modデータをMarkdownで保存しました: ${result.filePath}`,
      });
    } catch (error) {
      showNotice({
        kind: 'error',
        message: `Markdown書き出しに失敗しました: ${getErrorMessage(error)}`,
      });
    } finally {
      setIsExportingMarkdown(false);
    }
  }, [project, showNotice]);

  const handleRevealFile = useCallback(async (filePath: string) => {
    await window.electronApi.revealFileInFolder(filePath);
  }, []);

  const handleCloseProject = useCallback(() => {
    setProject(null);
    setLastExportedPath(null);
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
        label: 'Markdown',
      },
      {
        badge: project ? formatNumber(project.inspectorRecords.length) : undefined,
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
  }, [project]);

  const renderActiveView = () => {
    if (!project || !stats) {
      return (
        <div className="view-empty">
          <header className="view-header">
            <div>
              <p className="eyebrow">ようこそ</p>
              <h1 className="view-title">Kenshi mod Markdown exporter</h1>
              <p className="view-subtitle">
                `.mod` を解析して、LLM に読ませやすい Markdown を生成するデスクトップアプリです。
              </p>
            </div>
          </header>
          <LoaderPanel
            hasSavedVanillaPath={vanillaDataPath !== null}
            isBusy={isBusy}
            isDragging={isDragging}
            onApplyVanillaReference={() => {
              void handleApplyVanillaReference();
            }}
            onDrop={handleDrop}
            onPickFiles={() => {
              void handlePickModFiles();
            }}
            onPickFolders={() => {
              void handlePickModFolders();
            }}
            onPickReferenceFolders={() => {
              void handlePickReferenceFolders();
            }}
            referencePathCount={referencePaths.length}
            setDragging={setIsDragging}
            vanillaDataPath={vanillaDataPath}
          />
        </div>
      );
    }

    switch (activeView) {
      case 'overview':
        return (
          <OverviewView
            onExportMarkdown={() => {
              void handleExportMarkdown();
            }}
            onJumpToInspector={() => setActiveView('inspector')}
            onJumpToMods={() => setActiveView('mods')}
            project={project}
            stats={stats}
          />
        );
      case 'inspector':
        return (
          <InspectorView
            contextRecords={project.contextRecords}
            records={project.inspectorRecords}
          />
        );
      case 'mods':
        return <ModsView mods={project.mods} onRevealFile={handleRevealFile} />;
      default:
        return null;
    }
  };

  return (
    <div className="app-shell">
      <Sidebar
        activeId={activeView}
        items={sidebarItems}
        onSelect={(view) => {
          setActiveView(view);
        }}
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
                  <span className="topbar-chip">
                    {formatNumber(project.textRecords.length)} text
                  </span>
                  <span className="topbar-chip">
                    {formatNumber(project.inspectorRecords.length)} records
                  </span>
                  {project.contextRecords.length > 0 ? (
                    <span className="topbar-chip">
                      参照 {formatNumber(project.contextRecords.length)}
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
                modを読み込むと Markdown 書き出しとインスペクタが有効になります。
              </span>
            )}
          </div>
          <div className="topbar-actions">
            <button
              className="ghost-button"
              disabled={isBusy}
              onClick={() => {
                void handlePickReferenceFolders();
              }}
              type="button"
            >
              <FolderIcon height="14" width="14" />
              参照フォルダ
            </button>
            <button
              className="ghost-button"
              disabled={isBusy}
              onClick={() => {
                void handleApplyVanillaReference();
              }}
              title={
                vanillaDataPath
                  ? `バニラ data フォルダ: ${vanillaDataPath}`
                  : '初回はバニラ data フォルダを選択します'
              }
              type="button"
            >
              <FolderIcon height="14" width="14" />
              {vanillaDataPath ? 'バニラ参照' : 'バニラを設定'}
            </button>
            {referencePaths.length > 0 ? (
              <button
                className="ghost-button"
                disabled={isBusy}
                onClick={handleClearReferencePaths}
                type="button"
              >
                <CloseIcon height="14" width="14" />
                参照解除
              </button>
            ) : null}
            <button
              className="ghost-button"
              disabled={isBusy}
              onClick={() => {
                void handlePickModFiles();
              }}
              type="button"
            >
              <FileIcon height="14" width="14" />
              modを開く
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
              フォルダを開く
            </button>
            <button
              className="accent-button"
              disabled={!project || isBusy}
              onClick={() => {
                void handleExportMarkdown();
              }}
              type="button"
            >
              <DownloadIcon height="14" width="14" />
              {isExportingMarkdown ? '書き出し中…' : 'Markdown書き出し'}
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

        {lastExportedPath ? (
          <div className="topbar-saved">
            <span className="topbar-saved-label">直近の出力先</span>
            <span className="topbar-saved-path">{lastExportedPath}</span>
            <button
              className="ghost-button"
              onClick={() => {
                void window.electronApi.revealFileInFolder(lastExportedPath);
              }}
              type="button"
            >
              フォルダを開く
            </button>
          </div>
        ) : null}

        <main className="content-area">{renderActiveView()}</main>
      </div>
    </div>
  );
};

export default App;
