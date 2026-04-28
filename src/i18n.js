// i18n: Traditional Chinese (zh) ↔ English (en)
const STRINGS = {
  zh: {
    'page.title': '3D 貨櫃裝載規劃器',

    'btn.pack': '▶ 裝載',
    'btn.clear': '清除',
    'btn.import': '匯入 JSON',
    'btn.export': '匯出 JSON',
    'btn.demo': '載入示範',
    'btn.addCargo': '+ 加入貨物',
    'btn.saveEdit': '✓ 儲存修改',
    'btn.cancelEdit': '取消編輯',

    'lang.label': '語言',

    'h.selectContainer': '選擇貨櫃',
    'h.addCargo': '新增貨物類型',
    'h.cargoList': '已定義貨物',
    'h.displayOptions': '顯示選項',

    'f.name': '名稱',
    'f.length': '長 (cm)',
    'f.width': '寬 (cm)',
    'f.height': '高 (cm)',
    'f.weight': '重量 (kg/箱)',
    'f.qty': '數量',
    'f.color': '顏色',
    'f.maxLayers': '最大堆疊層數',
    'f.maxLoadTop': '頂壓上限 (kg)',
    'f.supportRatio': '支撐比例下限 (%)',
    'f.priority': '裝載優先權',
    'f.priorityNormal': 'normal（一般）',
    'f.priorityUrgent': 'urgent（急件，優先排）',
    'f.priorityLifo': 'lifo（後進先出）',
    'f.yaw': 'Yaw 平面 90° 旋轉（L↔W）',
    'f.pitch': 'Pitch 翻轉（W↔H，需取消 ↑）',
    'f.roll': 'Roll 翻轉（L↔H，需取消 ↑）',
    'f.thisSideUp': '↑ This Side Up（鎖定 Pitch/Roll）',
    'f.opacity': '透明度',
    'f.showLabels': '顯示貨物名稱（5 個面）',

    'cargo.empty': '尚未新增任何貨物',
    'cargo.defaultName': '貨物{letter}',
    'cargo.layers': '層數',
    'cargo.topLoad': '頂壓',
    'cargo.rotation': '旋轉',
    'cargo.boxesUnit': '箱',
    'cargo.btnEdit': '編輯',
    'cargo.btnRemove': '移除',
    'cargo.editing': '編輯中…',
    'cargo.kgPerBox': 'kg/箱',

    'container.intDim': '內尺寸',
    'container.maxPayload': '最大載重',

    'stats.notLoaded': '尚未裝載',
    'stats.loaded': '已裝載',
    'stats.unloaded': '未裝載',
    'stats.containers': '所需貨櫃',
    'stats.containerWord': '個',
    'stats.boxes': '箱',
    'stats.containerN': 'Container {n}',
    'stats.volume': '體積',
    'stats.weight': '重量',

    'confirm.clear': '確定清除所有貨物？',
    'confirm.import': '將覆蓋目前所有資料，確定？',
    'confirm.demo': '載入示範資料將覆蓋目前內容，確定？',

    'alert.invalidInput': '請輸入有效的尺寸與數量（正數）',
    'alert.noCargo': '請先新增至少一種貨物',
    'alert.jsonError': 'JSON 格式錯誤：',

    'details.title': '貨物明細',
    'details.close': '關閉',
    'details.name': '名稱',
    'details.container': '所在貨櫃',
    'details.position': '位置（左下後角）',
    'details.actualDim': '實際尺寸 (L×W×H)',
    'details.orientation': '方向',
    'details.weight': '重量',
    'details.maxLoadOnTop': '頂壓上限',
    'details.constraints': '限制',
    'details.originalOrient': '原始方向',
    'details.thisSideUp': '↑ 此面向上',
    'details.nonStackable': '⊘ 不可堆疊',
  },

  en: {
    'page.title': '3D Container Loading Planner',

    'btn.pack': '▶ Pack',
    'btn.clear': 'Clear',
    'btn.import': 'Import JSON',
    'btn.export': 'Export JSON',
    'btn.demo': 'Load Demo',
    'btn.addCargo': '+ Add Cargo',
    'btn.saveEdit': '✓ Save',
    'btn.cancelEdit': 'Cancel',

    'lang.label': 'Language',

    'h.selectContainer': 'Container',
    'h.addCargo': 'Add Cargo Type',
    'h.cargoList': 'Defined Cargo',
    'h.displayOptions': 'Display Options',

    'f.name': 'Name',
    'f.length': 'Length (cm)',
    'f.width': 'Width (cm)',
    'f.height': 'Height (cm)',
    'f.weight': 'Weight (kg/box)',
    'f.qty': 'Quantity',
    'f.color': 'Color',
    'f.maxLayers': 'Max stack layers',
    'f.maxLoadTop': 'Max load on top (kg)',
    'f.supportRatio': 'Min support ratio (%)',
    'f.priority': 'Priority',
    'f.priorityNormal': 'normal',
    'f.priorityUrgent': 'urgent (rush, top priority)',
    'f.priorityLifo': 'lifo (last-in-first-out)',
    'f.yaw': 'Yaw 90° rotation (L↔W)',
    'f.pitch': 'Pitch flip (W↔H, requires unchecking ↑)',
    'f.roll': 'Roll flip (L↔H, requires unchecking ↑)',
    'f.thisSideUp': '↑ This Side Up (locks Pitch/Roll)',
    'f.opacity': 'Opacity',
    'f.showLabels': 'Show cargo names (5 faces)',

    'cargo.empty': 'No cargo added yet',
    'cargo.defaultName': 'Cargo {letter}',
    'cargo.layers': 'Layers',
    'cargo.topLoad': 'Top load',
    'cargo.rotation': 'Rot',
    'cargo.boxesUnit': '',
    'cargo.btnEdit': 'Edit',
    'cargo.btnRemove': 'Remove',
    'cargo.editing': 'Editing…',
    'cargo.kgPerBox': 'kg/box',

    'container.intDim': 'Inner dim',
    'container.maxPayload': 'Max payload',

    'stats.notLoaded': 'Not packed yet',
    'stats.loaded': 'Packed',
    'stats.unloaded': 'Unpacked',
    'stats.containers': 'Containers needed',
    'stats.containerWord': '',
    'stats.boxes': 'boxes',
    'stats.containerN': 'Container {n}',
    'stats.volume': 'Volume',
    'stats.weight': 'Weight',

    'confirm.clear': 'Clear all cargo?',
    'confirm.import': 'This will overwrite current data. Continue?',
    'confirm.demo': 'Loading demo will overwrite current data. Continue?',

    'alert.invalidInput': 'Please enter valid dimensions and quantity (positive numbers).',
    'alert.noCargo': 'Please add at least one cargo type first.',
    'alert.jsonError': 'Invalid JSON: ',

    'details.title': 'Cargo Detail',
    'details.close': 'Close',
    'details.name': 'Name',
    'details.container': 'Container',
    'details.position': 'Position (bottom-left-back)',
    'details.actualDim': 'Actual size (L×W×H)',
    'details.orientation': 'Orientation',
    'details.weight': 'Weight',
    'details.maxLoadOnTop': 'Max load on top',
    'details.constraints': 'Constraints',
    'details.originalOrient': 'Original',
    'details.thisSideUp': '↑ This side up',
    'details.nonStackable': '⊘ Not stackable',
  },
};

let currentLang = localStorage.getItem('clp:lang') || 'zh';
const langChangeListeners = [];

export function t(key, params = {}) {
  let s = STRINGS[currentLang]?.[key] ?? STRINGS.zh[key] ?? key;
  for (const [k, v] of Object.entries(params)) {
    s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return s;
}

export function getLang() { return currentLang; }

export function setLang(lang) {
  if (!STRINGS[lang]) return;
  currentLang = lang;
  localStorage.setItem('clp:lang', lang);
  applyDomI18n();
  langChangeListeners.forEach((fn) => fn(lang));
}

export function onLangChange(fn) { langChangeListeners.push(fn); }

export function applyDomI18n() {
  document.documentElement.lang = currentLang === 'en' ? 'en' : 'zh-Hant';
  document.title = t('page.title');
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  });
}
