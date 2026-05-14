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
import {
  extractDroppedPaths,
  formatByteSize,
  formatNumber,
  getErrorMessage,
} from './lib/utils.ts';
import type { LoadProgress } from './shared/ipc.ts';
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
  const [loadProgress, setLoadProgress] = useState<LoadProgress | null>(null);
  const [, startTransition] = useTransition();

  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const saved = await window.electronApi.getAppSettings();
      setVanillaDataPath(saved.vanillaDataPath);
      setReferencePaths(saved.referencePaths);
      setSettingsLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }
    void window.electronApi.saveReferencePaths(referencePaths);
  }, [referencePaths, settingsLoaded]);

  useEffect(() => {
    const unsubscribe = window.electronApi.onLoadProgress((progress) => {
      setLoadProgress(progress);
    });
    return unsubscribe;
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
      setLoadProgress(null);
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
        const emptyTargetMods = loadedProject.mods.filter(
          (mod) => mod.role === 'target' && mod.recordCount === 0,
        );
        const summary =
          `${formatNumber(loadedProject.mods.length)} mod / ` +
          `${formatNumber(loadedProject.inspectorRecords.length)} レコード / ` +
          `${formatNumber(loadedProject.textRecords.length)} 抽出テキスト` +
          (loadedProject.contextRecords.length > 0
            ? ` / 参照 ${formatNumber(loadedProject.contextRecords.length)} レコード`
            : '') +
          'を読み込みました。';

        const warnings: string[] = [];
        if (emptyTargetMods.length > 0) {
          const sampleNames = emptyTargetMods
            .slice(0, 3)
            .map((mod) => mod.fileName)
            .join(', ');
          const more =
            emptyTargetMods.length > 3
              ? ` 他 ${formatNumber(emptyTargetMods.length - 3)} 件`
              : '';
          warnings.push(
            `レコード 0 件の mod が ${formatNumber(emptyTargetMods.length)} 件: ${sampleNames}${more}`,
          );
        }
        if (loadedProject.missingReferencePaths.length > 0) {
          const samplePaths = loadedProject.missingReferencePaths
            .slice(0, 2)
            .join(', ');
          const more =
            loadedProject.missingReferencePaths.length > 2
              ? ` 他 ${formatNumber(loadedProject.missingReferencePaths.length - 2)} 件`
              : '';
          warnings.push(
            `読み込めなかった参照パスが ${formatNumber(loadedProject.missingReferencePaths.length)} 件: ${samplePaths}${more}`,
          );
          const missingSet = new Set(loadedProject.missingReferencePaths);
          setReferencePaths((prev) =>
            prev.filter((item) => !missingSet.has(item)),
          );
        }
        if (warnings.length > 0) {
          showNotice({
            kind: 'warning',
            message: `${summary} なお、${warnings.join(' / ')}。`,
          });
        } else {
          showNotice({
            kind: 'success',
            message: summary,
          });
        }
      } catch (error) {
        showNotice({
          kind: 'error',
          message: getErrorMessage(error),
        });
      } finally {
        setIsLoadingProject(false);
        setLoadProgress(null);
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

  const handleRemoveReferencePath = useCallback(
    (target: string) => {
      setReferencePaths((prev) => prev.filter((item) => item !== target));
      showNotice({
        kind: 'info',
        message: `参照から除外しました: ${target}`,
      });
    },
    [showNotice],
  );

  const handleApplyVanillaReference = useCallback(async () => {
    let targetPath = vanillaDataPath;
    let pickedFreshly = false;
    let hasGamedata = true;
    if (!targetPath) {
      const pickResult = await window.electronApi.pickAndSaveVanillaDataPath();
      if (!pickResult) {
        return;
      }
      targetPath = pickResult.path;
      setVanillaDataPath(targetPath);
      pickedFreshly = true;
      hasGamedata = pickResult.hasGamedata;
    }

    const resolved = targetPath;
    if (referencePaths.includes(resolved)) {
      showNotice({
        kind: pickedFreshly && !hasGamedata ? 'warning' : 'info',
        message:
          pickedFreshly && !hasGamedata
            ? `バニラとして保存しましたが gamedata.base が見つかりません: ${resolved} (既に参照済み)`
            : `バニラは既に参照に含まれています: ${resolved}`,
      });
      return;
    }

    setReferencePaths((prev) =>
      prev.includes(resolved) ? prev : [...prev, resolved],
    );

    if (pickedFreshly && !hasGamedata) {
      showNotice({
        kind: 'warning',
        message: `バニラを設定して参照に追加しましたが、gamedata.base が見つかりません: ${resolved} — バニラの data フォルダか確認してください。`,
      });
      return;
    }

    showNotice({
      kind: 'success',
      message: pickedFreshly
        ? `バニラを設定して参照に追加しました。次の読み込みから使用します: ${resolved}`
        : `バニラを参照に追加しました。次の読み込みから使用します: ${resolved}`,
    });
  }, [referencePaths, vanillaDataPath, showNotice]);

  const handleChangeVanillaPath = useCallback(async () => {
    const pickResult = await window.electronApi.pickAndSaveVanillaDataPath();
    if (!pickResult) {
      return;
    }
    const previousPath = vanillaDataPath;
    setVanillaDataPath(pickResult.path);
    setReferencePaths((prev) => {
      if (previousPath === null) {
        return prev;
      }
      const oldIdx = prev.indexOf(previousPath);
      if (oldIdx === -1) {
        return prev;
      }
      const newIdx = prev.indexOf(pickResult.path);
      if (newIdx !== -1 && newIdx !== oldIdx) {
        return prev.filter((_, i) => i !== oldIdx);
      }
      return prev.map((item) => (item === previousPath ? pickResult.path : item));
    });
    if (!pickResult.hasGamedata) {
      showNotice({
        kind: 'warning',
        message: `バニラ data を更新しましたが、gamedata.base が見つかりません: ${pickResult.path}`,
      });
    } else {
      showNotice({
        kind: 'success',
        message: `バニラ data を更新しました: ${pickResult.path}`,
      });
    }
  }, [vanillaDataPath, showNotice]);

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
      const sizeLabel =
        result.byteCount !== null
          ? ` (${formatByteSize(result.byteCount)})`
          : '';
      showNotice({
        kind: 'success',
        message: `modデータをMarkdownで保存しました${sizeLabel}: ${result.filePath}`,
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
            onChangeVanillaPath={() => {
              void handleChangeVanillaPath();
            }}
            onClearReferencePaths={handleClearReferencePaths}
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
            onRemoveReferencePath={handleRemoveReferencePath}
            referencePaths={referencePaths}
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

        {isLoadingProject && loadProgress ? (
          <div className="topbar-progress">
            <div className="topbar-progress-info">
              <span className="topbar-progress-label">
                {loadProgress.phase === 'target' ? '解析中' : '参照を解析中'}
              </span>
              <span className="topbar-progress-counter">
                {formatNumber(loadProgress.current)} / {formatNumber(loadProgress.total)}
              </span>
              <code className="topbar-progress-file">{loadProgress.currentFile}</code>
            </div>
            <div className="topbar-progress-track">
              <div
                className="topbar-progress-bar"
                style={{
                  width: `${Math.min(100, (loadProgress.current / loadProgress.total) * 100)}%`,
                }}
              />
            </div>
          </div>
        ) : null}

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
