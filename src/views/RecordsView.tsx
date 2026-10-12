import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "clsx";
import { useDeferredValue, useMemo, useRef, useState } from "react";

import { SearchIcon } from "../components/Icons.tsx";
import {
  getRecordStatus,
  recordStatusLabels,
  recordStatusOrder,
  type RecordStatus,
} from "../lib/project-stats.ts";
import { formatNumber, normaliseSearchTarget } from "../lib/utils.ts";
import { getBuiltinFcsSchema } from "../shared/fcs-builtin.ts";
import {
  getItemCategory,
  getItemTypeEnglishName,
  getItemTypeFcsName,
  getItemTypeLabel,
  itemCategoryLabels,
  type ItemCategory,
} from "../shared/item-types.ts";
import { isRemovedReference } from "../shared/mod-format.ts";
import type { InspectorRecord } from "../shared/models.ts";

interface RecordsViewProps {
  contextRecordCount: number;
  contextRecords: readonly InspectorRecord[] | null;
  loadingContext: boolean;
  onRequestContext: () => void;
  records: readonly InspectorRecord[];
}

const formatNumberValue = (value: number) => {
  const rounded = Number(value.toFixed(6));
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
};

const describeField = (record: InspectorRecord, key: string) => {
  const field = getBuiltinFcsSchema().types.get(getItemTypeFcsName(record.type))?.get(key);
  if (!field) {
    return undefined;
  }
  const kind =
    field.kind === "enum"
      ? `列挙 ${field.enumName}（既定 ${field.enumValue}）`
      : field.kind === "reference"
        ? `参照 → ${field.referenceTarget}`
        : `${field.kind}（既定 ${field.defaultText}）`;
  return field.description.length > 0 ? `${kind}\n${field.description}` : kind;
};

const matchesSearch = (record: InspectorRecord, token: string) => {
  const haystack = normaliseSearchTarget(
    [record.name, record.stringId, record.modName, getItemTypeEnglishName(record.type)].join("\n"),
  );
  if (haystack.includes(token)) {
    return true;
  }
  return record.strings.some((entry) =>
    normaliseSearchTarget(`${entry.key}\n${entry.value}`).includes(token),
  );
};

const FieldRow = ({ label, title, value }: { label: string; title?: string; value: string }) => (
  <div className="field-row">
    <dt title={title} className={cx({ "has-help": title })}>
      {label}
    </dt>
    <dd>{value}</dd>
  </div>
);

const RecordDetail = ({ record }: { record: InspectorRecord }) => {
  const values = [
    ...record.values.bools.map((entry) => ({
      key: entry.key,
      value: entry.value ? "true" : "false",
    })),
    ...record.values.ints.map((entry) => ({ key: entry.key, value: String(entry.value) })),
    ...record.values.floats.map((entry) => ({
      key: entry.key,
      value: formatNumberValue(entry.value),
    })),
    ...record.values.vector3s.map((entry) => ({
      key: entry.key,
      value: `x=${formatNumberValue(entry.x)}, y=${formatNumberValue(entry.y)}, z=${formatNumberValue(entry.z)}`,
    })),
    ...record.values.vector4s.map((entry) => ({
      key: entry.key,
      value: `x=${formatNumberValue(entry.x)}, y=${formatNumberValue(entry.y)}, z=${formatNumberValue(entry.z)}, w=${formatNumberValue(entry.w)}`,
    })),
  ];

  return (
    <div className="record-detail">
      {record.removed ? (
        <p className="detail-note">この mod はこのレコードを削除します（REMOVED フラグ）。</p>
      ) : null}
      {record.strings.length > 0 ? (
        <section>
          <h3 className="detail-title">文字列</h3>
          <dl className="field-list">
            {record.strings.map((entry) => (
              <div className="field-row field-row-text" key={`s:${entry.key}`}>
                <dt
                  className={cx({ "has-help": describeField(record, entry.key) })}
                  title={describeField(record, entry.key)}
                >
                  {entry.key}
                </dt>
                <dd>
                  <pre className="text-value">
                    {entry.value.length === 0 ? "（空）" : entry.value}
                  </pre>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {values.length > 0 ? (
        <section>
          <h3 className="detail-title">値</h3>
          <dl className="field-list field-list-compact">
            {values.map((entry) => (
              <FieldRow
                key={`v:${entry.key}`}
                label={entry.key}
                title={describeField(record, entry.key)}
                value={entry.value}
              />
            ))}
          </dl>
        </section>
      ) : null}
      {record.values.files.length > 0 ? (
        <section>
          <h3 className="detail-title">ファイル</h3>
          <dl className="field-list">
            {record.values.files.map((entry) => (
              <FieldRow
                key={`f:${entry.key}`}
                label={entry.key}
                title={describeField(record, entry.key)}
                value={entry.value.length === 0 ? "（空）" : entry.value}
              />
            ))}
          </dl>
        </section>
      ) : null}
      {record.referenceCategories.length > 0 ? (
        <section>
          <h3 className="detail-title">参照</h3>
          <dl className="field-list">
            {record.referenceCategories.map((category) => (
              <div className="field-row field-row-text" key={`r:${category.name}`}>
                <dt
                  className={cx({ "has-help": describeField(record, category.name) })}
                  title={describeField(record, category.name)}
                >
                  {category.name}
                </dt>
                <dd>
                  <ul className="reference-values">
                    {category.references.map((reference) => (
                      <li key={reference.targetId}>
                        <code>{reference.targetId}</code>
                        {isRemovedReference(reference) ? (
                          <span className="removed-tag">削除</span>
                        ) : (
                          <span className="reference-numbers">
                            {reference.value0}, {reference.value1}, {reference.value2}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {record.values.instances.length > 0 ? (
        <section>
          <h3 className="detail-title">配置インスタンス</h3>
          <ul className="reference-values">
            {record.values.instances.map((instance) => (
              <li key={instance.key}>
                <code>{instance.key}</code>
                {instance.targetId.length === 0 ? (
                  <span className="removed-tag">削除</span>
                ) : (
                  <span className="reference-numbers">
                    {instance.targetId}　位置{" "}
                    {instance.values.slice(0, 3).map(formatNumberValue).join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
};

export const RecordsView = ({
  contextRecordCount,
  contextRecords,
  loadingContext,
  onRequestContext,
  records,
}: RecordsViewProps) => {
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RecordStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | ItemCategory>("all");
  const [modFilter, setModFilter] = useState("all");
  const [includeContext, setIncludeContext] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const deferredSearch = useDeferredValue(searchText);

  const visibleRecords = useMemo(
    () => (includeContext && contextRecords ? [...records, ...contextRecords] : records),
    [contextRecords, includeContext, records],
  );
  const availableMods = useMemo(
    () =>
      [...new Set(visibleRecords.map((record) => record.modName))].sort((a, b) =>
        a.localeCompare(b, "ja"),
      ),
    [visibleRecords],
  );
  const availableCategories = useMemo(
    () => [...new Set(visibleRecords.map((record) => getItemCategory(record.type)))].sort(),
    [visibleRecords],
  );

  const filteredRecords = useMemo(() => {
    const token = normaliseSearchTarget(deferredSearch.trim());
    return visibleRecords.filter(
      (record) =>
        (modFilter === "all" || record.modName === modFilter) &&
        (categoryFilter === "all" || getItemCategory(record.type) === categoryFilter) &&
        (statusFilter === "all" || getRecordStatus(record) === statusFilter) &&
        (token.length === 0 || matchesSearch(record, token)),
    );
  }, [categoryFilter, deferredSearch, modFilter, statusFilter, visibleRecords]);

  const virtualizer = useVirtualizer({
    count: filteredRecords.length,
    estimateSize: (index) => (expandedId === filteredRecords[index]?.uid ? 420 : 58),
    getScrollElement: () => listRef.current,
    overscan: 10,
  });

  const toggleContext = (checked: boolean) => {
    setIncludeContext(checked);
    if (checked && !contextRecords) {
      onRequestContext();
    }
  };

  return (
    <div className="view records-view">
      <header className="view-header">
        <h1 className="view-title">レコード</h1>
        <p className="view-subtitle">
          {formatNumber(filteredRecords.length)} / {formatNumber(visibleRecords.length)} 件を表示
        </p>
      </header>

      <div className="records-toolbar">
        <label className="search-field">
          <SearchIcon />
          <input
            aria-label="レコードを検索"
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="名前、stringId、文字列の内容で検索"
            type="search"
            value={searchText}
          />
        </label>
        <div className="segmented" role="radiogroup" aria-label="変更の種類">
          {(["all", ...recordStatusOrder.filter((status) => status !== "Unknown")] as const).map(
            (status) => (
              <button
                aria-checked={statusFilter === status}
                className={cx("segment", status !== "all" && `status-${status.toLowerCase()}`, {
                  "is-active": statusFilter === status,
                })}
                key={status}
                onClick={() => setStatusFilter(status)}
                role="radio"
                type="button"
              >
                {status === "all" ? "すべて" : recordStatusLabels[status]}
              </button>
            ),
          )}
        </div>
        <label className="select-field">
          <span>カテゴリ</span>
          <select
            onChange={(event) => setCategoryFilter(event.target.value as "all" | ItemCategory)}
            value={categoryFilter}
          >
            <option value="all">すべて</option>
            {availableCategories.map((category) => (
              <option key={category} value={category}>
                {itemCategoryLabels[category]}
              </option>
            ))}
          </select>
        </label>
        <label className="select-field">
          <span>mod</span>
          <select onChange={(event) => setModFilter(event.target.value)} value={modFilter}>
            <option value="all">すべて</option>
            {availableMods.map((modName) => (
              <option key={modName} value={modName}>
                {modName}
              </option>
            ))}
          </select>
        </label>
        {contextRecordCount > 0 ? (
          <label className="check-field">
            <input
              checked={includeContext}
              onChange={(event) => toggleContext(event.target.checked)}
              type="checkbox"
            />
            参照レコードも含める（{formatNumber(contextRecordCount)} 件）
          </label>
        ) : null}
      </div>

      {loadingContext ? <p className="muted-text">参照レコードを読み込んでいます…</p> : null}

      {filteredRecords.length === 0 ? (
        <div className="empty-state">
          条件に合うレコードはありません。検索語やフィルタを変えてください。
        </div>
      ) : (
        <div className="record-list" ref={listRef}>
          <div className="record-list-inner" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const record = filteredRecords[virtualItem.index]!;
              const status = getRecordStatus(record);
              const isExpanded = expandedId === record.uid;
              return (
                <article
                  className={cx("record-row", { "is-expanded": isExpanded })}
                  data-index={virtualItem.index}
                  key={record.uid}
                  ref={virtualizer.measureElement}
                  style={{ transform: `translateY(${virtualItem.start}px)` }}
                >
                  <button
                    aria-expanded={isExpanded}
                    className="record-summary"
                    onClick={() =>
                      setExpandedId((current) => (current === record.uid ? null : record.uid))
                    }
                    type="button"
                  >
                    <span className={cx("status-chip", `status-${status.toLowerCase()}`)}>
                      {recordStatusLabels[status]}
                    </span>
                    <span className="record-name">
                      {record.name.length === 0 ? "（名前なし）" : record.name}
                    </span>
                    <span className="record-type">
                      {getItemTypeLabel(record.type)}
                      <span className="record-type-en">{getItemTypeEnglishName(record.type)}</span>
                    </span>
                    <code className="record-id">{record.stringId}</code>
                    <span className="record-mod">{record.modName}</span>
                  </button>
                  {isExpanded ? <RecordDetail record={record} /> : null}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
