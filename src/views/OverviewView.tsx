import {
  buildCategoryBreakdown,
  type ProjectStats,
} from '../lib/project-stats.ts';
import { formatNumber } from '../lib/utils.ts';
import type { ModProject } from '../shared/models.ts';

interface OverviewViewProps {
  onExportMarkdown: () => void;
  onJumpToInspector: () => void;
  onJumpToMods: () => void;
  project: ModProject;
  stats: ProjectStats;
}

export const OverviewView = ({
  onExportMarkdown,
  onJumpToInspector,
  onJumpToMods,
  project,
  stats,
}: OverviewViewProps) => {
  const breakdown = buildCategoryBreakdown(project.inspectorRecords);
  const totalRecords = project.inspectorRecords.length;
  const defaultFileName = `${project.sourceModName}_mod_data.md`;

  return (
    <div className="view overview-view">
      <div className="view-header">
        <div>
          <p className="eyebrow">Markdown export</p>
          <h1 className="view-title">LLM向けmodダンプ</h1>
          <p className="view-subtitle">
            読み込んだ {formatNumber(project.mods.length)} 個の mod を解析し、
            Kenshi の内容を Markdown へまとめます。
          </p>
        </div>
      </div>

      <section className="stat-grid">
        <article className="stat-card stat-primary">
          <span className="stat-label">抽出テキスト</span>
          <strong className="stat-value">
            {formatNumber(stats.textRecordCount)}
          </strong>
          <span className="stat-sub">
            ダイアログ {formatNumber(stats.dialogRecordCount)} 件 / エンティティ{' '}
            {formatNumber(stats.entityRecordCount)} 件
          </span>
        </article>
        <article className="stat-card">
          <span className="stat-label">ダイアログ行数</span>
          <strong className="stat-value">
            {formatNumber(stats.dialogLineCount)}
          </strong>
          <span className="stat-sub">text* フィールドを集計</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">総レコード数</span>
          <strong className="stat-value">
            {formatNumber(stats.recordCount)}
          </strong>
          <span className="stat-sub">
            全 string フィールド {formatNumber(stats.stringFieldCount)} 件
          </span>
        </article>
        <article className="stat-card">
          <span className="stat-label">読み込みmod数</span>
          <strong className="stat-value">
            {formatNumber(project.mods.length)}
          </strong>
          <span className="stat-sub">
            依存関係 {formatNumber(project.dependencies.length)} 件
          </span>
        </article>
      </section>

      <div className="overview-columns">
        <section className="panel">
          <header className="panel-header">
            <h2 className="panel-title">出力内容</h2>
            <p className="panel-description">
              LLM に投げる前提で、全体像と文字列本体を両方入れます。
            </p>
          </header>
          <ul className="loader-tips">
            <li>mod ヘッダ、依存関係、カテゴリ別・type別の集計</li>
            <li>string を持つレコードだけを絞ったフルダンプと非文字列フィールド件数</li>
            <li>会話文、説明文、名前だけの entity 一覧をまとめた抽出テキストセクション</li>
            <li>標準出力ファイル名は <code>{defaultFileName}</code></li>
          </ul>
          <div className="action-stack">
            <button
              className="primary-button"
              onClick={onExportMarkdown}
              type="button"
            >
              Markdownを書き出す
            </button>
            <button
              className="secondary-button"
              onClick={onJumpToInspector}
              type="button"
            >
              レコードを確認
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

        <section className="panel">
          <header className="panel-header">
            <h2 className="panel-title">カテゴリ別レコード内訳</h2>
            <p className="panel-description">
              詳細はインスペクタで検索・展開できます。
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
      </div>
    </div>
  );
};
