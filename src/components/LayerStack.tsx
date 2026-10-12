import cx from "clsx";
import type { CSSProperties, ReactNode } from "react";

import { formatNumber, getFileName, isSamePath } from "../lib/utils.ts";
import type { FailedMod, LoadedMod } from "../shared/models.ts";
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, FileIcon, FolderIcon, PlusIcon } from "./Icons.tsx";

// 読み込み順を地層として描く。下の層から順に読み込まれ、上の層が下の層を上書きする。
// 層の厚みはレコード数 (対数) に比例させる。

const vanillaFileNames = new Set(["gamedata.base", "newwworld.mod", "dialogue.mod", "rebirth.mod"]);

const layerHeight = (recordCount: number) =>
  Math.round(30 + Math.min(52, Math.log10(recordCount + 1) * 11));

type LayerKind = "bedrock" | "failed" | "reference" | "target";

interface LayerProps {
  actions?: ReactNode;
  badge?: string;
  detail: string;
  index: number;
  kind: LayerKind;
  name: string;
  recordCount: number;
  title?: string;
}

const Layer = ({ actions, badge, detail, index, kind, name, recordCount, title }: LayerProps) => (
  <li
    className={cx("layer", `layer-${kind}`)}
    style={
      { "--layer-height": `${layerHeight(recordCount)}px`, "--layer-index": index } as CSSProperties
    }
    title={title}
  >
    <div className="layer-body">
      <span className="layer-name">
        {badge ? <span className="layer-badge">{badge}</span> : null}
        {name}
      </span>
      <span className="layer-detail">{detail}</span>
    </div>
    {actions ? <div className="layer-actions">{actions}</div> : null}
  </li>
);

interface LoadedLayersProps {
  failedMods: readonly FailedMod[];
  mods: readonly LoadedMod[];
}

/** 読み込み済みプロジェクトの層 (上 = 対象 mod、下 = 最初に読み込んだ参照) */
export const LoadedLayers = ({ failedMods, mods }: LoadedLayersProps) => {
  const targets = mods.filter((mod) => mod.role === "target");
  const references = mods.filter((mod) => mod.role === "reference").toReversed();
  const layers = [...targets, ...references];

  return (
    <ol className="layer-stack" aria-label="読み込み順 (上ほど後に読み込まれ、下の層を上書きする)">
      {layers.map((mod, position) => (
        <Layer
          badge={mod.role === "target" ? "対象" : undefined}
          detail={`${formatNumber(mod.recordCount)} レコード${mod.warnings.length > 0 ? `、警告 ${mod.warnings.length} 件` : ""}`}
          index={layers.length - position}
          key={mod.filePath}
          kind={
            mod.role === "target"
              ? "target"
              : vanillaFileNames.has(mod.fileName.toLowerCase())
                ? "bedrock"
                : "reference"
          }
          name={mod.info?.title && mod.info.title !== mod.fileName ? mod.info.title : mod.fileName}
          recordCount={mod.recordCount}
          title={mod.filePath}
        />
      ))}
      {failedMods.map((failed) => (
        <Layer
          detail="読み込めませんでした"
          index={0}
          key={failed.filePath}
          kind="failed"
          name={getFileName(failed.filePath)}
          recordCount={0}
          title={`${failed.filePath}\n${failed.error}`}
        />
      ))}
    </ol>
  );
};

interface ReferenceSetupProps {
  busy: boolean;
  onAddEnabledMods: () => void;
  onAddReferenceFiles: () => void;
  onAddReferenceFolders: () => void;
  onAddVanilla: () => void;
  onClear: () => void;
  onMove: (path: string, direction: -1 | 1) => void;
  onRemove: (path: string) => void;
  referencePaths: readonly string[];
  vanillaDataPath: string | null;
}

/** 読み込み前の参照設定。リストの先頭ほど先に (下の層として) 読み込まれる。 */
export const ReferenceSetup = ({
  busy,
  onAddEnabledMods,
  onAddReferenceFiles,
  onAddReferenceFolders,
  onAddVanilla,
  onClear,
  onMove,
  onRemove,
  referencePaths,
  vanillaDataPath,
}: ReferenceSetupProps) => {
  const vanillaIncluded =
    vanillaDataPath !== null && referencePaths.some((item) => isSamePath(item, vanillaDataPath));
  const others = referencePaths.filter(
    (item) => vanillaDataPath === null || !isSamePath(item, vanillaDataPath),
  );
  // 表示は上が最後に読み込まれる層
  const displayed = others.toReversed();

  return (
    <div className="reference-setup">
      <ol
        className="layer-stack layer-stack-setup"
        aria-label="参照コンテキスト (上ほど後に読み込まれる)"
      >
        <li className="layer layer-slot">
          <div className="layer-body">
            <span className="layer-name">対象 mod</span>
            <span className="layer-detail">読み込むとここに重なります</span>
          </div>
        </li>
        {displayed.map((referencePath, position) => {
          const orderIndex = others.length - 1 - position;
          return (
            <Layer
              actions={
                <>
                  <button
                    aria-label="後に読み込む (上へ)"
                    className="icon-button"
                    disabled={busy || orderIndex === others.length - 1}
                    onClick={() => onMove(referencePath, 1)}
                    type="button"
                  >
                    <ArrowUpIcon />
                  </button>
                  <button
                    aria-label="先に読み込む (下へ)"
                    className="icon-button"
                    disabled={busy || orderIndex === 0}
                    onClick={() => onMove(referencePath, -1)}
                    type="button"
                  >
                    <ArrowDownIcon />
                  </button>
                  <button
                    aria-label="参照から外す"
                    className="icon-button"
                    disabled={busy}
                    onClick={() => onRemove(referencePath)}
                    type="button"
                  >
                    <CloseIcon />
                  </button>
                </>
              }
              detail={referencePath}
              index={orderIndex + 2}
              key={referencePath}
              kind="reference"
              name={getFileName(referencePath)}
              recordCount={400}
              title={referencePath}
            />
          );
        })}
        {vanillaIncluded && vanillaDataPath ? (
          <Layer
            actions={
              <button
                aria-label="バニラを参照から外す"
                className="icon-button"
                disabled={busy}
                onClick={() => onRemove(vanillaDataPath)}
                type="button"
              >
                <CloseIcon />
              </button>
            }
            detail="gamedata.base → Newwworld → Dialogue → rebirth"
            index={1}
            kind="bedrock"
            name="バニラ Kenshi"
            recordCount={60_000}
            title={vanillaDataPath}
          />
        ) : (
          <li className="layer layer-slot layer-slot-bedrock">
            <div className="layer-body">
              <span className="layer-name">バニラ未設定</span>
              <span className="layer-detail">名前の解決と元の値の比較に使います</span>
            </div>
          </li>
        )}
      </ol>

      <div className="setup-actions">
        {!vanillaIncluded ? (
          <button className="setup-button" disabled={busy} onClick={onAddVanilla} type="button">
            <PlusIcon />
            バニラを追加
          </button>
        ) : null}
        <button
          className="setup-button"
          disabled={busy || vanillaDataPath === null}
          onClick={onAddEnabledMods}
          title={
            vanillaDataPath === null
              ? "先にバニラの data フォルダを設定してください"
              : "data\\mods.cfg に並んでいる有効な mod を、ゲームと同じ順で追加します"
          }
          type="button"
        >
          <PlusIcon />
          ゲームで有効な mod を追加
        </button>
        <button
          className="setup-button"
          disabled={busy}
          onClick={onAddReferenceFolders}
          type="button"
        >
          <FolderIcon />
          フォルダを追加
        </button>
        <button
          className="setup-button"
          disabled={busy}
          onClick={onAddReferenceFiles}
          type="button"
        >
          <FileIcon />
          ファイルを追加
        </button>
        {referencePaths.length > 0 ? (
          <button
            className="setup-button setup-button-quiet"
            disabled={busy}
            onClick={onClear}
            type="button"
          >
            すべて外す
          </button>
        ) : null}
      </div>
    </div>
  );
};
