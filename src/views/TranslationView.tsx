import {
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import cx from 'clsx';
import { ReplaceIcon } from '../components/Icons.tsx';
import {
  getItemCategory,
  getItemTypeEnglishName,
  getItemTypeLabel,
  itemCategoryLabels,
  type ItemCategory,
} from '../shared/item-types.ts';
import type {
  TranslationProject,
  TranslationRecord,
} from '../shared/models.ts';
import { formatNumber, normaliseSearchTarget } from '../lib/utils.ts';

type SectionFilter = 'all' | 'description' | 'dialog' | 'name';

const sectionLabels: Record<SectionFilter, string> = {
  all: 'すべて',
  description: '説明文',
  dialog: 'ダイアログ',
  name: '名称',
};

interface EditorRow {
  category: ItemCategory;
  id: string;
  itemIndex: number;
  original: string;
  recordIndex: number;
  section: Exclude<SectionFilter, 'all'>;
  stringId: string;
  subtitle: string;
  textId: string;
  title: string;
  translation: string;
  type: number;
}

interface TranslationViewProps {
  onDialogChange: (
    recordIndex: number,
    textIndex: number,
    value: string,
  ) => void;
  onEntityChange: (
    recordIndex: number,
    section: 'description' | 'name',
    value: string,
  ) => void;
  onReplaceAll: (
    pattern: string,
    replacement: string,
    options: { caseSensitive: boolean; regex: boolean },
  ) => number;
  project: TranslationProject;
}

const gatherCategoriesFromRecords = (records: readonly TranslationRecord[]) => {
  const categories = new Set<ItemCategory>();
  for (const record of records) {
    categories.add(getItemCategory(record.type));
  }
  return Array.from(categories).sort();
};

const buildEditorRows = (
  project: TranslationProject,
  sectionFilter: SectionFilter,
  categoryFilter: 'all' | ItemCategory,
  untranslatedOnly: boolean,
  searchText: string,
) => {
  const searchToken = normaliseSearchTarget(searchText.trim());
  const rows: EditorRow[] = [];

  project.records.forEach((record, recordIndex) => {
    const category = getItemCategory(record.type);
    if (categoryFilter !== 'all' && category !== categoryFilter) {
      return;
    }

    if (record.kind === 'dialog') {
      record.texts.forEach((text, textIndex) => {
        if (sectionFilter !== 'all' && sectionFilter !== 'dialog') {
          return;
        }

        if (untranslatedOnly && text.translation.length > 0) {
          return;
        }

        const row: EditorRow = {
          category,
          id: `${record.stringId}:dialog:${text.textId}`,
          itemIndex: textIndex,
          original: text.original,
          recordIndex,
          section: 'dialog',
          stringId: record.stringId,
          subtitle: record.name,
          textId: text.textId,
          title: 'ダイアログ',
          translation: text.translation,
          type: record.type,
        };

        if (searchToken.length === 0) {
          rows.push(row);
          return;
        }

        const haystack = normaliseSearchTarget(
          [
            row.original,
            row.translation,
            row.stringId,
            row.subtitle,
            row.textId,
          ].join('\n'),
        );

        if (haystack.includes(searchToken)) {
          rows.push(row);
        }
      });

      return;
    }

    if (sectionFilter === 'all' || sectionFilter === 'name') {
      if (!(untranslatedOnly && record.nameTranslation.length > 0)) {
        const nameRow: EditorRow = {
          category,
          id: `${record.stringId}:name`,
          itemIndex: -1,
          original: record.name,
          recordIndex,
          section: 'name',
          stringId: record.stringId,
          subtitle: getItemTypeLabel(record.type),
          textId: '',
          title: '名称',
          translation: record.nameTranslation,
          type: record.type,
        };

        const haystack = normaliseSearchTarget(
          [
            nameRow.original,
            nameRow.translation,
            nameRow.stringId,
            nameRow.subtitle,
          ].join('\n'),
        );

        if (
          searchToken.length === 0 ||
          haystack.includes(searchToken)
        ) {
          rows.push(nameRow);
        }
      }
    }

    if (
      record.description.length > 0 &&
      (sectionFilter === 'all' || sectionFilter === 'description')
    ) {
      if (!(untranslatedOnly && record.descriptionTranslation.length > 0)) {
        const descriptionRow: EditorRow = {
          category,
          id: `${record.stringId}:description`,
          itemIndex: -1,
          original: record.description,
          recordIndex,
          section: 'description',
          stringId: record.stringId,
          subtitle: record.name,
          textId: '',
          title: '説明文',
          translation: record.descriptionTranslation,
          type: record.type,
        };

        const haystack = normaliseSearchTarget(
          [
            descriptionRow.original,
            descriptionRow.translation,
            descriptionRow.stringId,
            descriptionRow.subtitle,
          ].join('\n'),
        );

        if (
          searchToken.length === 0 ||
          haystack.includes(searchToken)
        ) {
          rows.push(descriptionRow);
        }
      }
    }
  });

  return rows;
};

export const TranslationView = ({
  onDialogChange,
  onEntityChange,
  onReplaceAll,
  project,
}: TranslationViewProps) => {
  const [searchText, setSearchText] = useState('');
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ItemCategory>(
    'all',
  );
  const [untranslatedOnly, setUntranslatedOnly] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceFrom, setReplaceFrom] = useState('');
  const [replaceTo, setReplaceTo] = useState('');
  const [replaceCaseSensitive, setReplaceCaseSensitive] = useState(false);
  const [replaceRegex, setReplaceRegex] = useState(false);
  const [replaceFeedback, setReplaceFeedback] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const deferredSearchText = useDeferredValue(searchText);

  const availableCategories = useMemo(
    () => gatherCategoriesFromRecords(project.records),
    [project.records],
  );

  const editorRows = useMemo(
    () =>
      buildEditorRows(
        project,
        sectionFilter,
        categoryFilter,
        untranslatedOnly,
        deferredSearchText,
      ),
    [
      categoryFilter,
      deferredSearchText,
      project,
      sectionFilter,
      untranslatedOnly,
    ],
  );

  const virtualizer = useVirtualizer({
    count: editorRows.length,
    estimateSize: () => 360,
    getScrollElement: () => listRef.current,
    overscan: 6,
  });

  const handleRunReplace = () => {
    if (replaceFrom.length === 0) {
      setReplaceFeedback('検索する文字列を入力してください。');
      return;
    }

    try {
      const replacedCount = onReplaceAll(replaceFrom, replaceTo, {
        caseSensitive: replaceCaseSensitive,
        regex: replaceRegex,
      });

      setReplaceFeedback(
        replacedCount === 0
          ? '一致する箇所はありませんでした。'
          : `${formatNumber(replacedCount)}件を置換しました。`,
      );
    } catch (error) {
      setReplaceFeedback(
        error instanceof Error ? error.message : '置換に失敗しました。',
      );
    }
  };

  return (
    <div className="view translation-view">
      <div className="view-header">
        <div>
          <p className="eyebrow">翻訳エディタ</p>
          <h1 className="view-title">手動翻訳ワークベンチ</h1>
          <p className="view-subtitle">
            {formatNumber(editorRows.length)} 件を表示中 / 全{' '}
            {formatNumber(project.records.length)} レコード
          </p>
        </div>
        <div className="view-actions">
          <button
            aria-expanded={replaceOpen}
            className={cx('secondary-button', { 'is-active': replaceOpen })}
            onClick={() => {
              setReplaceOpen((current) => !current);
              setReplaceFeedback(null);
            }}
            type="button"
          >
            <ReplaceIcon height="16" width="16" />
            一括置換
          </button>
        </div>
      </div>

      <div className="editor-toolbar">
        <input
          className="search-input"
          onChange={(event) => {
            setSearchText(event.target.value);
          }}
          placeholder="stringID / 原文 / 翻訳 / textID を検索"
          type="search"
          value={searchText}
        />
        <div className="toolbar-segments">
          <div className="segment-row" role="tablist" aria-label="種別">
            {(Object.keys(sectionLabels) as SectionFilter[]).map((section) => (
              <button
                aria-selected={sectionFilter === section}
                className={cx('segment-button', {
                  'is-active': sectionFilter === section,
                })}
                key={section}
                onClick={() => {
                  setSectionFilter(section);
                }}
                role="tab"
                type="button"
              >
                {sectionLabels[section]}
              </button>
            ))}
          </div>
          <label className="toggle-inline">
            <input
              checked={untranslatedOnly}
              onChange={(event) => {
                setUntranslatedOnly(event.target.checked);
              }}
              type="checkbox"
            />
            <span>未翻訳のみ</span>
          </label>
        </div>
        {availableCategories.length > 1 ? (
          <div className="category-chip-row">
            <button
              className={cx('category-chip', {
                'is-active': categoryFilter === 'all',
              })}
              onClick={() => {
                setCategoryFilter('all');
              }}
              type="button"
            >
              すべて
            </button>
            {availableCategories.map((category) => (
              <button
                className={cx('category-chip', `category-${category}`, {
                  'is-active': categoryFilter === category,
                })}
                key={category}
                onClick={() => {
                  setCategoryFilter(category);
                }}
                type="button"
              >
                {itemCategoryLabels[category]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {replaceOpen ? (
        <div className="replace-panel">
          <div className="replace-inputs">
            <label className="field">
              <span>検索</span>
              <input
                onChange={(event) => setReplaceFrom(event.target.value)}
                placeholder="置換対象"
                type="text"
                value={replaceFrom}
              />
            </label>
            <label className="field">
              <span>置換後</span>
              <input
                onChange={(event) => setReplaceTo(event.target.value)}
                placeholder="新しい文字列"
                type="text"
                value={replaceTo}
              />
            </label>
          </div>
          <div className="replace-options">
            <label className="toggle-inline">
              <input
                checked={replaceCaseSensitive}
                onChange={(event) =>
                  setReplaceCaseSensitive(event.target.checked)
                }
                type="checkbox"
              />
              <span>大文字小文字を区別</span>
            </label>
            <label className="toggle-inline">
              <input
                checked={replaceRegex}
                onChange={(event) => setReplaceRegex(event.target.checked)}
                type="checkbox"
              />
              <span>正規表現</span>
            </label>
            <button
              className="primary-button"
              onClick={handleRunReplace}
              type="button"
            >
              全て置換
            </button>
          </div>
          {replaceFeedback ? (
            <p className="replace-feedback">{replaceFeedback}</p>
          ) : null}
        </div>
      ) : null}

      {editorRows.length > 0 ? (
        <div className="editor-list" ref={listRef}>
          <div
            className="editor-list-inner"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const row = editorRows[virtualItem.index];
              return (
                <article
                  className={cx(
                    'entry-card',
                    `entry-${row.section}`,
                    `category-${row.category}`,
                  )}
                  data-index={virtualItem.index}
                  key={row.id}
                  ref={virtualizer.measureElement}
                  style={{
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <div className="entry-meta">
                    <span className="entry-chip">
                      {sectionLabels[row.section]}
                    </span>
                    <span
                      className={`entry-category category-${row.category}`}
                    >
                      {itemCategoryLabels[row.category]}
                    </span>
                    <span className="entry-token">
                      {getItemTypeLabel(row.type)}
                    </span>
                    <span className="entry-token entry-token-mono">
                      {getItemTypeEnglishName(row.type)}
                    </span>
                    <span className="entry-token entry-token-mono">
                      {row.stringId}
                    </span>
                    {row.textId.length > 0 ? (
                      <span className="entry-token entry-token-mono">
                        {row.textId}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="entry-title">{row.title}</h3>
                  <p className="entry-subtitle">{row.subtitle}</p>
                  <div className="editor-columns">
                    <label className="editor-pane">
                      <span>原文</span>
                      <textarea
                        readOnly
                        spellCheck={false}
                        value={row.original}
                      />
                    </label>
                    <label className="editor-pane editor-pane-translation">
                      <span>翻訳</span>
                      <textarea
                        onChange={(event) => {
                          if (row.section === 'dialog') {
                            onDialogChange(
                              row.recordIndex,
                              row.itemIndex,
                              event.target.value,
                            );
                            return;
                          }

                          onEntityChange(
                            row.recordIndex,
                            row.section,
                            event.target.value,
                          );
                        }}
                        placeholder="ここに手動翻訳を入力"
                        spellCheck={false}
                        value={row.translation}
                      />
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          条件に一致する項目がありません。フィルタを調整してください。
        </div>
      )}
    </div>
  );
};
