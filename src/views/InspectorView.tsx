import {
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import cx from 'clsx';
import {
  getItemCategory,
  getItemTypeEnglishName,
  getItemTypeLabel,
  itemCategoryLabels,
  type ItemCategory,
} from '../shared/item-types.ts';
import type { InspectorRecord } from '../shared/models.ts';
import { formatNumber, normaliseSearchTarget } from '../lib/utils.ts';

interface InspectorViewProps {
  contextRecords: readonly InspectorRecord[];
  records: readonly InspectorRecord[];
}

const gatherCategories = (records: readonly InspectorRecord[]) => {
  const categories = new Set<ItemCategory>();
  for (const record of records) {
    categories.add(getItemCategory(record.type));
  }
  return Array.from(categories).sort();
};

const filterRecords = (
  records: readonly InspectorRecord[],
  search: string,
  category: 'all' | ItemCategory,
  modName: 'all' | string,
) => {
  const searchToken = normaliseSearchTarget(search.trim());

  return records.filter((record) => {
    if (modName !== 'all' && record.modName !== modName) {
      return false;
    }

    if (category !== 'all' && getItemCategory(record.type) !== category) {
      return false;
    }

    if (searchToken.length === 0) {
      return true;
    }

    const haystack = normaliseSearchTarget(
      [
        record.name,
        record.stringId,
        record.modName,
        getItemTypeEnglishName(record.type),
      ].join('\n'),
    );

    if (haystack.includes(searchToken)) {
      return true;
    }

    for (const entry of record.strings) {
      const stringHaystack = normaliseSearchTarget(
        `${entry.key}\n${entry.value}`,
      );
      if (stringHaystack.includes(searchToken)) {
        return true;
      }
    }

    return false;
  });
};

const formatNumberValue = (value: number) => {
  const rounded = Number(value.toFixed(6));
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
};

export const InspectorView = ({
  contextRecords,
  records,
}: InspectorViewProps) => {
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ItemCategory>(
    'all',
  );
  const [modFilter, setModFilter] = useState<'all' | string>('all');
  const [includeContextRecords, setIncludeContextRecords] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const deferredSearch = useDeferredValue(searchText);
  const visibleRecords = useMemo(
    () =>
      includeContextRecords ? [...records, ...contextRecords] : [...records],
    [contextRecords, includeContextRecords, records],
  );

  const availableCategories = useMemo(
    () => gatherCategories(visibleRecords),
    [visibleRecords],
  );
  const availableMods = useMemo(() => {
    const names = new Set<string>();
    for (const record of visibleRecords) {
      names.add(record.modName);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [visibleRecords]);

  const filteredRecords = useMemo(
    () =>
      filterRecords(visibleRecords, deferredSearch, categoryFilter, modFilter),
    [categoryFilter, deferredSearch, modFilter, visibleRecords],
  );

  const virtualizer = useVirtualizer({
    count: filteredRecords.length,
    estimateSize: (index) => {
      const record = filteredRecords[index];
      return expandedId === record.uid ? 520 : 132;
    },
    getScrollElement: () => listRef.current,
    overscan: 8,
  });

  const toggleExpanded = (key: string) => {
    setExpandedId((current) => (current === key ? null : key));
    virtualizer.measure();
  };

  return (
    <div className="view inspector-view">
      <div className="view-header">
        <div>
          <p className="eyebrow">modインスペクタ</p>
          <h1 className="view-title">レコードブラウザ</h1>
          <p className="view-subtitle">
            対象 {formatNumber(records.length)} レコード中{' '}
            {formatNumber(filteredRecords.length)} 件を表示
            {includeContextRecords && contextRecords.length > 0
              ? ` / 参照 ${formatNumber(contextRecords.length)} レコード込み`
              : ''}
          </p>
        </div>
      </div>

      <div className="inspector-toolbar">
        <input
          className="search-input"
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="名前 / stringId / 文字列キー / 値 を検索"
          type="search"
          value={searchText}
        />
        <div className="filter-row">
          {contextRecords.length > 0 ? (
            <label className="toggle-inline">
              <input
                checked={includeContextRecords}
                onChange={(event) =>
                  setIncludeContextRecords(event.target.checked)
                }
                type="checkbox"
              />
              参照レコードも表示
            </label>
          ) : null}
          <label className="select-field">
            <span>mod</span>
            <select
              onChange={(event) =>
                setModFilter(event.target.value as 'all' | string)
              }
              value={modFilter}
            >
              <option value="all">すべて ({formatNumber(availableMods.length)})</option>
              {availableMods.map((modName) => (
                <option key={modName} value={modName}>
                  {modName}
                </option>
              ))}
            </select>
          </label>
          <label className="select-field">
            <span>カテゴリ</span>
            <select
              onChange={(event) =>
                setCategoryFilter(event.target.value as 'all' | ItemCategory)
              }
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
        </div>
      </div>

      {filteredRecords.length === 0 ? (
        <div className="empty-state">
          条件に一致するレコードがありません。
        </div>
      ) : (
        <div className="inspector-list" ref={listRef}>
          <div
            className="inspector-list-inner"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const record = filteredRecords[virtualItem.index];
              const category = getItemCategory(record.type);
              const isExpanded = expandedId === record.uid;

              return (
                <article
                  className={cx(
                    'inspector-card',
                    `category-${category}`,
                    { 'is-expanded': isExpanded },
                  )}
                  data-index={virtualItem.index}
                  key={record.uid}
                  ref={virtualizer.measureElement}
                  style={{
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <button
                    className="inspector-card-header"
                    onClick={() => toggleExpanded(record.uid)}
                    type="button"
                  >
                    <div className="inspector-card-primary">
                      <span
                        className={`entry-category category-${category}`}
                      >
                        {itemCategoryLabels[category]}
                      </span>
                      <span className="entry-token">
                        {getItemTypeLabel(record.type)}
                      </span>
                      <span className="entry-token entry-token-mono">
                        {getItemTypeEnglishName(record.type)}
                      </span>
                      <span className="entry-token entry-token-mono">
                        {record.stringId}
                      </span>
                      <span className="entry-token">{record.modName}</span>
                    </div>
                    <h3 className="inspector-card-name">
                      {record.name.length === 0 ? '(名前なし)' : record.name}
                    </h3>
                    <div className="inspector-counts">
                      <span>文字列 {formatNumber(record.counts.strings)}</span>
                      <span>bool {formatNumber(record.counts.bools)}</span>
                      <span>float {formatNumber(record.counts.floats)}</span>
                      <span>int {formatNumber(record.counts.ints)}</span>
                      <span>v3 {formatNumber(record.counts.vector3s)}</span>
                      <span>v4 {formatNumber(record.counts.vector4s)}</span>
                      <span>file {formatNumber(record.counts.files)}</span>
                      <span>
                        参照 {formatNumber(record.counts.references)}(
                        {formatNumber(record.counts.referenceCategories)})
                      </span>
                      <span>
                        配置 {formatNumber(record.counts.instances)}
                      </span>
                    </div>
                  </button>
                  {isExpanded ? (
                    <div className="inspector-card-body">
                      <h4>文字列フィールド</h4>
                      {record.strings.length === 0 ? (
                        <p className="subtle-text">
                          文字列フィールドはありません。
                        </p>
                      ) : (
                        <ul className="string-list">
                          {record.strings.map((entry, entryIndex) => (
                            <li
                              className="string-list-row"
                              key={`${entry.key}:${entryIndex}`}
                            >
                              <span className="string-key">{entry.key}</span>
                              <pre className="string-value">
                                {entry.value.length === 0
                                  ? '(空文字)'
                                  : entry.value}
                              </pre>
                            </li>
                          ))}
                        </ul>
                      )}
                      <h4>プリミティブ値</h4>
                      {record.values.bools.length === 0 &&
                      record.values.ints.length === 0 &&
                      record.values.floats.length === 0 ? (
                        <p className="subtle-text">
                          bool / int / float フィールドはありません。
                        </p>
                      ) : (
                        <ul className="string-list">
                          {record.values.bools.map((entry, entryIndex) => (
                            <li
                              className="string-list-row"
                              key={`bool:${entry.key}:${entryIndex}`}
                            >
                              <span className="string-key">{entry.key}</span>
                              <pre className="string-value">
                                {entry.value ? 'true' : 'false'}
                              </pre>
                            </li>
                          ))}
                          {record.values.ints.map((entry, entryIndex) => (
                            <li
                              className="string-list-row"
                              key={`int:${entry.key}:${entryIndex}`}
                            >
                              <span className="string-key">{entry.key}</span>
                              <pre className="string-value">{entry.value}</pre>
                            </li>
                          ))}
                          {record.values.floats.map((entry, entryIndex) => (
                            <li
                              className="string-list-row"
                              key={`float:${entry.key}:${entryIndex}`}
                            >
                              <span className="string-key">{entry.key}</span>
                              <pre className="string-value">
                                {formatNumberValue(entry.value)}
                              </pre>
                            </li>
                          ))}
                        </ul>
                      )}
                      {record.values.files.length > 0 ? (
                        <>
                          <h4>ファイルフィールド</h4>
                          <ul className="string-list">
                            {record.values.files.map((entry, entryIndex) => (
                              <li
                                className="string-list-row"
                                key={`file:${entry.key}:${entryIndex}`}
                              >
                                <span className="string-key">{entry.key}</span>
                                <pre className="string-value">
                                  {entry.value.length === 0
                                    ? '(空文字)'
                                    : entry.value}
                                </pre>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      {record.values.vector3s.length > 0 ||
                      record.values.vector4s.length > 0 ? (
                        <>
                          <h4>ベクトルフィールド</h4>
                          <ul className="string-list">
                            {record.values.vector3s.map((entry, entryIndex) => (
                              <li
                                className="string-list-row"
                                key={`v3:${entry.key}:${entryIndex}`}
                              >
                                <span className="string-key">{entry.key}</span>
                                <pre className="string-value">
                                  {`x=${formatNumberValue(entry.x)}, y=${formatNumberValue(entry.y)}, z=${formatNumberValue(entry.z)}`}
                                </pre>
                              </li>
                            ))}
                            {record.values.vector4s.map((entry, entryIndex) => (
                              <li
                                className="string-list-row"
                                key={`v4:${entry.key}:${entryIndex}`}
                              >
                                <span className="string-key">{entry.key}</span>
                                <pre className="string-value">
                                  {`x=${formatNumberValue(entry.x)}, y=${formatNumberValue(entry.y)}, z=${formatNumberValue(entry.z)}, w=${formatNumberValue(entry.w)}`}
                                </pre>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      {record.referenceCategories.length > 0 ? (
                        <>
                          <h4>参照カテゴリ</h4>
                          <ul className="string-list">
                            {record.referenceCategories.map(
                              (referenceCategory, categoryIndex) => (
                                <li
                                  className="string-list-row"
                                  key={`ref:${referenceCategory.name}:${categoryIndex}`}
                                >
                                  <span className="string-key">
                                    {referenceCategory.name}
                                  </span>
                                  <pre className="string-value">
                                    {referenceCategory.references.length === 0
                                      ? '(参照なし)'
                                      : referenceCategory.references
                                          .map(
                                            (reference) =>
                                              `${reference.targetId} (v0=${reference.value0}, v1=${reference.value1}, v2=${reference.value2})`,
                                          )
                                          .join('\n')}
                                  </pre>
                                </li>
                              ),
                            )}
                          </ul>
                        </>
                      ) : null}
                      {record.values.instances.length > 0 ? (
                        <>
                          <h4>インスタンス</h4>
                          <ul className="string-list">
                            {record.values.instances.map(
                              (entry, entryIndex) => (
                                <li
                                  className="string-list-row"
                                  key={`instance:${entry.key}:${entryIndex}`}
                                >
                                  <span className="string-key">
                                    {entry.key}
                                  </span>
                                  <pre className="string-value">
                                    {[
                                      `target=${entry.targetId}`,
                                      `values=${entry.values
                                        .map(formatNumberValue)
                                        .join(', ')}`,
                                      entry.states.length > 0
                                        ? `states=${entry.states.join(', ')}`
                                        : '',
                                    ]
                                      .filter((part) => part.length > 0)
                                      .join('\n')}
                                  </pre>
                                </li>
                              ),
                            )}
                          </ul>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
