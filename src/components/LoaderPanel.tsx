import cx from 'clsx';
import type { DragEventHandler } from 'react';
import {
  CloseIcon,
  FileIcon,
  FolderIcon,
  ReplaceIcon,
  UploadIcon,
} from './Icons.tsx';

interface LoaderPanelProps {
  hasSavedVanillaPath: boolean;
  isBusy: boolean;
  isDragging: boolean;
  lastTargetPaths: readonly string[];
  onApplyVanillaReference: () => void;
  onChangeVanillaPath: () => void;
  onClearReferencePaths: () => void;
  onDrop: DragEventHandler<HTMLDivElement>;
  onPickFiles: () => void;
  onPickFolders: () => void;
  onPickReferenceFolders: () => void;
  onReloadLastTargets: () => void;
  onRemoveReferencePath: (path: string) => void;
  referencePaths: readonly string[];
  setDragging: (value: boolean) => void;
  vanillaDataPath: string | null;
}

const summarizeLastTargets = (paths: readonly string[]) => {
  if (paths.length === 0) return null;
  const first = paths[0]!;
  const tail = first.split(/[/\\]/).pop() ?? first;
  return paths.length === 1
    ? tail
    : `${tail} 他 ${paths.length - 1} 件`;
};

export const LoaderPanel = ({
  hasSavedVanillaPath,
  isBusy,
  isDragging,
  lastTargetPaths,
  onApplyVanillaReference,
  onChangeVanillaPath,
  onClearReferencePaths,
  onDrop,
  onPickFiles,
  onPickFolders,
  onPickReferenceFolders,
  onReloadLastTargets,
  onRemoveReferencePath,
  referencePaths,
  setDragging,
  vanillaDataPath,
}: LoaderPanelProps) => (
  <section className="loader-panel">
    <div
      className={cx('dropzone', {
        'is-busy': isBusy,
        'is-dragging': isDragging,
      })}
      onDragEnter={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={onDrop}
    >
      <div className="dropzone-icon" aria-hidden="true">
        <UploadIcon height="32" width="32" />
      </div>
      <h2 className="dropzone-title">Kenshi modを読み込む</h2>
      <p className="dropzone-text">
        複数の <code>.mod</code> / <code>.base</code> ファイルや Workshop 配下のサブフォルダを解析し、
        LLM に読ませるための Markdown を生成できます。
      </p>
      <div className="dropzone-actions">
        <button
          className="primary-button"
          disabled={isBusy}
          onClick={onPickFiles}
          type="button"
        >
          <FileIcon height="16" width="16" />
          modファイルを選択
        </button>
        <button
          className="secondary-button"
          disabled={isBusy}
          onClick={onPickFolders}
          type="button"
        >
          <FolderIcon height="16" width="16" />
          フォルダを選択
        </button>
        <button
          className="secondary-button"
          disabled={isBusy}
          onClick={onPickReferenceFolders}
          type="button"
        >
          <FolderIcon height="16" width="16" />
          参照フォルダを追加
        </button>
        <button
          className="secondary-button"
          disabled={isBusy}
          onClick={onApplyVanillaReference}
          title={
            vanillaDataPath
              ? `バニラ data フォルダ: ${vanillaDataPath}`
              : '初回はバニラ data フォルダを選択します'
          }
          type="button"
        >
          <FolderIcon height="16" width="16" />
          {hasSavedVanillaPath ? 'バニラを参照に追加' : 'バニラを設定'}
        </button>
      </div>
      {hasSavedVanillaPath && vanillaDataPath ? (
        <p className="vanilla-status">
          <span className="vanilla-status-label">バニラ data:</span>
          <code className="vanilla-status-path">{vanillaDataPath}</code>
          <button
            className="vanilla-status-change"
            disabled={isBusy}
            onClick={onChangeVanillaPath}
            type="button"
          >
            <ReplaceIcon height="12" width="12" />
            変更
          </button>
        </p>
      ) : null}
      {lastTargetPaths.length > 0 ? (
        <div className="last-target">
          <span className="last-target-label">前回のmod:</span>
          <code className="last-target-summary" title={lastTargetPaths.join('\n')}>
            {summarizeLastTargets(lastTargetPaths)}
          </code>
          <button
            className="last-target-reload"
            disabled={isBusy}
            onClick={onReloadLastTargets}
            type="button"
          >
            <ReplaceIcon height="12" width="12" />
            再読み込み
          </button>
        </div>
      ) : null}
      {referencePaths.length > 0 ? (
        <div className="reference-list">
          <div className="reference-list-header">
            <span className="reference-list-title">
              参照フォルダ {referencePaths.length} 件
            </span>
            <button
              className="reference-list-clear"
              disabled={isBusy}
              onClick={onClearReferencePaths}
              type="button"
            >
              <CloseIcon height="12" width="12" />
              すべて解除
            </button>
          </div>
          <ul className="reference-list-items">
            {referencePaths.map((referencePath) => (
              <li className="reference-row" key={referencePath}>
                <code className="reference-row-path">{referencePath}</code>
                <button
                  aria-label="この参照を削除"
                  className="reference-row-remove"
                  disabled={isBusy}
                  onClick={() => onRemoveReferencePath(referencePath)}
                  type="button"
                >
                  <CloseIcon height="12" width="12" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
    <ul className="loader-tips">
      <li>ドラッグ&ドロップはファイルのみ対応です。フォルダはボタンから選択してください。</li>
      <li>
        読み込み後は <strong>概要</strong> で Markdown 出力の対象と件数を確認し、
        <strong>インスペクタ</strong> で全レコードの文字列を追えます。
      </li>
      <li>
        出力される Markdown には mod ヘッダ、依存関係、カテゴリ内訳、全 string
        フィールドを持つレコード、対話・説明文の抽出結果が含まれます。
      </li>
    </ul>
  </section>
);
