import cx from "clsx";

import { CopyIcon, RevealIcon, SaveIcon, WarningIcon } from "../components/Icons.tsx";
import {
  recordStatusLabels,
  recordStatusOrder,
  type ProjectSummary,
} from "../lib/project-stats.ts";
import { formatByteSize, formatNumber, getFileName } from "../lib/utils.ts";
import type { ExportOptions, MeasureModMarkdownResponse } from "../shared/ipc.ts";
import type { ModProject } from "../shared/models.ts";

export type AppView = "assets" | "export" | "mods" | "records";

const sectionLabels: Record<string, string> = {
  "asset-files": "アセット",
  "category-breakdown": "カテゴリ内訳",
  "declared-dependencies": "依存関係",
  "directory-structure": "構成",
  "extracted-text-records": "テキストとダイアログ",
  "field-glossary": "フィールド用語集",
  "file-summary": "概要と読み方",
  "item-type-breakdown": "種別内訳",
  mods: "mod 情報",
  navigation: "目次",
  "record-change-breakdown": "変更内訳",
  "records-without-strings-or-references": "数値の変更・削除・改名",
  "reference-bearing-records-without-visible-strings": "参照だけを持つレコード",
  "reference-context": "参照コンテキスト",
  "string-bearing-records": "文字列を持つレコード",
};

// コンテキスト長の目安 (トークン)。対数目盛りで示す。
const contextMarks = [
  { label: "32K", tokens: 32_000 },
  { label: "128K", tokens: 128_000 },
  { label: "200K", tokens: 200_000 },
  { label: "1M", tokens: 1_000_000 },
];
const scaleMin = Math.log10(1_000);
const scaleMax = Math.log10(4_000_000);
const scalePosition = (tokens: number) =>
  Math.min(
    100,
    Math.max(0, ((Math.log10(Math.max(tokens, 1_000)) - scaleMin) / (scaleMax - scaleMin)) * 100),
  );

const describeFit = (tokens: number) => {
  if (tokens <= 32_000) {
    return "ほとんどの LLM にそのまま渡せる大きさです。";
  }
  if (tokens <= 128_000) {
    return "128K コンテキストのモデルに収まります。";
  }
  if (tokens <= 200_000) {
    return "200K コンテキストのモデルに収まります。";
  }
  if (tokens <= 1_000_000) {
    return "1M コンテキストのモデルなら一度に渡せます。小さいモデルには章ごとに分けてください。";
  }
  return "一度に渡すには大きすぎます。必要な章だけを抜き出して使ってください。";
};

interface ExportViewProps {
  copying: boolean;
  lastExportPath: string | null;
  measure: MeasureModMarkdownResponse | null;
  measuring: boolean;
  onChangeOptions: (options: ExportOptions) => void;
  onCopy: () => void;
  onNavigate: (view: AppView) => void;
  onReveal: (filePath: string) => void;
  onSave: () => void;
  options: ExportOptions;
  project: ModProject;
  saving: boolean;
  summary: ProjectSummary;
}

export const ExportView = ({
  copying,
  lastExportPath,
  measure,
  measuring,
  onChangeOptions,
  onCopy,
  onNavigate,
  onReveal,
  onSave,
  options,
  project,
  saving,
  summary,
}: ExportViewProps) => {
  const hasReferences = project.contextRecordCount > 0;
  const statusParts = recordStatusOrder
    .filter((status) => summary.statusCounts[status] > 0)
    .map((status) => `${recordStatusLabels[status]} ${formatNumber(summary.statusCounts[status])}`);
  const tokens = measure?.estimatedTokens ?? 0;
  const busy = copying || saving;

  return (
    <div className="view export-view">
      <section className="export-lead" aria-labelledby="export-heading">
        <h1 className="view-title" id="export-heading">
          LLM に渡す Markdown
        </h1>
        <p className="lead-text">
          {project.sourceModName} の {formatNumber(summary.recordCount)} レコード（
          {statusParts.join("、")}）を、
          {hasReferences
            ? `参照コンテキスト ${formatNumber(project.contextRecordCount)} レコードで名前と元の値を補って`
            : "参照コンテキストなしで"}
          書き出します。
        </p>

        <div className="fit-meter" aria-busy={measuring}>
          <p className="fit-figure">
            {measure ? (
              <>
                <strong>{formatNumber(tokens)}</strong> トークン前後
                <span className="fit-size">{formatByteSize(measure.byteCount)}</span>
              </>
            ) : (
              <span className="fit-pending">出力の大きさを計算しています…</span>
            )}
          </p>
          <div
            className="fit-scale"
            role="img"
            aria-label={`推定 ${formatNumber(tokens)} トークン`}
          >
            <div
              className="fit-fill"
              style={{ width: `${measure ? scalePosition(tokens) : 0}%` }}
            />
            {contextMarks.map((mark) => (
              <span
                className="fit-mark"
                key={mark.label}
                style={{ left: `${scalePosition(mark.tokens)}%` }}
              >
                {mark.label}
              </span>
            ))}
          </div>
          {measure ? <p className="fit-note">{describeFit(tokens)}</p> : null}
        </div>

        <div className="export-actions">
          <button className="button button-primary" disabled={busy} onClick={onCopy} type="button">
            <CopyIcon />
            {copying ? "コピーしています…" : "クリップボードにコピー"}
          </button>
          <button className="button" disabled={busy} onClick={onSave} type="button">
            <SaveIcon />
            {saving ? "保存しています…" : "Markdown を保存"}
          </button>
          {lastExportPath ? (
            <button
              className="button button-quiet"
              onClick={() => onReveal(lastExportPath)}
              type="button"
            >
              <RevealIcon />
              {getFileName(lastExportPath)} を表示
            </button>
          ) : null}
        </div>
      </section>

      <section className="export-section" aria-labelledby="composition-heading">
        <h2 className="section-title" id="composition-heading">
          出力の内訳
        </h2>
        {measure ? (
          <>
            <div className="core-strip" role="img" aria-label="章ごとの大きさ">
              {measure.sections.map((section, index) => (
                <span
                  className={cx("stratum", `stratum-${index % 6}`)}
                  key={section.anchor}
                  style={{ flexGrow: Math.max(section.byteCount, 1) }}
                  title={`${sectionLabels[section.anchor] ?? section.title}: ${formatByteSize(section.byteCount)}`}
                />
              ))}
            </div>
            <ol className="composition-list">
              {measure.sections.map((section, index) => (
                <li key={section.anchor}>
                  <span className={cx("swatch", `stratum-${index % 6}`)} aria-hidden="true" />
                  <span className="composition-name">
                    {sectionLabels[section.anchor] ?? section.title}
                  </span>
                  <span className="composition-size">{formatByteSize(section.byteCount)}</span>
                  <span className="composition-tokens">
                    {formatNumber(section.estimatedTokens)}
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="muted-text">計算が終わると章ごとの大きさを表示します。</p>
        )}
      </section>

      <section className="export-section" aria-labelledby="options-heading">
        <h2 className="section-title" id="options-heading">
          書き出しの設定
        </h2>
        <label className="option-row">
          <input
            checked={options.includeBaseComparison}
            disabled={!hasReferences}
            onChange={(event) =>
              onChangeOptions({ ...options, includeBaseComparison: event.target.checked })
            }
            type="checkbox"
          />
          <span>
            <span className="option-name">変更前の値を併記する</span>
            <span className="option-help">
              {hasReferences
                ? "既存レコードを書き換える箇所に、参照コンテキスト上の元の値と追加・削除された参照を並べます。"
                : "バニラなどの参照を読み込むと使えます。"}
            </span>
          </span>
        </label>
        <label className="option-row">
          <input
            checked={options.includeFieldGlossary}
            onChange={(event) =>
              onChangeOptions({ ...options, includeFieldGlossary: event.target.checked })
            }
            type="checkbox"
          />
          <span>
            <span className="option-name">フィールド用語集を付ける</span>
            <span className="option-help">
              出力に現れたフィールドの意味と既定値を FCS 定義から巻末にまとめます。LLM
              が数値の意味を取り違えにくくなります。
            </span>
          </span>
        </label>
      </section>

      {summary.warningCount > 0 || summary.assetMissingCount > 0 ? (
        <section className="export-section" aria-labelledby="issues-heading">
          <h2 className="section-title" id="issues-heading">
            確認が必要な点
          </h2>
          <ul className="issue-list">
            {project.failedMods.length > 0 ? (
              <li>
                <WarningIcon />
                <span>
                  {formatNumber(project.failedMods.length)} 件のファイルを解析できませんでした。
                </span>
                <button className="link-button" onClick={() => onNavigate("mods")} type="button">
                  mod 情報を見る
                </button>
              </li>
            ) : null}
            {project.missingReferencePaths.length > 0 ? (
              <li>
                <WarningIcon />
                <span>
                  見つからない参照パスが {formatNumber(project.missingReferencePaths.length)}{" "}
                  件あり、参照から外しました。
                </span>
              </li>
            ) : null}
            {project.mods.some((mod) => mod.warnings.length > 0) ? (
              <li>
                <WarningIcon />
                <span>解析時の警告がある mod があります。</span>
                <button className="link-button" onClick={() => onNavigate("mods")} type="button">
                  mod 情報を見る
                </button>
              </li>
            ) : null}
            {summary.assetMissingCount > 0 ? (
              <li>
                <WarningIcon />
                <span>
                  見つからないアセットファイルが {formatNumber(summary.assetMissingCount)}{" "}
                  件あります。
                </span>
                <button className="link-button" onClick={() => onNavigate("assets")} type="button">
                  アセットを見る
                </button>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
};
