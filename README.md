# 深藍 · ASCII Whales

純黑背景、固定俯視角的藍色 ASCII 鯨魚動畫。三條鯨魚沿著平滑曲線巡游，上浮時逐漸看見高背、身體、胸鰭與尾葉；下潛時，各部位依所在深度逐漸隱入黑暗。

以原生 JavaScript 與 HTML Canvas 製作。沒有套件依賴、建置步驟、外部字型、下載圖片或執行時網路請求。

## 本機執行

需要 Python 3，於專案根目錄執行：

```sh
python3 -m http.server 8080 --directory dist
```

開啟 <http://localhost:8080>。也可以將 `dist/` 放到任何靜態網頁主機。

## 操作

| 控制 | 效果 |
| --- | --- |
| 自動 | 三條鯨魚各自巡游，交錯上浮與下潛 |
| 上浮／下潛 | 全部鯨魚平滑移向淺水／深水端點 |
| 深度滑桿 | 直接設定所有鯨魚的深度，暫停時也能使用 |
| 暫停／空白鍵 | 停止或恢復游動與形變 |
| 流速 | 調整為 0.5×–1.5× |
| 點擊／輕觸畫面 | 引導主鯨轉向該位置 |
| `1`／`2`／`3` | 自動／上浮／下潛 |

在自動模式下，深度讀值跟隨主鯨。公尺刻度是視覺控制尺度，不代表實際海水的光學量測。系統開啟減少動態效果時，場景預設暫停；分頁隱藏時不推進模擬時間。

## 立體模型如何變成 2D 字元

攝影機沿 Z 軸垂直向下，採用正交投影。每個表面取樣點都有 XYZ 座標與法向量，再將可見表面投影成 Canvas 字元格。

- **身體**：沿脊椎排列不同大小的橢圓截面，形成厚實的鈍頭、高背與逐漸收窄的尾柄。
- **胸鰭**：以低於背部、帶厚度的傾斜曲面建模。
- **尾葉**：左右兩片寬尾葉有曲線邊緣與中央凹口，沿 Z 軸一起擺動。
- **動作**：頭部引導受彎曲限制的脊椎鏈，小幅俯仰與側傾同時改變投影輪廓、表面法向量與局部深度。
- **光照與遮擋**：使用法向量計算漫射與少量鏡面光；深度緩衝處理同一條鯨魚與不同鯨魚之間的遮擋。
- **邊界**：將身體、胸鰭與尾葉的投影一起納入邊界限制，鯨魚尺寸隨畫面調整。

桌面字元格為 6 CSS px，行動版為 4 px。每格先畫暗藍底塊，再畫較亮的等寬字元；兩層都使用該表面點的深度與光照結果。

### 逐部位浮現與消失

每個表面點獨立計算水下距離與可見度：

```text
D = (60 + 190 × normalizedDepth) − transformedSurfaceZ
visibility = exp(−0.0048 × max(D, 0))
             × smooth(clamp((168 − max(D, 0)) / 125, 0, 1))
smooth(t) = t²(3 − 2t)
```

因此高背與頭部先浮現，較低的身體邊緣、胸鰭與尾葉稍後出現；下沉時順序反轉。這是各取樣點的亮度與可見性變化，並非整張鯨魚圖片一起改透明度。最深處所有點都超出可見範圍，畫布完全回到黑色。少量漣漪只出現在淺處或點擊附近，深潛消失時也會被抑制。

## 參考來源與致謝

| 來源 | 參考關係 |
| --- | --- |
| [Dao Ho 的個人網站](https://www.daoho.dev/) | 本作品最直接的視覺參考：彩色 ASCII 魚群、黑底與自然巡游的呈現方式。 |
| [Dao-Ho/portfolio · koi-pond 原始碼](https://github.com/Dao-Ho/portfolio/tree/main/src/app/components/koi-pond) | 研究其 Canvas 字元繪製、魚群行為及脊椎運動的實作概念。 |
| [stackedlol/ascii-sharks](https://github.com/stackedlol/ascii-sharks) | 延伸視覺參考：以字元呈現水生動物。未作為本專案的程式依賴。 |

Dao Ho 錦鯉程式的閱讀入口（固定於 commit `914651c33f254e52bfee9dca5164264c2c33ebfe`，方便對照）：

- [魚群行為](https://github.com/Dao-Ho/portfolio/blob/914651c33f254e52bfee9dca5164264c2c33ebfe/src/app/components/koi-pond/world.ts#L273-L381)
- [脊椎節點與彎曲約束](https://github.com/Dao-Ho/portfolio/blob/914651c33f254e52bfee9dca5164264c2c33ebfe/src/app/components/koi-pond/world.ts#L383-L434)
- [身體波動](https://github.com/Dao-Ho/portfolio/blob/914651c33f254e52bfee9dca5164264c2c33ebfe/src/app/components/koi-pond/renderer.ts#L396-L430)
- [彩色字元繪製](https://github.com/Dao-Ho/portfolio/blob/914651c33f254e52bfee9dca5164264c2c33ebfe/src/app/components/koi-pond/renderer.ts#L590-L605)
- [動畫更新循環](https://github.com/Dao-Ho/portfolio/blob/914651c33f254e52bfee9dca5164264c2c33ebfe/src/app/components/koi-pond/koi-pond.tsx#L133-L151)

### 獨立實作與授權邊界

檢查 Dao-Ho/portfolio 時，未找到適用於整個原始碼專案的一般授權宣告；其中字型的授權不等於整份程式的授權。因此本專案僅參考視覺效果與概念，沒有複製其程式碼、字型或素材。鯨魚幾何、浮沉模型、模擬、繪圖程式與介面均為獨立實作。

ascii-sharks 的儲存庫標示 MIT 授權；本專案未複製其程式碼或素材，也未把它列為依賴。上述參考專案的授權各自適用於其原作，不會自動套用到本專案。

藍色鯨魚的方向受到 DeepSeek 視覺印象啟發；鯨魚形狀自行設計，本作品並非 DeepSeek 官方產品。

## 檔案

```text
dist/
  index.html   繁體中文介面與 Canvas
  styles.css   黑底、響應式控制列與無障礙樣式
  app.js       XYZ 曲面、法向量、投影、深度可見度與游動模擬
README.md      操作、實作概念、驗證與參考來源
```

## 驗證

```sh
node --check dist/app.js
```

瀏覽器可先暫停，再將深度由 100 拉向 0，以同一姿勢檢查高背、身體與低位鰭依序出現；深度 100 時，動畫畫布應完全黑色。另需檢查桌面、手機、點擊引導與鍵盤操作。

`#ocean` 提供 `data-depth-normalized`、`data-visible-cells`、`data-main-body-cells`、`data-main-fin-cells`、`data-main-tail-cells` 等 DOM 屬性，方便檢查浮沉各階段。個別鯨魚的格數在鯨魚間遮擋之前計算，整體格數則取自合併後的可見緩衝。
