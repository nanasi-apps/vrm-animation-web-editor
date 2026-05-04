# VRM Animation Web Editor

VRMモデル用のアニメーションをブラウザ上で作成・編集できるWebエディターです。VRMアニメーション（VRMA）形式のエクスポートに対応し、Three.jsとthree-vrmライブラリを使用して3Dプレビューを提供します。

## 特徴

- **VRMモデルのインポート**: VRM 1.0形式のモデルをブラウザにドラッグ＆ドロップで読み込み
- **タイムライン編集**: 直感的なタイムラインUIでアニメーションを作成
- **多様なトラック対応**:
  - ボーン回転トラック（Humanoidボーン対応）
  - 腰移動トラック
  - 表情トラック（プリセット・カスタム表情）
  - 注視点（LookAt）トラック
- **キーフレーム編集**: キーフレームの追加、編集、削除が可能
- **補間方式**: 線形補間（LINEAR）とステップ補間（STEP）を切り替え可能
- **リアルタイムプレビュー**: 3Dビューポートでアニメーションを即座に確認
- **VRMAエクスポート**: 作成したアニメーションをVRM Animation形式で出力
- **アニメーション生成**: 各種パラメータからアニメーションを自動生成
- **バリデーション**: ドキュメントの検証と診断情報の表示

## 技術スタック

### フロントエンド

- **Vue 3** + TypeScript
- **Three.js** + **@pixiv/three-vrm** (VRMモデル表示)
- **Element Plus** (UIコンポーネント)
- **Pinia** (状態管理)
- **Vue Router** (ルーティング)

### ツールチェーン

- **Vite+** (統合開発ツール)
- **Vite** (ビルドツール)
- **Vitest** (テストランナー)
- **Oxlint** (リンター)
- **Oxfmt** (フォーマッター)

### バックエンド（オプション）

- **Hono** on Cloudflare Workers
- **oRPC** (型安全なAPI)

## 必要条件

- Node.js 22.12.0 以上
- pnpm 10.33.0
- 横幅 1350px 以上の画面（モバイル・タブレット非対応）

## 開発環境のセットアップ

依存関係をインストールします：

```bash
vp install
```

フロントエンドとバックエンドを同時に開発モードで起動します：

```bash
vp run dev
```

- フロントエンド: `http://127.0.0.1:5173`
- バックエンドAPI: `http://127.0.0.1:8787`（必要な場合）

## 利用可能なコマンド

### 開発

```bash
vp run dev                # 開発サーバーを起動
```

### コード品質

```bash
vp run format             # フォーマットチェック
vp run format:write       # フォーマットを自動修正
vp run lint               # リント実行
vp run typecheck          # 型チェック
vp run test               # テスト実行
```

### ビルド

```bash
vp run build              # プロジェクトをビルド
```

ビルド後、`apps/website/dist` に静的ファイルが生成されます。

### デプロイ

```bash
vp run deploy             # Cloudflare Workersにデプロイ
vp run deploy:dry-run     # ドライラン（実際にはデプロイしない）
```

### すべてのチェックを実行

```bash
vp run ready              # format → lint → typecheck → test → build
```

## プロジェクト構造

```
apps/
  website/               # Vue 3 フロントエンド
    src/
      components/editor/ # エディターコンポーネント
        FileImportPanel.vue      # ファイルインポート
        PreviewViewport.vue      # 3Dプレビュー
        TimelinePanel.vue        # タイムライン
        TrackList.vue           # トラック一覧
        KeyframeInspector.vue   # キーフレーム編集
        PlaybackPanel.vue       # 再生コントロール
        AnimationGeneratorPanel.vue  # アニメーション生成
        ExportPanel.vue         # エクスポート
        ValidationPanel.vue     # バリデーション
      domain/vrma/       # VRMアニメーションドメイン
        types.ts         # 型定義
        document.ts      # ドキュメント操作
        generators.ts    # アニメーション生成
        validation.ts    # バリデーション
        io.ts            # 入出力（VRMA形式）
        sampling.ts      # サンプリング
        rotation.ts      # 回転演算
        constants.ts     # 定数
      stores/
        animation-editor.ts  # Piniaストア
      views/
        HomeView.vue     # メインエディター画面
  backend/               # Hono バックエンド（オプション）

packages/
  contract/              # 共有oRPCコントラクト
```

## VRM Animation (VRMA) について

VRM Animationは、VRMモデルに対して適用できるアニメーションデータの標準規格です。人間型ボーンの回転、腰の移動、表情の変化、視線の方向などをキーフレームアニメーションとして記録できます。

詳細については [VRM仕様書](https://vrm.dev/vrm-animation/) をご参照ください。

## ライセンス

[ライセンス情報をここに記入してください]

## 貢献

プルリクエストやイシューの報告を歓迎します。
