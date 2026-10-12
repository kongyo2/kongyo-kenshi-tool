import cx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { CloseIcon, CopyIcon, FileIcon, FolderIcon, RefreshIcon } from "./components/Icons.tsx";
import { LoadedLayers, ReferenceSetup } from "./components/LayerStack.tsx";
import { Notice, type NoticeState } from "./components/Notice.tsx";
import { summarizeProject } from "./lib/project-stats.ts";
import {
  extractDroppedPaths,
  formatByteSize,
  formatNumber,
  getErrorMessage,
  getFileName,
  isSamePath,
} from "./lib/utils.ts";
import type { ExportOptions, LoadProgress, MeasureModMarkdownResponse } from "./shared/ipc.ts";
import type { InspectorRecord, ModProject } from "./shared/models.ts";
import { AssetsView } from "./views/AssetsView.tsx";
import { ExportView, type AppView } from "./views/ExportView.tsx";
import { ModsView } from "./views/ModsView.tsx";
import { RecordsView } from "./views/RecordsView.tsx";

const api = () => window.electronApi;

const appendUnique = (current: readonly string[], additions: readonly string[]) => {
  const next = [...current];
  for (const item of additions) {
    if (!next.some((existing) => isSamePath(existing, item))) {
      next.push(item);
    }
  }
  return next;
};

const progressPhaseLabels: Record<LoadProgress["phase"], string> = {
  analysis: "アセットを確認しています",
  reference: "参照を読み込んでいます",
  target: "対象 mod を読み込んでいます",
};

const App = () => {
  const [vanillaDataPath, setVanillaDataPath] = useState<string | null>(null);
  const [referencePaths, setReferencePaths] = useState<string[]>([]);
  const [lastTargetPaths, setLastTargetPaths] = useState<string[]>([]);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includeBaseComparison: true,
    includeFieldGlossary: true,
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [project, setProject] = useState<ModProject | null>(null);
  const [contextRecords, setContextRecords] = useState<InspectorRecord[] | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [view, setView] = useState<AppView>("export");
  const [editingReferences, setEditingReferences] = useState(false);

  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [copying, setCopying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [measure, setMeasure] = useState<MeasureModMarkdownResponse | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [lastExportPath, setLastExportPath] = useState<string | null>(null);
  const [dragDepth, setDragDepth] = useState(0);
  const dropZoneRef = useRef<HTMLDivElement | null>(null);

  const busy = loading || copying || saving;
  const summary = useMemo(() => (project ? summarizeProject(project) : null), [project]);

  useEffect(() => {
    void (async () => {
      const saved = await api().getAppSettings();
      setVanillaDataPath(saved.vanillaDataPath);
      setReferencePaths(saved.referencePaths);
      setLastTargetPaths(saved.lastTargetPaths);
      setExportOptions(saved.exportOptions);
      setSettingsLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (settingsLoaded) {
      void api().saveReferencePaths(referencePaths);
    }
  }, [referencePaths, settingsLoaded]);

  useEffect(() => api().onLoadProgress(setProgress), []);

  // 書き出し内容の大きさは、プロジェクトか設定が変わるたびに計り直す
  useEffect(() => {
    if (!project) {
      setMeasure(null);
      return undefined;
    }
    let cancelled = false;
    setMeasuring(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await api().measureModMarkdown({
          options: exportOptions,
          projectId: project.projectId,
        });
        if (!cancelled) {
          setMeasure(result);
        }
      } catch (error) {
        if (!cancelled) {
          setNotice({
            kind: "error",
            message: `出力の大きさを計算できませんでした: ${getErrorMessage(error)}`,
          });
        }
      } finally {
        if (!cancelled) {
          setMeasuring(false);
        }
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [exportOptions, project]);

  const loadFromPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) {
        return;
      }

      setLoading(true);
      setProgress(null);
      setNotice(null);
      try {
        const loaded = await api().loadMods({ paths, referencePaths });
        setProject(loaded);
        setContextRecords(null);
        setMeasure(null);
        setLastExportPath(null);
        setEditingReferences(false);
        setView("export");
        setLastTargetPaths(paths);
        void api().saveLastTargetPaths(paths);

        const warnings: string[] = [];
        if (loaded.failedMods.length > 0) {
          warnings.push(
            `${formatNumber(loaded.failedMods.length)} 件のファイルを解析できませんでした`,
          );
        }
        if (loaded.missingReferencePaths.length > 0) {
          warnings.push(
            `見つからない参照 ${formatNumber(loaded.missingReferencePaths.length)} 件を外しました`,
          );
          setReferencePaths((current) =>
            current.filter(
              (item) => !loaded.missingReferencePaths.some((missing) => isSamePath(missing, item)),
            ),
          );
        }
        const emptyTargets = loaded.mods.filter(
          (mod) => mod.role === "target" && mod.recordCount === 0,
        );
        if (emptyTargets.length > 0) {
          warnings.push(
            `レコードが 0 件の mod があります（${emptyTargets.map((mod) => mod.fileName).join("、")}）`,
          );
        }

        const loadedSummary = `${formatNumber(loaded.inspectorRecords.length)} レコードを読み込みました${
          loaded.contextRecordCount > 0
            ? `（参照 ${formatNumber(loaded.contextRecordCount)} レコード）`
            : ""
        }。`;
        setNotice(
          warnings.length > 0
            ? { kind: "warning", message: `${loadedSummary} ${warnings.join("。")}。` }
            : { kind: "success", message: loadedSummary },
        );
      } catch (error) {
        setNotice({ kind: "error", message: getErrorMessage(error) });
      } finally {
        setLoading(false);
        setProgress(null);
      }
    },
    [referencePaths],
  );

  const targetPathsForReload = project
    ? project.mods.filter((mod) => mod.role === "target").map((mod) => mod.filePath)
    : lastTargetPaths;

  const handleOpenFiles = async () => loadFromPaths(await api().pickModFiles());
  const handleOpenFolders = async () => loadFromPaths(await api().pickModFolders());
  const handleReload = async () => loadFromPaths(targetPathsForReload);

  const handleClose = () => {
    if (project) {
      void api().closeProject(project.projectId);
    }
    setProject(null);
    setContextRecords(null);
    setMeasure(null);
    setLastExportPath(null);
    setNotice(null);
  };

  // --- 参照 ---

  const addReferences = (paths: readonly string[], label: string) => {
    if (paths.length === 0) {
      return;
    }
    const added = paths.filter(
      (item) => !referencePaths.some((existing) => isSamePath(existing, item)),
    );
    setReferencePaths((current) => appendUnique(current, paths));
    setNotice({
      kind: "info",
      message:
        added.length === 0
          ? `${label}はすでに参照に入っています。`
          : `${label}を ${formatNumber(added.length)} 件、参照に加えました。${project ? "再読み込みすると反映されます。" : ""}`,
    });
  };

  const handleAddVanilla = async () => {
    let dataPath = vanillaDataPath;
    if (!dataPath) {
      const detected = await api().detectVanillaDataPath();
      if (detected) {
        dataPath = (await api().saveVanillaDataPath(detected)).path;
      } else {
        const picked = await api().pickAndSaveVanillaDataPath();
        if (!picked) {
          return;
        }
        if (!picked.hasGamedata) {
          setNotice({
            kind: "warning",
            message: `選んだフォルダに gamedata.base がありません: ${picked.path}。Kenshi の data フォルダを選んでください。`,
          });
        }
        dataPath = picked.path;
      }
      setVanillaDataPath(dataPath);
    }
    addReferences([dataPath], "バニラ");
  };

  const handleAddEnabledMods = async () => {
    try {
      const result = await api().resolveEnabledMods();
      if (!result) {
        setNotice({ kind: "warning", message: "先にバニラの data フォルダを設定してください。" });
        return;
      }
      if (result.found.length === 0) {
        setNotice({
          kind: "info",
          message: `${result.modsConfigPath} に有効な mod が見つかりませんでした。`,
        });
        return;
      }
      addReferences(result.found, "ゲームで有効な mod ");
      if (result.missing.length > 0) {
        setNotice({
          kind: "warning",
          message: `有効な mod を ${formatNumber(result.found.length)} 件加えました。見つからなかった mod: ${result.missing.join("、")}`,
        });
      }
    } catch (error) {
      setNotice({
        kind: "error",
        message: `mods.cfg を読めませんでした: ${getErrorMessage(error)}`,
      });
    }
  };

  const handleMoveReference = (target: string, direction: -1 | 1) => {
    setReferencePaths((current) => {
      const nonVanilla = current.filter(
        (item) => !vanillaDataPath || !isSamePath(item, vanillaDataPath),
      );
      const index = nonVanilla.indexOf(target);
      const swapIndex = index + direction;
      if (index < 0 || swapIndex < 0 || swapIndex >= nonVanilla.length) {
        return current;
      }
      const reordered = [...nonVanilla];
      [reordered[index], reordered[swapIndex]] = [reordered[swapIndex]!, reordered[index]!];
      const vanilla = current.filter(
        (item) => vanillaDataPath && isSamePath(item, vanillaDataPath),
      );
      return [...vanilla, ...reordered];
    });
  };

  // --- 書き出し ---

  const handleCopy = async () => {
    if (!project) {
      return;
    }
    setCopying(true);
    try {
      const result = await api().copyModMarkdown({
        options: exportOptions,
        projectId: project.projectId,
      });
      setNotice({
        kind: "success",
        message: `クリップボードにコピーしました（${formatByteSize(result.byteCount)}、約 ${formatNumber(result.estimatedTokens)} トークン）。`,
      });
    } catch (error) {
      setNotice({ kind: "error", message: `コピーできませんでした: ${getErrorMessage(error)}` });
    } finally {
      setCopying(false);
    }
  };

  const handleSave = async () => {
    if (!project) {
      return;
    }
    setSaving(true);
    try {
      const result = await api().exportModMarkdown({
        options: exportOptions,
        projectId: project.projectId,
      });
      if (result.canceled) {
        return;
      }
      setLastExportPath(result.filePath);
      setNotice({
        kind: "success",
        message: `保存しました: ${result.filePath}（${formatByteSize(result.byteCount)}）`,
      });
    } catch (error) {
      setNotice({ kind: "error", message: `保存できませんでした: ${getErrorMessage(error)}` });
    } finally {
      setSaving(false);
    }
  };

  const handleChangeOptions = (options: ExportOptions) => {
    setExportOptions(options);
    void api().saveExportOptions(options);
  };

  const handleRequestContext = async () => {
    if (!project || contextRecords || loadingContext) {
      return;
    }
    setLoadingContext(true);
    try {
      setContextRecords(await api().getContextRecords(project.projectId));
    } catch (error) {
      setNotice({
        kind: "error",
        message: `参照レコードを読み込めませんでした: ${getErrorMessage(error)}`,
      });
    } finally {
      setLoadingContext(false);
    }
  };

  const handleReveal = (filePath: string) => {
    void api().revealFileInFolder(filePath);
  };

  // --- ドラッグ & ドロップ (ウィンドウ全体で受け付ける) ---

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes("Files")) {
      setDragDepth((depth) => depth + 1);
    }
  };
  const handleDragLeave = () => setDragDepth((depth) => Math.max(0, depth - 1));
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragDepth(0);
    if (busy) {
      return;
    }
    const paths = extractDroppedPaths(event.dataTransfer.files);
    if (paths.length === 0) {
      setNotice({
        kind: "error",
        message: "ドロップされたファイルの場所を取得できませんでした。ボタンから選んでください。",
      });
      return;
    }
    void loadFromPaths(paths);
  };

  const tabs: Array<{ count?: number; id: AppView; label: string; warn?: boolean }> = project
    ? [
        { id: "export", label: "書き出し" },
        { count: project.inspectorRecords.length, id: "records", label: "レコード" },
        {
          count: project.mods.length,
          id: "mods",
          label: "mod 情報",
          warn: project.failedMods.length > 0,
        },
        {
          count: project.assetReferences.length,
          id: "assets",
          label: "アセット",
          warn: (summary?.assetMissingCount ?? 0) > 0,
        },
      ]
    : [];

  const showSetup = !project || editingReferences;

  return (
    <div
      className={cx("app", { "is-dragging": dragDepth > 0 })}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      ref={dropZoneRef}
    >
      <header className="topbar">
        <div className="topbar-identity">
          <span className="brand">Kenshiツール</span>
          {project ? (
            <span className="project-name" title={targetPathsForReload.join("\n")}>
              {project.sourceModName}
              {project.mods.filter((mod) => mod.role === "target").length > 1
                ? ` ほか ${project.mods.filter((mod) => mod.role === "target").length - 1} 件`
                : ""}
            </span>
          ) : null}
        </div>
        <div className="topbar-actions">
          <button
            className="button button-quiet"
            disabled={busy}
            onClick={() => void handleOpenFiles()}
            type="button"
          >
            <FileIcon />
            mod を開く
          </button>
          <button
            className="button button-quiet"
            disabled={busy}
            onClick={() => void handleOpenFolders()}
            type="button"
          >
            <FolderIcon />
            フォルダを開く
          </button>
          {targetPathsForReload.length > 0 ? (
            <button
              className="button button-quiet"
              disabled={busy}
              onClick={() => void handleReload()}
              title={targetPathsForReload.join("\n")}
              type="button"
            >
              <RefreshIcon />
              {project
                ? "再読み込み"
                : `前回の mod を開く（${getFileName(targetPathsForReload[0]!)}）`}
            </button>
          ) : null}
          {project ? (
            <>
              <button
                className="button button-primary"
                disabled={busy}
                onClick={() => void handleCopy()}
                type="button"
              >
                <CopyIcon />
                {copying ? "コピーしています…" : "コピー"}
              </button>
              <button
                aria-label="プロジェクトを閉じる"
                className="icon-button"
                disabled={busy}
                onClick={handleClose}
                type="button"
              >
                <CloseIcon />
              </button>
            </>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="progress" role="status">
          <span className="progress-label">
            {progress ? progressPhaseLabels[progress.phase] : "ファイルを探しています"}
            {progress ? `：${progress.currentFile}` : ""}
          </span>
          <span className="progress-count">
            {progress ? `${formatNumber(progress.current)} / ${formatNumber(progress.total)}` : ""}
          </span>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: progress
                  ? `${Math.min(100, (progress.current / progress.total) * 100)}%`
                  : "8%",
              }}
            />
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="notice-area">
          <Notice notice={notice} onDismiss={() => setNotice(null)} />
        </div>
      ) : null}

      <div className="workspace">
        <aside className="strata-column" aria-label="読み込み順">
          <div className="strata-header">
            <h2 className="strata-title">読み込み順</h2>
            <p className="strata-help">下の層から順に読み込まれ、上の層が下の層を上書きします。</p>
          </div>
          {showSetup ? (
            <ReferenceSetup
              busy={busy}
              onAddEnabledMods={() => void handleAddEnabledMods()}
              onAddReferenceFiles={() =>
                void api()
                  .pickModFiles()
                  .then((paths) => addReferences(paths, "参照ファイル"))
              }
              onAddReferenceFolders={() =>
                void api()
                  .pickModFolders()
                  .then((paths) => addReferences(paths, "参照フォルダ"))
              }
              onAddVanilla={() => void handleAddVanilla()}
              onClear={() => setReferencePaths([])}
              onMove={handleMoveReference}
              onRemove={(target) =>
                setReferencePaths((current) => current.filter((item) => !isSamePath(item, target)))
              }
              referencePaths={referencePaths}
              vanillaDataPath={vanillaDataPath}
            />
          ) : project ? (
            <LoadedLayers failedMods={project.failedMods} mods={project.mods} />
          ) : null}
          {project ? (
            <div className="strata-footer">
              {editingReferences ? (
                <>
                  <button
                    className="button button-primary"
                    disabled={busy}
                    onClick={() => void handleReload()}
                    type="button"
                  >
                    <RefreshIcon />
                    この参照で読み込み直す
                  </button>
                  <button
                    className="button button-quiet"
                    onClick={() => setEditingReferences(false)}
                    type="button"
                  >
                    やめる
                  </button>
                </>
              ) : (
                <button
                  className="button button-quiet"
                  disabled={busy}
                  onClick={() => setEditingReferences(true)}
                  type="button"
                >
                  参照を編集
                </button>
              )}
            </div>
          ) : null}
        </aside>

        <main className="main-column">
          {project && summary ? (
            <>
              <nav className="tabs" aria-label="表示の切り替え">
                {tabs.map((tab) => (
                  <button
                    aria-current={view === tab.id ? "page" : undefined}
                    className={cx("tab", { "is-active": view === tab.id, "has-warning": tab.warn })}
                    key={tab.id}
                    onClick={() => setView(tab.id)}
                    type="button"
                  >
                    {tab.label}
                    {tab.count !== undefined ? (
                      <span className="tab-count">{formatNumber(tab.count)}</span>
                    ) : null}
                  </button>
                ))}
              </nav>
              <div className="view-scroll">
                {view === "export" ? (
                  <ExportView
                    copying={copying}
                    lastExportPath={lastExportPath}
                    measure={measure}
                    measuring={measuring}
                    onChangeOptions={handleChangeOptions}
                    onCopy={() => void handleCopy()}
                    onNavigate={setView}
                    onReveal={handleReveal}
                    onSave={() => void handleSave()}
                    options={exportOptions}
                    project={project}
                    saving={saving}
                    summary={summary}
                  />
                ) : null}
                {view === "records" ? (
                  <RecordsView
                    contextRecordCount={project.contextRecordCount}
                    contextRecords={contextRecords}
                    loadingContext={loadingContext}
                    onRequestContext={() => void handleRequestContext()}
                    records={project.inspectorRecords}
                  />
                ) : null}
                {view === "mods" ? (
                  <ModsView
                    failedMods={project.failedMods}
                    missingReferencePaths={project.missingReferencePaths}
                    mods={project.mods}
                    onRevealFile={handleReveal}
                  />
                ) : null}
                {view === "assets" ? (
                  <AssetsView assets={project.assetReferences} onRevealFile={handleReveal} />
                ) : null}
              </div>
            </>
          ) : (
            <section className="welcome" aria-labelledby="welcome-heading">
              <h1 className="welcome-title" id="welcome-heading">
                Kenshi の mod を、LLM が読める Markdown に。
              </h1>
              <p className="welcome-text">
                .mod / .base
                を読み込むと、追加・変更・削除されたレコード、ダイアログの流れ、参照しているファイルを一つの文書にまとめます。
                左の層にバニラや前提 mod
                を置いておくと、名前の解決と「変更前の値」の比較まで行います。
              </p>
              <div className={cx("drop-target", { "is-active": dragDepth > 0 })}>
                <p className="drop-target-text">ここに .mod / .base ファイルやフォルダをドロップ</p>
                <div className="drop-target-actions">
                  <button
                    className="button button-primary"
                    disabled={busy}
                    onClick={() => void handleOpenFiles()}
                    type="button"
                  >
                    <FileIcon />
                    mod ファイルを選ぶ
                  </button>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => void handleOpenFolders()}
                    type="button"
                  >
                    <FolderIcon />
                    フォルダを選ぶ
                  </button>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
