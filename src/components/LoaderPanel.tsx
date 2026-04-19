import cx from 'clsx';
import type { DragEventHandler } from 'react';
import { FileIcon, FolderIcon, UploadIcon } from './Icons.tsx';

interface LoaderPanelProps {
  isBusy: boolean;
  isDragging: boolean;
  onDrop: DragEventHandler<HTMLDivElement>;
  onPickFiles: () => void;
  onPickFolders: () => void;
  onImportJson: () => void;
  setDragging: (value: boolean) => void;
}

export const LoaderPanel = ({
  isBusy,
  isDragging,
  onDrop,
  onPickFiles,
  onPickFolders,
  onImportJson,
  setDragging,
}: LoaderPanelProps) => (
  <section className="loader-panel">
    <div
      className={cx('dropzone', {
        'is-dragging': isDragging,
        'is-busy': isBusy,
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
      <h2 className="dropzone-title">modファイルをここにドロップ</h2>
      <p className="dropzone-text">
        複数の <code>.mod</code>{' '}
        ファイルや Steam Workshop のサブフォルダをまとめて読み込めます。
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
          className="ghost-button"
          disabled={isBusy}
          onClick={onImportJson}
          type="button"
        >
          翻訳プロジェクトから再開
        </button>
      </div>
    </div>
    <ul className="loader-tips">
      <li>ドラッグ&ドロップはファイルのみ対応。フォルダはボタンから選択してください。</li>
      <li>
        <strong>概要</strong> では翻訳の進捗、<strong>エディタ</strong>{' '}
        では手動翻訳、<strong>インスペクタ</strong>{' '}
        ではmod内の全レコードを確認できます。
      </li>
      <li>
        OpenConstructionSet と同じ fileType 16/17 を解析し、128種類のItemTypeに対応しています。
      </li>
    </ul>
  </section>
);
