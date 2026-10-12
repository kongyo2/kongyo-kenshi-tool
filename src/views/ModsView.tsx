import { RevealIcon, WarningIcon } from "../components/Icons.tsx";
import { formatNumber, getFileName } from "../lib/utils.ts";
import type { FailedMod, LoadedMod } from "../shared/models.ts";

interface ModsViewProps {
  failedMods: readonly FailedMod[];
  missingReferencePaths: readonly string[];
  mods: readonly LoadedMod[];
  onRevealFile: (filePath: string) => void;
}

const ModEntry = ({
  mod,
  onRevealFile,
}: {
  mod: LoadedMod;
  onRevealFile: (filePath: string) => void;
}) => {
  const title = mod.info?.title && mod.info.title !== mod.fileName ? mod.info.title : null;
  const workshopId = mod.info?.id && mod.info.id !== "0" ? mod.info.id : null;

  return (
    <article className="mod-entry">
      <header className="mod-entry-header">
        <div>
          <h2 className="mod-entry-name">{title ?? mod.fileName}</h2>
          {title ? <p className="mod-entry-file">{mod.fileName}</p> : null}
        </div>
        <button
          className="button button-quiet"
          onClick={() => onRevealFile(mod.filePath)}
          type="button"
        >
          <RevealIcon />
          フォルダを開く
        </button>
      </header>

      <dl className="mod-facts">
        <div>
          <dt>役割</dt>
          <dd>
            {mod.role === "target" ? "書き出す対象" : `参照（${mod.loadOrder} 番目に読み込み）`}
          </dd>
        </div>
        <div>
          <dt>レコード</dt>
          <dd>{formatNumber(mod.recordCount)}</dd>
        </div>
        <div>
          <dt>作者</dt>
          <dd>{mod.header.author.length > 0 ? mod.header.author : "記載なし"}</dd>
        </div>
        <div>
          <dt>形式</dt>
          <dd>
            fileType {mod.header.fileType}
            {mod.header.fileType === 16 ? "（旧形式）" : ""}、版 {mod.header.version}
          </dd>
        </div>
        {workshopId ? (
          <div>
            <dt>Workshop</dt>
            <dd>{workshopId}</dd>
          </div>
        ) : null}
        {mod.info && mod.info.tags.length > 0 ? (
          <div>
            <dt>タグ</dt>
            <dd>{mod.info.tags.join("、")}</dd>
          </div>
        ) : null}
        <div>
          <dt>依存</dt>
          <dd>
            {mod.header.dependencies.length > 0 ? mod.header.dependencies.join("、") : "なし"}
          </dd>
        </div>
        <div>
          <dt>参照</dt>
          <dd>{mod.header.references.length > 0 ? mod.header.references.join("、") : "なし"}</dd>
        </div>
        {mod.header.mergeEntries.length > 0 ? (
          <div>
            <dt>統合元</dt>
            <dd>{mod.header.mergeEntries.map((entry) => entry.key).join("、")}</dd>
          </div>
        ) : null}
      </dl>

      {mod.warnings.length > 0 ? (
        <ul className="warning-list">
          {mod.warnings.map((warning) => (
            <li key={warning}>
              <WarningIcon />
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      {mod.header.description.length > 0 ? (
        <p className="mod-description">{mod.header.description}</p>
      ) : null}
      <p className="mod-path">{mod.filePath}</p>
    </article>
  );
};

export const ModsView = ({
  failedMods,
  missingReferencePaths,
  mods,
  onRevealFile,
}: ModsViewProps) => {
  const targets = mods.filter((mod) => mod.role === "target");
  const references = mods.filter((mod) => mod.role === "reference");

  return (
    <div className="view mods-view">
      <header className="view-header">
        <h1 className="view-title">mod 情報</h1>
        <p className="view-subtitle">
          対象 {formatNumber(targets.length)} 件と、参照 {formatNumber(references.length)}{" "}
          件を読み込み順に並べています。
        </p>
      </header>

      {failedMods.length > 0 || missingReferencePaths.length > 0 ? (
        <section className="problem-panel" aria-labelledby="problem-heading">
          <h2 className="section-title" id="problem-heading">
            読み込めなかったもの
          </h2>
          <ul className="warning-list">
            {failedMods.map((failed) => (
              <li key={failed.filePath}>
                <WarningIcon />
                <span>
                  <strong>{getFileName(failed.filePath)}</strong>（
                  {failed.role === "target" ? "対象" : "参照"}）: {failed.error}
                </span>
              </li>
            ))}
            {missingReferencePaths.map((missingPath) => (
              <li key={missingPath}>
                <WarningIcon />
                <span>参照パスが見つかりません: {missingPath}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mod-list">
        {[...targets, ...references].map((mod) => (
          <ModEntry key={mod.filePath} mod={mod} onRevealFile={onRevealFile} />
        ))}
      </div>
    </div>
  );
};
