import cx from "clsx";
import { useMemo, useState } from "react";

import { RevealIcon } from "../components/Icons.tsx";
import { formatNumber } from "../lib/utils.ts";
import type { AssetReference, AssetStatus } from "../shared/models.ts";

const statusLabels: Record<AssetStatus, string> = {
  dependency: "他の mod にある",
  game: "ゲーム本体にある",
  missing: "見つからない",
  mod: "mod フォルダにある",
  unchecked: "確認できない",
};

const statusOrder: readonly AssetStatus[] = ["missing", "unchecked", "mod", "dependency", "game"];

interface AssetsViewProps {
  assets: readonly AssetReference[];
  onRevealFile: (filePath: string) => void;
}

export const AssetsView = ({ assets, onRevealFile }: AssetsViewProps) => {
  const counts = useMemo(() => {
    const result = new Map<AssetStatus, number>();
    for (const asset of assets) {
      result.set(asset.status, (result.get(asset.status) ?? 0) + 1);
    }
    return result;
  }, [assets]);
  const [filter, setFilter] = useState<"all" | AssetStatus>(() =>
    (counts.get("missing") ?? 0) > 0 ? "missing" : "all",
  );

  const visible = useMemo(
    () =>
      [...assets]
        .filter((asset) => filter === "all" || asset.status === filter)
        .sort(
          (left, right) =>
            statusOrder.indexOf(left.status) - statusOrder.indexOf(right.status) ||
            left.path.localeCompare(right.path, "en"),
        ),
    [assets, filter],
  );

  return (
    <div className="view assets-view">
      <header className="view-header">
        <h1 className="view-title">アセット</h1>
        <p className="view-subtitle">
          レコードのファイル欄が指すメッシュ・テクスチャ・物理データなど{" "}
          {formatNumber(assets.length)} 件の所在を確かめました。
        </p>
      </header>

      {assets.length === 0 ? (
        <div className="empty-state">この mod のレコードはファイルを参照していません。</div>
      ) : (
        <>
          <div className="segmented" role="radiogroup" aria-label="所在で絞り込む">
            <button
              aria-checked={filter === "all"}
              className={cx("segment", { "is-active": filter === "all" })}
              onClick={() => setFilter("all")}
              role="radio"
              type="button"
            >
              すべて {formatNumber(assets.length)}
            </button>
            {statusOrder
              .filter((status) => (counts.get(status) ?? 0) > 0)
              .map((status) => (
                <button
                  aria-checked={filter === status}
                  className={cx("segment", `asset-${status}`, { "is-active": filter === status })}
                  key={status}
                  onClick={() => setFilter(status)}
                  role="radio"
                  type="button"
                >
                  {statusLabels[status]} {formatNumber(counts.get(status) ?? 0)}
                </button>
              ))}
          </div>

          <table className="asset-table">
            <thead>
              <tr>
                <th scope="col">所在</th>
                <th scope="col">種類</th>
                <th scope="col">パス</th>
                <th scope="col">フィールド</th>
                <th scope="col" className="numeric">
                  レコード
                </th>
                <th scope="col">
                  <span className="visually-hidden">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((asset) => (
                <tr className={`asset-row asset-${asset.status}`} key={asset.path}>
                  <td>{statusLabels[asset.status]}</td>
                  <td>{asset.kind}</td>
                  <td>
                    <code>{asset.path}</code>
                  </td>
                  <td>{asset.fieldKeys.join("、")}</td>
                  <td className="numeric">{formatNumber(asset.recordCount)}</td>
                  <td>
                    {asset.resolvedPath ? (
                      <button
                        aria-label={`${asset.path} をエクスプローラーで表示`}
                        className="icon-button"
                        onClick={() => onRevealFile(asset.resolvedPath!)}
                        type="button"
                      >
                        <RevealIcon />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
};
