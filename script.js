// =============================================
// 1. データ & 設定
// =============================================

// --- 1. デフォルトデータの定義 ---
const defaultEvents = [
    { id: 1, parentId: null, name: "ローマ共和政", start: -509, end: -27, region: "西ヨーロッパ", description: "元老院と市民集会によって統治された古代ローマの時代。" },
    { id: 2, parentId: 1, name: "ポエニ戦争", start: -264, end: -146, region: "西ヨーロッパ", description: "ローマとカルタゴの間の三度にわたる戦争。" },
    { id: 3, parentId: null, name: "アレクサンドロス大王の遠征", start: -334, end: -323, region: "東ヨーロッパ", description: "マケドニア王アレクサンドロス3世によるアケメネス朝ペルシアへの遠征。" },
    { id: 4, parentId: null, name: "中国の戦国時代", start: -403, end: -221, region: "中国", description: "多くの国が争った分裂の時代。" }
];

const defaultRegions = [
  { id: 'r1', name: "西ヨーロッパ", subregions: [] },
  { id: 'r2', name: "東ヨーロッパ", subregions: [] },
  { id: 'r3', name: "西アジア(オリエント)", subregions: [] },
  { id: 'r4', name: "南アジア", subregions: [] },
  { id: 'r5', name: "東南アジア", subregions: [] },
  { id: 'r6', name: "中国", subregions: [] },
  { id: 'r7', name: "アフリカ大陸", subregions: [] },
  { id: 'r8', name: "アメリカ大陸", subregions: [] },
];

// --- 2. localStorageからデータを読み込む ---
let events = JSON.parse(localStorage.getItem('myTimelineEvents')) || defaultEvents;
let regions = JSON.parse(localStorage.getItem('myTimelineRegions')) || defaultRegions;

let visibleRegions = getAllRegionNames();

// --- 3. IDの最大値を再計算し、重複を防ぐ ---
let nextEventId = 1;
if (events.length > 0) {
    nextEventId = Math.max(...events.map(e => e.id)) + 1;
}

let nextRegionId = 100;
if (regions.length > 0) {
    const allRegionIds = regions.flatMap(r => [
        parseInt(r.id.replace('r', '')),
        ...r.subregions.map(s => parseInt(s.id.replace('s', '')))
    ]).filter(id => !isNaN(id));
    
    if (allRegionIds.length > 0) {
        nextRegionId = Math.max(...allRegionIds) + 1;
    }
}

// ズーム定義を「1行(60px)あたりの年数」に戻す
const ZOOM_LEVELS = [500, 200, 100, 50, 20, 10]; // 60pxあたりの年数
let currentZoomIndex = 2; // 初期値: 100年

let timelineConfig = {
    startYear: -800,
    endYear: 1900,
    yearsPerRow: ZOOM_LEVELS[currentZoomIndex],
    rowHeight: 60,
    yearLabelInterval: 100,
    // ピクセル/年を動的に計算するゲッター
    get pixelsPerYear() {
        return this.rowHeight / this.yearsPerRow;
    }
};

let currentlyOpenEvent = null, scrollTimeout = null, editingEventId = null, newEventParentId = null;
const timelineGrid = document.getElementById('timeline-grid');

// =============================================
// 3. 初期化処理
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    updateTimelineBounds();
    renderAll();
    // 初期ズームレベルを表示
    document.getElementById('zoom-level-display').textContent = `${timelineConfig.yearsPerRow}年`;
});

function renderAll() {
    createDynamicGrid();
    renderTimeline();
}

// =============================================
// 4. 描画ロジック (「ピクセル/年」方式)
// =============================================
function createDynamicGrid() {
    timelineGrid.innerHTML = '';
    const gridWrapper = document.createDocumentFragment();
    
    const totalYears = timelineConfig.endYear - timelineConfig.startYear;
    const totalHeight = totalYears * timelineConfig.pixelsPerYear;

    // --- 1. ヘッダーとコーナー ---
    const corner = document.createElement('div');
    corner.className = 'corner-cell';
    gridWrapper.appendChild(corner);

    visibleRegions.forEach((regionName, index) => {
        const header = document.createElement('div');
        header.className = 'region-header';
        header.style.gridColumn = index + 2;
        header.textContent = regionName;
        gridWrapper.appendChild(header);
    });

    // --- 2. 時間ラベルの「柱」を作成 ---
    const timeLabelColumn = document.createElement('div');
    timeLabelColumn.className = 'time-label-column';
    timeLabelColumn.style.height = `${totalHeight}px`;
    
    // 柱の中に年号ラベルを絶対配置で追加
    for (let year = timelineConfig.startYear; year <= timelineConfig.endYear; year += timelineConfig.yearLabelInterval) {
        const label = document.createElement('div');
        label.className = 'time-label';
        const top = (year - timelineConfig.startYear) * timelineConfig.pixelsPerYear;
        label.style.top = `${top}px`;
        
        const span = document.createElement('span');
        span.textContent = formatYear(year);
        label.appendChild(span);
        timeLabelColumn.appendChild(label);
    }
    gridWrapper.appendChild(timeLabelColumn);

    // --- 3. 各地域のイベント用「柱」を作成 ---
    visibleRegions.forEach((regionName, index) => {
        const column = document.createElement('div');
        column.className = 'region-column';
        column.style.gridColumn = index + 2;
        column.style.height = `${totalHeight}px`;
        column.dataset.region = regionName;
        gridWrapper.appendChild(column);
    });

    timelineGrid.style.gridTemplateColumns = `var(--time-label-width) repeat(${visibleRegions.length}, minmax(200px, 1fr))`;
    timelineGrid.appendChild(gridWrapper);
}

function renderTimeline() {
    // 柱コンテナの中身をクリア
    timelineGrid.querySelectorAll('.region-column').forEach(col => col.innerHTML = '');

    const filteredEvents = events.filter(event => visibleRegions.includes(event.region));
    
    // イベントを地域ごとにグループ化
    const eventsByRegion = new Map();
    for (const event of filteredEvents) {
        if (!eventsByRegion.has(event.region)) {
            eventsByRegion.set(event.region, []);
        }
        eventsByRegion.get(event.region).push(event);
    }

    // 各地域ごとにレーン割り当てと描画を行う
    eventsByRegion.forEach((regionEvents, regionName) => {
        const columnContainer = timelineGrid.querySelector(`.region-column[data-region="${regionName}"]`);
        if (!columnContainer) return;

        // イベントを開始年でソート
        regionEvents.sort((a, b) => a.start - b.start);

        const lanesEndTimes = []; // 各レーンの「最後のイベントの終了年」を保持
        const assignments = []; // { event, laneIndex } のペアを格納

        for (const event of regionEvents) {
            let foundLane = false;
            // 既存のレーンに配置できるか探す
            for (let i = 0; i < lanesEndTimes.length; i++) {
                if (event.start >= lanesEndTimes[i]) {
                    // このレーンに配置可能
                    lanesEndTimes[i] = event.end; // このレーンの終了時刻を更新
                    assignments.push({ event, laneIndex: i });
                    foundLane = true;
                    break;
                }
            }
            // 配置できるレーンがなければ、新しいレーンを追加
            if (!foundLane) {
                lanesEndTimes.push(event.end);
                assignments.push({ event, laneIndex: lanesEndTimes.length - 1 });
            }
        }

        const totalLanes = lanesEndTimes.length;

        // 計算結果に基づいてイベントブロックを作成・配置
        for (const { event, laneIndex } of assignments) {
            const eventBlock = createEventBlock(event, laneIndex, totalLanes);
            if (eventBlock) {
                columnContainer.appendChild(eventBlock);
            }
        }
    });
}

function createEventBlock(event, laneIndex, totalLanes) {
    if (!event) return null;

    const block = document.createElement('div');
    block.className = `event-block ${getRegionClass(event.region)}`;
    block.dataset.eventId = event.id;

    // --- ズレを解消するコアロジック ---
    const { startYear } = timelineConfig;
    const pixelsPerYear = timelineConfig.pixelsPerYear; // ゲッターを正しく呼び出す

    // 1. 絶対的なtop位置を計算
    const top = (event.start - startYear) * pixelsPerYear;
    
    // 2. 高さを計算
    const durationYears = event.end - event.start;
    const height = durationYears * pixelsPerYear;
    
    block.style.top = `${top}px`;
    block.style.height = `${Math.max(20, height)}px`;

    // 3. レーンに基づいて width と left を計算
    const marginPx = 4; // 左右に2pxずつのマージン
    block.style.width = `calc(${(100 / totalLanes)}% - ${marginPx}px)`;
    block.style.left = `calc(${(laneIndex / totalLanes) * 100}% + ${marginPx / 2}px)`;


    const title = document.createElement('div');
    title.className = 'event-title';
    title.textContent = event.name;
    const period = document.createElement('div');
    period.className = 'event-period';
    period.textContent = `${formatYear(event.start)} - ${formatYear(event.end)}`;
    block.appendChild(title);
    block.appendChild(period);
    
    block.addEventListener('click', () => showDetails(event));
    
    return block;
}


// =============================================
// 5. 機能：イベント詳細・編集・削除
// =============================================
function showDetails(event) {
    currentlyOpenEvent = event;
    document.getElementById('modal-title').textContent = event.name;
    document.getElementById('modal-period').textContent = `${formatYear(event.start)} - ${formatYear(event.end)}`;
    document.getElementById('modal-description').textContent = event.description || '詳細な説明はありません。';
    document.getElementById('details-modal').classList.remove('hidden');
}
function showForm(eventToEdit = null, isSubEvent = false) {
    editingEventId = eventToEdit ? eventToEdit.id : null;
    newEventParentId = isSubEvent ? currentlyOpenEvent.id : null;
    document.getElementById('add-edit-form').reset();
    let formTitle = '';
    if (eventToEdit) { formTitle = 'イベントを編集'; } 
    else if (isSubEvent) { formTitle = `「${currentlyOpenEvent.name}」のサブイベントを追加`; } 
    else { formTitle = '新しいイベントを追加'; }
    document.getElementById('form-title').textContent = formTitle;
    const regionSelect = document.getElementById('event-region');
    regionSelect.innerHTML = '<option value="">-- 地域を選択 --</option>';
    getAllRegionNames().forEach(name => {
        const option = document.createElement('option');
        option.value = name; option.textContent = name;
        regionSelect.appendChild(option);
    });
    if (eventToEdit) {
        document.getElementById('event-name').value = eventToEdit.name;
        document.getElementById('start-year').value = eventToEdit.start;
        document.getElementById('end-year').value = eventToEdit.end;
        regionSelect.value = eventToEdit.region;
        document.getElementById('event-description').value = eventToEdit.description || '';
    }
    document.getElementById('details-modal').classList.add('hidden');
    document.getElementById('add-edit-modal').classList.remove('hidden');
}
function handleFormSubmit(e) {
    e.preventDefault();
    const formData = {
        name: document.getElementById('event-name').value,
        start: parseInt(document.getElementById('start-year').value, 10),
        end: parseInt(document.getElementById('end-year').value, 10),
        region: document.getElementById('event-region').value,
        description: document.getElementById('event-description').value,
    };
    if (!formData.region) { alert('地域を選択してください。'); return; }
    if (editingEventId) {
        const eventToUpdate = findEventById(editingEventId);
        Object.assign(eventToUpdate, formData);
    } else {
        formData.id = nextEventId++;
        formData.parentId = newEventParentId;
        events.push(formData);
    }
    updateTimelineBounds();
    renderAll();
    document.getElementById('add-edit-modal').classList.add('hidden');
    editingEventId = null; newEventParentId = null;
    saveData();
}
function deleteCurrentEvent() {
    if (!currentlyOpenEvent || !confirm(`「${currentlyOpenEvent.name}」を本当に削除しますか？関連するサブイベントも削除されます。`)) return;
    const idsToDelete = [currentlyOpenEvent.id];
    events.forEach(e => { if (e.parentId === currentlyOpenEvent.id) { idsToDelete.push(e.id); } });
    events = events.filter(e => !idsToDelete.includes(e.id));
    document.getElementById('details-modal').classList.add('hidden');
    updateTimelineBounds();
    renderAll();
    saveData();
}

// =============================================
// 6. 機能：地域エディター & フィルター
// =============================================
function openRegionEditor() { renderRegionEditor(); document.getElementById('region-editor-modal').classList.remove('hidden'); }
function renderRegionEditor() {
    const listContainer = document.getElementById('region-editor-list');
    listContainer.innerHTML = '';
    regions.forEach(mainRegion => {
        const editorDiv = document.createElement('div');
        editorDiv.className = 'main-region-editor';
        editorDiv.innerHTML = `
            <div class="main-region-header">
                <h3>${mainRegion.name}</h3>
                <div class="main-region-controls">
                    <button data-id="${mainRegion.id}" class="delete-main-region-btn">削除</button>
                </div>
            </div>
            <ul class="sub-region-list">
                ${mainRegion.subregions.map(sub => `
                    <li class="sub-region-item" data-id="${sub.id}">
                        <span>${sub.name}</span>
                        <div class="sub-region-controls">
                           <button data-main-id="${mainRegion.id}" data-sub-id="${sub.id}" class="delete-sub-region-btn">&times;</button>
                        </div>
                    </li>
                `).join('')}
            </ul>
            <div class="add-sub-region-form">
                <input type="text" placeholder="新しいサブ地域名...">
                <button data-id="${mainRegion.id}" class="add-sub-region-btn btn-secondary">追加</button>
            </div>
        `;
        listContainer.appendChild(editorDiv);
    });
}
function addMainRegion() { 
    const input = document.getElementById('new-main-region-name'); 
    const name = input.value.trim(); 
    if (name && !regions.some(r => r.name === name)) { 
        regions.push({ id: `r${nextRegionId++}`, name: name, subregions: [] }); 
        input.value = ''; 
        renderRegionEditor(); 
        saveData();
    } else { alert('その地域名は既に使用されているか、無効です。'); } 
}
function addSubRegion(mainRegionId, subRegionName) { 
    const mainRegion = regions.find(r => r.id === mainRegionId); 
    if (mainRegion && subRegionName && !mainRegion.subregions.some(s => s.name === subRegionName)) { 
        mainRegion.subregions.push({ id: `s${nextRegionId++}`, name: subRegionName }); 
        renderRegionEditor(); 
        saveData();
    } else { alert('そのサブ地域名は既に使用されているか、無効です。'); } 
}
function deleteMainRegion(mainRegionId) { 
    if (!confirm('このメイン地域を削除しますか？関連するサブ地域もすべて削除されます。')) return; 
    regions = regions.filter(r => r.id !== mainRegionId); 
    renderRegionEditor(); 
    saveData();
}
function deleteSubRegion(mainRegionId, subRegionId) { 
    const mainRegion = regions.find(r => r.id === mainRegionId); 
    if (mainRegion) { 
        mainRegion.subregions = mainRegion.subregions.filter(s => s.id !== subRegionId); 
        renderRegionEditor(); 
        saveData();
    } 
}
function openFilterModal() {
    const optionsContainer = document.getElementById('filter-options');
    optionsContainer.innerHTML = '';
    getAllRegionNames().forEach(name => {
        const isChecked = visibleRegions.includes(name);
        const optionDiv = document.createElement('div');
        optionDiv.className = 'filter-option';
        optionDiv.innerHTML = `
            <input type="checkbox" id="filter-${name}" value="${name}" ${isChecked ? 'checked' : ''}>
            <label for="filter-${name}">${name}</label>
        `;
        optionsContainer.appendChild(optionDiv);
    });
    document.getElementById('filter-modal').classList.remove('hidden');
}
function applyFilter() {
    const newVisibleRegions = [];
    document.querySelectorAll('#filter-options input[type="checkbox"]:checked').forEach(checkbox => {
        newVisibleRegions.push(checkbox.value);
    });
    visibleRegions = newVisibleRegions;
    document.getElementById('filter-modal').classList.add('hidden');
    renderAll();
}

// =============================================
// 7. 機能：ズーム
// =============================================
function zoom(direction) {
    const newIndex = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, currentZoomIndex + direction)); 
    if (newIndex !== currentZoomIndex) {
        currentZoomIndex = newIndex;
        timelineConfig.yearsPerRow = ZOOM_LEVELS[currentZoomIndex];
        
        // ズームレベルに応じて年号ラベルの間隔を自動調整
        if (timelineConfig.yearsPerRow > 200) { // 500年
            timelineConfig.yearLabelInterval = 500;
        } else if (timelineConfig.yearsPerRow > 50) { // 200年, 100年
            timelineConfig.yearLabelInterval = 100;
        } else { // 50年, 20年, 10年
            timelineConfig.yearLabelInterval = 50;
            if(timelineConfig.yearsPerRow <= 20) timelineConfig.yearLabelInterval = 10;
        }
        
        document.getElementById('zoom-level-display').textContent = `${timelineConfig.yearsPerRow}年`;
        renderAll();
    }
}

// =============================================
// 8. イベントリスナーの設定
// =============================================
function setupEventListeners() {
    document.querySelectorAll('.close-btn').forEach(btn => 
        btn.addEventListener('click', (e) => e.target.closest('.modal-container').classList.add('hidden'))
    );
    document.getElementById('add-event-btn').addEventListener('click', () => showForm());
    document.getElementById('add-sub-event-btn').addEventListener('click', () => showForm(null, true));
    document.getElementById('edit-event-btn').addEventListener('click', () => showForm(currentlyOpenEvent));
    document.getElementById('add-edit-form').addEventListener('submit', handleFormSubmit);
    document.getElementById('delete-event-btn').addEventListener('click', deleteCurrentEvent);
    
    document.getElementById('edit-regions-btn').addEventListener('click', openRegionEditor);
    document.getElementById('add-main-region-btn').addEventListener('click', addMainRegion);
    document.getElementById('region-editor-list').addEventListener('click', (e) => {
        if (e.target.classList.contains('add-sub-region-btn')) { const mainRegionId = e.target.dataset.id; const input = e.target.previousElementSibling; const subRegionName = input.value.trim(); addSubRegion(mainRegionId, subRegionName); input.value = ''; }
        if (e.target.classList.contains('delete-main-region-btn')) { deleteMainRegion(e.target.dataset.id); }
        if (e.target.classList.contains('delete-sub-region-btn')) { deleteSubRegion(e.target.dataset.mainId, e.target.dataset.subId); }
    });
    document.getElementById('region-editor-modal').querySelector('.close-btn').addEventListener('click', () => {
        visibleRegions = getAllRegionNames(); renderAll();
    });

    document.getElementById('filter-btn').addEventListener('click', openFilterModal);
    document.getElementById('apply-filter-btn').addEventListener('click', applyFilter);

    document.getElementById('zoom-in-btn').addEventListener('click', () => zoom(1)); // 詳細
    document.getElementById('zoom-out-btn').addEventListener('click', () => zoom(-1)); // 広域

    timelineGrid.addEventListener('scroll', updateCenturyIndicator);
}

// =============================================
// 9. ヘルパー関数
// =============================================
function saveData() {
    try {
        localStorage.setItem('myTimelineEvents', JSON.stringify(events));
        localStorage.setItem('myTimelineRegions', JSON.stringify(regions));
    } catch (e) {
        console.error("ローカルストレージへの保存に失敗しました。", e);
        alert("データの保存に失敗しました。ストレージの空き容量が不足している可能性があります。");
    }
}
function updateTimelineBounds() {
    if (events.length === 0) {
        timelineConfig.startYear = -800;
        timelineConfig.endYear = 1900;
        return;
    }
    const minYear = Math.min(...events.map(e => e.start));
    const maxYear = Math.max(...events.map(e => e.end));
    timelineConfig.startYear = Math.floor(minYear / 100) * 100 - 100;
    timelineConfig.endYear = Math.ceil(maxYear / 100) * 100 + 100;
}
function getAllRegionNames() { return regions.flatMap(main => [main.name, ...main.subregions.map(sub => sub.name)]); }
function findEventById(id) { return events.find(event => event.id === id); }
function formatYear(year) { if (year === 0) return "1年"; return year < 0 ? `B.C. ${Math.abs(year)}` : `${year}年`; }
function getRegionClass(regionName) {
    const foundRegion = regions.find(r => r.name === regionName || r.subregions.some(s => s.name === regionName));
    const mainRegionName = foundRegion ? foundRegion.name : '';
    const classMap = { "西ヨーロッパ": "region-w-europe", "東ヨーロッパ": "region-e-europe", "西アジア(オリエント)": "region-w-asia", "南アジア": "region-s-asia", "東南アジア": "region-se-asia", "中国": "region-china", "アフリカ大陸": "region-africa", "アメリカ大陸": "region-americas" };
    return classMap[mainRegionName] || '';
}
function updateCenturyIndicator() {
    const indicator = document.getElementById('century-indicator');
    const scrollTop = timelineGrid.scrollTop;
    const scrollCenter = scrollTop + (timelineGrid.clientHeight / 2);
    const yearAtCenter = timelineConfig.startYear + (scrollCenter / timelineConfig.pixelsPerYear);
    let centuryText;
    if (yearAtCenter < 1) { centuryText = `紀元前 ${Math.ceil(Math.abs(yearAtCenter - 1) / 100)}世紀`; }
    else { centuryText = `${Math.ceil(yearAtCenter / 100)}世紀`; }
    indicator.textContent = centuryText;
    indicator.style.opacity = '1';
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => { indicator.style.opacity = '0'; }, 1500);
}
