import cx from 'clsx';
import type { DragEventHandler } from 'react';
import { FileIcon, FolderIcon, UploadIcon } from './Icons.tsx';

interface LoaderPanelProps {
  isBusy: boolean;
  isDragging: boolean;
  onDrop: DragEventHandler<HTMLDivElement>;
  onPickFiles: () => void;
  onPickFolders: () => void;
  setDragging: (value: boolean) => void;
}

export const LoaderPanel = ({
  isBusy,
  isDragging,
  onDrop,
  onPickFiles,
  onPickFolders,
  setDragging,
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
        複数の <code>.mod</code> ファイルや Workshop 配下のサブフォルダを解析し、
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
      </div>
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
