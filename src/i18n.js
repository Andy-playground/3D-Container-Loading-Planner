// i18n — per SDD NFR-7, M4-4
// Two locales: zh-Hant (default) and en. UI strings only.
// Cargo names are user-supplied data and stay as-is.

const STORAGE_KEY = 'clp:lang';

const dict = {
  'zh-Hant': {
    title: '3D 貨櫃裝載規劃器',
    pack: '▶ 裝載',
    clear: '清除',
    importJson: '匯入 JSON',
    exportJson: '匯出 JSON',
    exportTxt: '匯出 TXT',
    exportCsv: '匯出 CSV',
    exportPdf: '列印 / PDF',
    loadDemo: '載入示範',
    notPackedYet: '尚未裝載',
    chooseContainer: '選擇貨櫃',
    addCargoType: '新增貨物類型',
    name: '名稱',
    lengthCm: '長 (cm)',
    widthCm: '寬 (cm)',
    heightCm: '高 (cm)',
    weightKg: '重量 (kg/箱)',
    quantity: '數量',
    color: '顏色',
    maxStackLayers: '最大堆疊層數',
    maxLoadOnTopKg: '頂壓上限 (kg)',
    supportRatioPct: '支撐比例下限 (%)',
    priority: '裝載優先權',
    priorityNormal: 'normal（一般）',
    priorityUrgent: 'urgent（急件，優先排）',
    priorityLifo: 'lifo（後進先出）',
    yawLabel: 'Yaw 平面 90° 旋轉（L↔W）',
    pitchLabel: 'Pitch 翻轉（W↔H，需取消 ↑）',
    rollLabel: 'Roll 翻轉（L↔H，需取消 ↑）',
    thisSideUpLabel: '↑ This Side Up（鎖定 Pitch/Roll）',
    addCargo: '+ 加入貨物',
    definedCargo: '已定義貨物',
    noCargoYet: '尚未新增任何貨物',
    displayOptions: '顯示選項',
    opacity: '透明度',
    showLabels: '顯示貨物名稱（5 個面）',
    showCog: '顯示重心 (COG)',
    cargoDetails: '貨物明細',
    container: '貨櫃',
    pos: '位置（左下後角）',
    actualDims: '實際尺寸 (L×W×H)',
    orientation: '方向',
    weight: '重量',
    topLoadLimit: '頂壓上限',
    constraints: '限制',
    confirmClear: '確定清除所有貨物？',
    confirmDemo: '載入示範資料將覆蓋目前內容，確定？',
    addAtLeastOne: '請先新增至少一種貨物',
    inputValidPositive: '請輸入有效的尺寸與數量（正數）',
    confirmOverwrite: '將覆蓋目前所有資料，確定？',
    jsonError: 'JSON 格式錯誤：',
    placedLabel: '已裝載',
    unplacedLabel: '未裝載',
    containersNeeded: '所需貨櫃',
    boxes: '箱',
    units: '個',
    volume: '體積',
    cog: '重心',
    axleFront: '前軸',
    axleRear: '後軸',
    imbalance: '前後不均',
    balanced: '✓ 軸載均衡',
    notBalanced: '⚠ 軸載偏移過大',
    lang: 'Language',
    exportMenu: '匯出 ▾',
    planTitle: '計畫名稱',
    planTitlePlaceholder: '未命名計畫',
    preset: '常用尺寸',
    presetPick: '— 選擇常用尺寸（自動帶入表單）—',
    groupSameSkuLabel: '同類貨物聚集擺放',
    updateCargo: '✓ 更新貨物',
    cancelEdit: '取消編輯',
    editTitle: '編輯',
    duplicateTitle: '複製',
    hideTitle: '顯示／隱藏',
    customContainer: '自訂貨櫃',
    addCustomContainer: '+ 新增自訂貨櫃',
    containerName: '貨櫃名稱',
    payloadKgLabel: '載重上限 (kg)',
    saveCustomContainer: '儲存貨櫃',
    deleteCustomContainer: '刪除此自訂貨櫃',
    confirmDeleteContainer: '確定刪除此自訂貨櫃？',
    invalidContainerInput: '請輸入有效的貨櫃尺寸與載重（正數）',
    autoContainer: '⚙ 自動選擇最佳貨櫃 (AUTO)',
    autoChosen: '自動選櫃',
    importCsv: '匯入 CSV',
    csvTemplate: '下載 CSV 範本',
    csvError: 'CSV 解析錯誤：',
    csvImportedPrefix: '已匯入貨物類型：',
    exportPng: '匯出 3D 截圖 (PNG)',
    loadingSequence: '裝載順序',
    seqStep: '步驟',
    seqAll: '全部',
    reasonOversize: '超出貨櫃尺寸',
    reasonOverweight: '單件超過載重',
    reasonNospace: '空間不足',
    lateralOk: '✓ 左右平衡',
    lateralWarn: '⚠ 左右偏載',
    lateralOffset: '橫向偏移',
    loadSeqCol: '裝載序',
    snapshot3d: '3D 快照',
    cargoSummary: '貨物彙總',
    printTitle: '貨櫃裝載計畫',
    generated: '產生時間',
    totalContainers: '貨櫃總數',
    totalItems: '總箱數',
    sourceCargo: '來源',
    seq: '序',
    rotationLabel: '方向',
    pageOf: '頁',
    cogShortAxis: 'X 縱向 / Y 橫向 / Z 垂直',
  },
  'en': {
    title: '3D Container Loading Planner',
    pack: '▶ Pack',
    clear: 'Clear',
    importJson: 'Import JSON',
    exportJson: 'Export JSON',
    exportTxt: 'Export TXT',
    exportCsv: 'Export CSV',
    exportPdf: 'Print / PDF',
    loadDemo: 'Load Demo',
    notPackedYet: 'Not packed yet',
    chooseContainer: 'Container',
    addCargoType: 'Add Cargo Type',
    name: 'Name',
    lengthCm: 'L (cm)',
    widthCm: 'W (cm)',
    heightCm: 'H (cm)',
    weightKg: 'Weight (kg/box)',
    quantity: 'Quantity',
    color: 'Color',
    maxStackLayers: 'Max stack layers',
    maxLoadOnTopKg: 'Max load on top (kg)',
    supportRatioPct: 'Min support ratio (%)',
    priority: 'Loading priority',
    priorityNormal: 'normal',
    priorityUrgent: 'urgent (load first)',
    priorityLifo: 'lifo (last in, first out)',
    yawLabel: 'Yaw 90° rotation (L↔W)',
    pitchLabel: 'Pitch flip (W↔H, requires unchecking ↑)',
    rollLabel: 'Roll flip (L↔H, requires unchecking ↑)',
    thisSideUpLabel: '↑ This Side Up (locks Pitch/Roll)',
    addCargo: '+ Add cargo',
    definedCargo: 'Defined cargo',
    noCargoYet: 'No cargo defined yet',
    displayOptions: 'Display options',
    opacity: 'Opacity',
    showLabels: 'Show cargo name on faces',
    showCog: 'Show center of gravity (COG)',
    cargoDetails: 'Cargo details',
    container: 'Container',
    pos: 'Position (back-left-floor)',
    actualDims: 'Actual L×W×H',
    orientation: 'Orientation',
    weight: 'Weight',
    topLoadLimit: 'Top-load limit',
    constraints: 'Constraints',
    confirmClear: 'Clear all cargo?',
    confirmDemo: 'Loading demo will overwrite current data. Continue?',
    addAtLeastOne: 'Add at least one cargo type first',
    inputValidPositive: 'Enter valid positive dimensions and quantity',
    confirmOverwrite: 'This will overwrite all current data. Continue?',
    jsonError: 'JSON parse error: ',
    placedLabel: 'Placed',
    unplacedLabel: 'Unplaced',
    containersNeeded: 'Containers needed',
    boxes: 'boxes',
    units: '',
    volume: 'Vol',
    cog: 'COG',
    axleFront: 'Front axle',
    axleRear: 'Rear axle',
    imbalance: 'Front/rear delta',
    balanced: '✓ Axle load balanced',
    notBalanced: '⚠ Axle load imbalanced',
    lang: '中文',
    exportMenu: 'Export ▾',
    planTitle: 'Plan title',
    planTitlePlaceholder: 'Untitled plan',
    preset: 'Presets',
    presetPick: '— Pick a preset (fills form) —',
    groupSameSkuLabel: 'Group same SKU together',
    updateCargo: '✓ Update cargo',
    cancelEdit: 'Cancel edit',
    editTitle: 'Edit',
    duplicateTitle: 'Duplicate',
    hideTitle: 'Show/hide',
    customContainer: 'Custom container',
    addCustomContainer: '+ Add custom container',
    containerName: 'Container name',
    payloadKgLabel: 'Max payload (kg)',
    saveCustomContainer: 'Save container',
    deleteCustomContainer: 'Delete this custom container',
    confirmDeleteContainer: 'Delete this custom container?',
    invalidContainerInput: 'Enter valid positive container dimensions and payload',
    autoContainer: '⚙ Auto-select best container (AUTO)',
    autoChosen: 'Auto-selected',
    importCsv: 'Import CSV',
    csvTemplate: 'CSV template',
    csvError: 'CSV parse error: ',
    csvImportedPrefix: 'Imported cargo types: ',
    exportPng: 'Export 3D snapshot (PNG)',
    loadingSequence: 'Loading sequence',
    seqStep: 'Step',
    seqAll: 'All',
    reasonOversize: 'exceeds container dimensions',
    reasonOverweight: 'exceeds container payload',
    reasonNospace: 'no space left',
    lateralOk: '✓ Laterally balanced',
    lateralWarn: '⚠ Lateral imbalance',
    lateralOffset: 'Lateral offset',
    loadSeqCol: 'Load seq',
    snapshot3d: '3D snapshot',
    cargoSummary: 'Cargo summary',
    printTitle: 'Container Loading Plan',
    generated: 'Generated',
    totalContainers: 'Total containers',
    totalItems: 'Total boxes',
    sourceCargo: 'Source',
    seq: '#',
    rotationLabel: 'Orient.',
    pageOf: 'page',
    cogShortAxis: 'X length / Y width / Z height',
  },
};

let currentLang = 'zh-Hant';

export function getLang() { return currentLang; }

export function t(key) {
  return dict[currentLang]?.[key] ?? dict['zh-Hant'][key] ?? key;
}

export function setLang(lang) {
  if (!dict[lang]) return;
  currentLang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
  applyDOM();
  document.documentElement.setAttribute('lang', lang);
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

export function initLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && dict[saved]) currentLang = saved;
  } catch {}
  applyDOM();
  document.documentElement.setAttribute('lang', currentLang);
}

export function toggleLang() {
  setLang(currentLang === 'zh-Hant' ? 'en' : 'zh-Hant');
}

function applyDOM() {
  // Text content
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  // Placeholder
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  // Title attribute
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
  // <title>
  if (document.title !== undefined) document.title = t('title');
}
