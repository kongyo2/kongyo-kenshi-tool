import {
  buildCategoryBreakdown,
  type ProjectStats,
} from '../lib/project-stats.ts';
import { formatNumber, formatPercentage } from '../lib/utils.ts';
import type { TranslationProject } from '../shared/models.ts';

interface OverviewViewProps {
  onJumpToEditor: () => void;
  onJumpToInspector: () => void;
  onJumpToMods: () => void;
  project: TranslationProject;
  stats: ProjectStats;
}

export const OverviewView = ({
  onJumpToEditor,
  onJumpToInspector,
  onJumpToMods,
  project,
  stats,
}: OverviewViewProps) => {
  const breakdown = buildCategoryBreakdown(project.inspectorRecords);
  const totalRecords = project.inspectorRecords.length;

  return (
    <div className="view overview-view">
      <div className="view-header">
        <div>
          <p className="eyebrow">概要</p>
          <h1 className="view-title">翻訳プロジェクト概要</h1>
          <p className="view-subtitle">
            読み込んだ{formatNumber(project.mods.length)}個のmodの進捗と内訳を表示しています。
          </p>
        </div>
      </div>

      <section className="stat-grid">
        <article className="stat-card stat-primary">
          <span className="stat-label">翻訳進捗</span>
          <strong className="stat-value">
            {formatPercentage(stats.translatedCount, stats.totalCount)}
          </strong>
          <div className="progress-track" aria-hidden="true">
            <span
              className="progress-fill"
              style={{
                width:
                  stats.totalCount === 0
                    ? '0%'
                    : `${(stats.translatedCount / stats.totalCount) * 100}%`,
              }}
            />
          </div>
          <span className="stat-sub">
            {formatNumber(stats.translatedCount)} / {formatNumber(stats.totalCount)} 項目
          </span>
        </article>
        <article className="stat-card">
          <span className="stat-label">読み込みmod数</span>
          <strong className="stat-value">{formatNumber(project.mods.length)}</strong>
          <span className="stat-sub">
            {formatNumber(totalRecords)} レコード / {formatNumber(stats.recordCount)} 翻訳対象
          </span>
        </article>
        <article className="stat-card">
          <span className="stat-label">ダイアログ</span>
          <strong className="stat-value">
            {formatNumber(stats.dialogTranslatedCount)}
            <small>/{formatNumber(stats.dialogCount)}</small>
          </strong>
          <span className="stat-sub">
            {formatPercentage(stats.dialogTranslatedCount, stats.dialogCount)} 翻訳済み
          </span>
        </article>
        <article className="stat-card">
          <span className="stat-label">名称</span>
          <strong className="stat-value">
            {formatNumber(stats.nameTranslatedCount)}
            <small>/{formatNumber(stats.nameCount)}</small>
          </strong>
          <span className="stat-sub">
            {formatPercentage(stats.nameTranslatedCount, stats.nameCount)} 翻訳済み
          </span>
        </article>
        <article className="stat-card">
          <span className="stat-label">説明文</span>
          <strong className="stat-value">
            {formatNumber(stats.descriptionTranslatedCount)}
            <small>/{formatNumber(stats.descriptionCount)}</small>
          </strong>
          <span className="stat-sub">
            {formatPercentage(
              stats.descriptionTranslatedCount,
              stats.descriptionCount,
            )}{' '}
            翻訳済み
          </span>
        </article>
      </section>

      <div className="overview-columns">
        <section className="panel">
          <header className="panel-header">
            <h2 className="panel-title">カテゴリ別レコード内訳</h2>
            <p className="panel-description">
              インスペクタで詳細を確認できます。
            </p>
          </header>
          <ul className="category-list">
            {breakdown.map((entry) => (
              <li className="category-item" key={entry.category}>
                <span className={`category-dot category-${entry.category}`} />
                <span className="category-label">{entry.label}</span>
                <span className="category-bar" aria-hidden="true">
                  <span
                    className={`category-bar-fill category-${entry.category}`}
                    style={{
                      width:
                        totalRecords === 0
                          ? '0%'
                          : `${(entry.count / totalRecords) * 100}%`,
                    }}
                  />
                </span>
                <span className="category-count">
                  {formatNumber(entry.count)}
                </span>
              </li>
            ))}
            {breakdown.length === 0 ? (
              <li className="category-empty">カテゴリ情報がありません。</li>
            ) : null}
          </ul>
        </section>

        <section className="panel">
          <header className="panel-header">
            <h2 className="panel-title">次のアクション</h2>
            <p className="panel-description">
              進捗を進めたり、他のmod情報をチェックしましょう。
            </p>
          </header>
          <div className="action-stack">
            <button
              className="primary-button"
              onClick={onJumpToEditor}
              type="button"
            >
              翻訳エディタを開く
            </button>
            <button
              className="secondary-button"
              onClick={onJumpToInspector}
              type="button"
            >
              modインスペクタを開く
            </button>
            <button
              className="secondary-button"
              onClick={onJumpToMods}
              type="button"
            >
              mod情報を確認
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
