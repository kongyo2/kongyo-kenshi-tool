import type { LoadedMod } from '../shared/models.ts';
import { formatNumber } from '../lib/utils.ts';

interface ModsViewProps {
  mods: readonly LoadedMod[];
  onRevealFile: (filePath: string) => void;
}

export const ModsView = ({ mods, onRevealFile }: ModsViewProps) => (
  <div className="view mods-view">
    <div className="view-header">
      <div>
        <p className="eyebrow">mod情報</p>
        <h1 className="view-title">読み込み済みmod</h1>
        <p className="view-subtitle">
          {formatNumber(mods.length)}個のmodファイル / 合計{' '}
          {formatNumber(
            mods.reduce((total, mod) => total + mod.recordCount, 0),
          )}{' '}
          レコード
        </p>
      </div>
    </div>

    {mods.length === 0 ? (
      <div className="empty-state">modが読み込まれていません。</div>
    ) : (
      <div className="mod-grid">
        {mods.map((mod) => (
          <article className="mod-card" key={mod.filePath}>
            <header className="mod-card-header">
              <h2 className="mod-card-name">{mod.fileName}</h2>
              <span className="mod-card-type">
                fileType {mod.header.fileType}
              </span>
            </header>
            <dl className="mod-card-list">
              <div>
                <dt>作者</dt>
                <dd>
                  {mod.header.author.length > 0 ? mod.header.author : '—'}
                </dd>
              </div>
              <div>
                <dt>バージョン</dt>
                <dd>{formatNumber(mod.header.version)}</dd>
              </div>
              <div>
                <dt>レコード数</dt>
                <dd>{formatNumber(mod.recordCount)}</dd>
              </div>
              <div>
                <dt>依存mod</dt>
                <dd>
                  {mod.header.dependencies.length === 0
                    ? 'なし'
                    : mod.header.dependencies.length}
                </dd>
              </div>
              <div>
                <dt>参照mod</dt>
                <dd>
                  {mod.header.references.length === 0
                    ? 'なし'
                    : mod.header.references.length}
                </dd>
              </div>
            </dl>
            {mod.header.description.length > 0 ? (
              <p className="mod-card-description">
                {mod.header.description}
              </p>
            ) : null}
            {mod.header.dependencies.length > 0 ? (
              <div className="mod-card-tags">
                <span className="mod-card-tag-label">依存:</span>
                {mod.header.dependencies.map((dependency) => (
                  <span className="tag" key={`dep-${dependency}`}>
                    {dependency}
                  </span>
                ))}
              </div>
            ) : null}
            {mod.header.references.length > 0 ? (
              <div className="mod-card-tags">
                <span className="mod-card-tag-label">参照:</span>
                {mod.header.references.map((reference) => (
                  <span className="tag" key={`ref-${reference}`}>
                    {reference}
                  </span>
                ))}
              </div>
            ) : null}
            <footer className="mod-card-footer">
              <span className="mod-card-path">{mod.filePath}</span>
              <button
                className="ghost-button"
                onClick={() => onRevealFile(mod.filePath)}
                type="button"
              >
                フォルダを開く
              </button>
            </footer>
          </article>
        ))}
      </div>
    )}
  </div>
);
