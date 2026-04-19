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

export const InspectorView = ({ records }: InspectorViewProps) => {
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ItemCategory>(
    'all',
  );
  const [modFilter, setModFilter] = useState<'all' | string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const deferredSearch = useDeferredValue(searchText);

  const availableCategories = useMemo(
    () => gatherCategories(records),
    [records],
  );
  const availableMods = useMemo(() => {
    const names = new Set<string>();
    for (const record of records) {
      names.add(record.modName);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [records]);

  const filteredRecords = useMemo(
    () => filterRecords(records, deferredSearch, categoryFilter, modFilter),
    [categoryFilter, deferredSearch, modFilter, records],
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
            全{formatNumber(records.length)}レコード中{' '}
            {formatNumber(filteredRecords.length)} 件を表示
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
