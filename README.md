# kongyo-kenshi-tool

Kenshi の `.mod` を解析し、LLM に渡しやすい Markdown に変換する Electron + React 製デスクトップツールです。

## 主な機能

- `.mod` ファイル / mod フォルダの読み込み（選択・ドラッグ&ドロップ対応）
- mod情報とインスペクタレコードの確認
- 解析結果を Markdown としてエクスポート

## 開発環境

- Node.js: `^20.19.0 || >=22.12.0`
- npm

## セットアップ

```bash
npm install
npm run dev
```

## 主要コマンド

```bash
npm run typecheck
npm run lint
npm run build
npm run dist
```

## 技術スタック

- Electron
- React + TypeScript
- Vite
