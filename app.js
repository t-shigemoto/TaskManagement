// ========================================
// タスク管理アプリ - メインJavaScript（Firebase対応版）
// ========================================

// グローバル変数
let tasks = [];
let deleteTargetId = null;
let currentCalendarDate = new Date();
let calendarViewMode = 'month';
let currentUser = null;
let db = null;
let unsubscribeSnapshot = null;
let isFirebaseMode = false;

// DOM要素の取得
const elements = {
    // 認証
    authSection: document.getElementById('authSection'),
    loginBtn: document.getElementById('loginBtn'),
    userInfo: document.getElementById('userInfo'),
    userAvatar: document.getElementById('userAvatar'),
    userName: document.getElementById('userName'),
    logoutBtn: document.getElementById('logoutBtn'),
    configWarning: document.getElementById('configWarning'),
    loadingOverlay: document.getElementById('loadingOverlay'),

    // ナビゲーション
    showListBtn: document.getElementById('showListBtn'),
    showCalendarBtn: document.getElementById('showCalendarBtn'),
    listView: document.getElementById('listView'),
    calendarView: document.getElementById('calendarView'),

    // フィルター
    filterSection: document.querySelector('.filter-section'),
    filterToggle: document.getElementById('filterToggle'),
    filterControls: document.getElementById('filterControls'),
    filterCategory: document.getElementById('filterCategory'),
    filterDeadlineFrom: document.getElementById('filterDeadlineFrom'),
    filterDeadlineTo: document.getElementById('filterDeadlineTo'),
    filterPriority: document.getElementById('filterPriority'),
    filterInProgress: document.getElementById('filterInProgress'),
    sortOrder: document.getElementById('sortOrder'),
    applyFilterBtn: document.getElementById('applyFilterBtn'),
    clearFilterBtn: document.getElementById('clearFilterBtn'),

    // タスク一覧
    addTaskBtn: document.getElementById('addTaskBtn'),
    taskCardsContainer: document.getElementById('taskCardsContainer'),
    noTaskMessage: document.getElementById('noTaskMessage'),

    // タスクモーダル
    taskModal: document.getElementById('taskModal'),
    modalTitle: document.getElementById('modalTitle'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    taskForm: document.getElementById('taskForm'),
    taskId: document.getElementById('taskId'),
    taskCategory: document.getElementById('taskCategory'),
    taskName: document.getElementById('taskName'),
    taskPriority: document.getElementById('taskPriority'),
    taskDeadline: document.getElementById('taskDeadline'),
    taskProgress: document.getElementById('taskProgress'),
    progressValue: document.getElementById('progressValue'),
    taskMemo: document.getElementById('taskMemo'),
    taskInProgress: document.getElementById('taskInProgress'),
    cancelBtn: document.getElementById('cancelBtn'),

    // 削除モーダル
    deleteModal: document.getElementById('deleteModal'),
    closeDeleteModalBtn: document.getElementById('closeDeleteModalBtn'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
    cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),

    // カレンダー
    prevMonthBtn: document.getElementById('prevMonthBtn'),
    nextMonthBtn: document.getElementById('nextMonthBtn'),
    currentMonthYear: document.getElementById('currentMonthYear'),
    calendarDays: document.getElementById('calendarDays'),

    // 完了タスク一覧
    showCompletedBtn: document.getElementById('showCompletedBtn'),
    completedView: document.getElementById('completedView'),
    completedTasksContainer: document.getElementById('completedTasksContainer'),
    noCompletedTaskMessage: document.getElementById('noCompletedTaskMessage'),
    backToListBtn: document.getElementById('backToListBtn')
};

// ========================================
// 初期化
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    showLoading(true);
    
    // Firebase設定をチェック
    if (typeof isFirebaseConfigured === 'function' && isFirebaseConfigured()) {
        try {
            // Firebaseを初期化
            firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
            isFirebaseMode = true;
            
            // 認証状態の監視を開始
            setupAuthStateListener();
            
            // ログインボタンを表示
            elements.loginBtn.style.display = 'flex';
        } catch (error) {
            console.error('Firebase初期化エラー:', error);
            fallbackToLocalStorage();
        }
    } else {
        // Firebase未設定の場合
        fallbackToLocalStorage();
    }
    
    setupEventListeners();
    initMobileFeatures();
}

function fallbackToLocalStorage() {
    console.log('ローカルストレージモードで動作します');
    isFirebaseMode = false;
    elements.configWarning.style.display = 'block';
    elements.loginBtn.style.display = 'none';
    loadTasksFromLocalStorage();
    renderAll();
    showLoading(false);
}

function showLoading(show) {
    if (elements.loadingOverlay) {
        elements.loadingOverlay.style.display = show ? 'flex' : 'none';
    }
}

// ========================================
// Firebase認証
// ========================================
function setupAuthStateListener() {
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            // ログイン済み
            currentUser = user;
            updateAuthUI(true);
            subscribeToTasks();
        } else {
            // 未ログイン
            currentUser = null;
            updateAuthUI(false);
            if (unsubscribeSnapshot) {
                unsubscribeSnapshot();
                unsubscribeSnapshot = null;
            }
            // 未ログイン時はローカルストレージから読み込み
            loadTasksFromLocalStorage();
            renderAll();
        }
        showLoading(false);
    });
}

function updateAuthUI(isLoggedIn) {
    if (isLoggedIn && currentUser) {
        elements.loginBtn.style.display = 'none';
        elements.userInfo.style.display = 'flex';
        elements.userAvatar.src = currentUser.photoURL || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%23667eea"/><text x="50" y="65" text-anchor="middle" fill="white" font-size="40">👤</text></svg>';
        elements.userName.textContent = currentUser.displayName || 'ユーザー';
        elements.configWarning.style.display = 'none';
    } else {
        elements.loginBtn.style.display = 'flex';
        elements.userInfo.style.display = 'none';
        if (isFirebaseMode) {
            elements.configWarning.style.display = 'none';
        }
    }
}

async function handleLogin() {
    try {
        showLoading(true);
        const provider = new firebase.auth.GoogleAuthProvider();
        await firebase.auth().signInWithPopup(provider);
    } catch (error) {
        console.error('ログインエラー:', error);
        alert('ログインに失敗しました: ' + error.message);
        showLoading(false);
    }
}

async function handleLogout() {
    try {
        await firebase.auth().signOut();
        tasks = [];
        renderAll();
    } catch (error) {
        console.error('ログアウトエラー:', error);
    }
}

// ========================================
// Firestore操作
// ========================================
function subscribeToTasks() {
    if (!currentUser || !db) return;

    // 既存のリスナーを解除
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
    }

    // リアルタイム同期を開始
    unsubscribeSnapshot = db.collection('users')
        .doc(currentUser.uid)
        .collection('tasks')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            tasks = [];
            snapshot.forEach((doc) => {
                tasks.push({ id: doc.id, ...doc.data() });
            });
            renderAll();
        }, (error) => {
            console.error('タスク取得エラー:', error);
        });
}

async function saveTaskToFirestore(taskData) {
    if (!currentUser || !db) return;

    try {
        const taskRef = db.collection('users')
            .doc(currentUser.uid)
            .collection('tasks');

        if (taskData.id && !taskData.id.startsWith('task_')) {
            // 既存タスクの更新
            await taskRef.doc(taskData.id).update({
                ...taskData,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // 新規タスクの追加
            const { id, ...dataWithoutId } = taskData;
            await taskRef.add({
                ...dataWithoutId,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (error) {
        console.error('タスク保存エラー:', error);
        alert('タスクの保存に失敗しました');
    }
}

async function deleteTaskFromFirestore(taskId) {
    if (!currentUser || !db) return;

    try {
        await db.collection('users')
            .doc(currentUser.uid)
            .collection('tasks')
            .doc(taskId)
            .delete();
    } catch (error) {
        console.error('タスク削除エラー:', error);
        alert('タスクの削除に失敗しました');
    }
}

// ========================================
// LocalStorage操作（フォールバック用）
// ========================================
function loadTasksFromLocalStorage() {
    const stored = localStorage.getItem('tasks');
    tasks = stored ? JSON.parse(stored) : [];
}

function saveTasksToLocalStorage() {
    localStorage.setItem('tasks', JSON.stringify(tasks));
}

// ========================================
// イベントリスナーの設定
// ========================================
function setupEventListeners() {
    // 認証
    if (elements.loginBtn) {
        elements.loginBtn.addEventListener('click', handleLogin);
    }
    if (elements.logoutBtn) {
        elements.logoutBtn.addEventListener('click', handleLogout);
    }

    // ナビゲーション
    elements.showListBtn.addEventListener('click', () => switchView('list'));
    elements.showCalendarBtn.addEventListener('click', () => switchView('calendar'));
    if (elements.showCompletedBtn) {
        elements.showCompletedBtn.addEventListener('click', () => switchView('completed'));
    }
    if (elements.backToListBtn) {
        elements.backToListBtn.addEventListener('click', () => switchView('list'));
    }

    // フィルター
    elements.applyFilterBtn.addEventListener('click', applyFilter);
    elements.clearFilterBtn.addEventListener('click', clearFilter);

    // フィルター折りたたみ（モバイル）
    if (elements.filterToggle) {
        elements.filterToggle.addEventListener('click', toggleFilter);
    }

    // タスク追加
    elements.addTaskBtn.addEventListener('click', () => openTaskModal());

    // モーダル操作
    elements.closeModalBtn.addEventListener('click', closeTaskModal);
    elements.cancelBtn.addEventListener('click', closeTaskModal);
    elements.taskForm.addEventListener('submit', handleTaskSubmit);
    elements.taskProgress.addEventListener('input', updateProgressValue);

    // 削除モーダル
    elements.closeDeleteModalBtn.addEventListener('click', closeDeleteModal);
    elements.cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    elements.confirmDeleteBtn.addEventListener('click', confirmDelete);

    // カレンダー
    elements.prevMonthBtn.addEventListener('click', () => navigateCalendar(-1));
    elements.nextMonthBtn.addEventListener('click', () => navigateCalendar(1));

    // カレンダー表示モード切替
    document.querySelectorAll('.calendar-view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            calendarViewMode = btn.dataset.view;
            document.querySelectorAll('.calendar-view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderCalendar();
        });
    });

    // モーダル外クリックで閉じる
    elements.taskModal.addEventListener('click', (e) => {
        if (e.target === elements.taskModal) closeTaskModal();
    });
    elements.deleteModal.addEventListener('click', (e) => {
        if (e.target === elements.deleteModal) closeDeleteModal();
    });
}

// ========================================
// モバイル機能の初期化
// ========================================
function initMobileFeatures() {
    // モバイルの場合、フィルターを初期状態で折りたたむ
    if (window.innerWidth <= 768 && elements.filterSection) {
        elements.filterSection.classList.add('collapsed');
    }

    // 画面サイズ変更時の対応
    window.addEventListener('resize', handleResize);
}

function handleResize() {
    const currentTasks = getCurrentFilteredTasks();
    renderTaskCards(currentTasks);
}

function getCurrentFilteredTasks() {
    const category = elements.filterCategory.value;
    const deadlineFrom = elements.filterDeadlineFrom.value;
    const deadlineTo = elements.filterDeadlineTo.value;
    const priority = elements.filterPriority.value;
    const inProgress = elements.filterInProgress.value;
    const sortOrder = elements.sortOrder.value;

    if (!category && !deadlineFrom && !deadlineTo && !priority && !inProgress && !sortOrder) {
        return tasks;
    }

    return filterAndSortTasks(category, deadlineFrom, deadlineTo, priority, inProgress, sortOrder);
}

function toggleFilter() {
    if (elements.filterSection) {
        elements.filterSection.classList.toggle('collapsed');
    }
}

// ========================================
// 表示更新
// ========================================
function renderAll() {
    renderTaskCards();
    renderCalendar();
    renderCompletedTasks();
}

// ========================================
// ビュー切り替え
// ========================================
function switchView(view) {
    // すべてのビューを非表示
    elements.listView.style.display = 'none';
    elements.calendarView.style.display = 'none';
    if (elements.completedView) {
        elements.completedView.style.display = 'none';
    }

    // ナビゲーションボタンの状態をリセット
    elements.showListBtn.classList.remove('active');
    elements.showCalendarBtn.classList.remove('active');
    if (elements.showCompletedBtn) {
        elements.showCompletedBtn.classList.remove('active');
    }

    if (view === 'list') {
        elements.listView.style.display = 'block';
        elements.showListBtn.classList.add('active');
    } else if (view === 'calendar') {
        elements.calendarView.style.display = 'block';
        elements.showCalendarBtn.classList.add('active');
        renderCalendar();
    } else if (view === 'completed') {
        if (elements.completedView) {
            elements.completedView.style.display = 'block';
        }
        if (elements.showCompletedBtn) {
            elements.showCompletedBtn.classList.add('active');
        }
        renderCompletedTasks();
    }
}

// ========================================
// タスクカードの表示
// ========================================
function renderTaskCards(filteredTasks = null) {
    let displayTasks = filteredTasks || tasks;
    
    // 未完了タスクのみ表示（完了タスクは除外）
    displayTasks = displayTasks.filter(task => !task.completed);
    
    // 初期表示時は期限日順でソート（filteredTasksがnullの場合）
    if (!filteredTasks) {
        displayTasks = sortTasks([...displayTasks], 'deadline-asc');
    }
    
    if (!elements.taskCardsContainer) return;
    
    elements.taskCardsContainer.innerHTML = '';

    if (displayTasks.length === 0) {
        if (elements.noTaskMessage) {
            elements.noTaskMessage.style.display = 'block';
        }
        return;
    }

    if (elements.noTaskMessage) {
        elements.noTaskMessage.style.display = 'none';
    }

    displayTasks.forEach(task => {
        const card = document.createElement('div');
        const categoryCardClass = task.category === 'private' ? 'category-private-card' : 'category-work-card';
        card.className = `task-card ${categoryCardClass}`;
        
        const categoryLabel = task.category === 'private' ? 'プライベート' : '仕事';
        const categoryClass = task.category === 'private' ? 'category-private' : 'category-work';
        
        const memoHtml = task.memo 
            ? `<div class="task-card-memo" onclick="toggleMemo(this)">${escapeHtml(task.memo)}</div>` 
            : '';

        card.innerHTML = `
            <div class="task-card-header">
                <div class="task-card-title">${escapeHtml(task.name)}</div>
                <div class="task-card-badges">
                    <span class="category-badge ${categoryClass}">${categoryLabel}</span>
                    <span class="priority-badge priority-${task.priority}">${getPriorityLabel(task.priority)}</span>
                    <span class="status-badge ${task.inProgress ? 'status-active' : 'status-inactive'}">${task.inProgress ? '着手中' : '未着手'}</span>
                </div>
            </div>
            <div class="task-card-info">
                <div class="task-card-info-item">
                    <span class="task-card-info-label">期限</span>
                    <span class="task-card-info-value ${getDeadlineClass(task.deadline)}">${formatDate(task.deadline)}</span>
                </div>
                <div class="task-card-info-item">
                    <span class="task-card-info-label">進捗</span>
                    <span class="task-card-info-value">${task.progress}%</span>
                </div>
            </div>
            <div class="task-card-progress">
                <div class="task-card-progress-bar">
                    <div class="task-card-progress-fill" style="width: ${task.progress}%"></div>
                </div>
            </div>
            ${memoHtml}
            <div class="task-card-actions">
                <button class="btn btn-success" onclick="completeTask('${task.id}')">完了</button>
                <button class="btn btn-primary" onclick="openTaskModal('${task.id}')">編集</button>
                <button class="btn btn-danger" onclick="openDeleteModal('${task.id}')">削除</button>
            </div>
        `;
        elements.taskCardsContainer.appendChild(card);
    });
}

// メモの展開/折りたたみ
function toggleMemo(element) {
    element.classList.toggle('expanded');
}

// ========================================
// フィルター機能
// ========================================
function filterAndSortTasks(category, deadlineFrom, deadlineTo, priority, inProgress, sortOrder) {
    let filtered = [...tasks];

    if (category) {
        filtered = filtered.filter(task => task.category === category);
    }

    if (deadlineFrom) {
        filtered = filtered.filter(task => {
            if (!task.deadline) return false;
            return task.deadline.substring(0, 10) >= deadlineFrom;
        });
    }

    if (deadlineTo) {
        filtered = filtered.filter(task => {
            if (!task.deadline) return false;
            return task.deadline.substring(0, 10) <= deadlineTo;
        });
    }

    if (priority) {
        filtered = filtered.filter(task => task.priority === priority);
    }

    if (inProgress !== '') {
        const inProgressBool = inProgress === 'true';
        filtered = filtered.filter(task => task.inProgress === inProgressBool);
    }

    // ソート処理
    if (sortOrder) {
        filtered = sortTasks(filtered, sortOrder);
    }

    return filtered;
}

function sortTasks(taskList, sortOrder) {
    const priorityOrder = { high: 1, medium: 2, low: 3 };
    
    return taskList.sort((a, b) => {
        switch (sortOrder) {
            case 'deadline-asc':
                if (!a.deadline) return 1;
                if (!b.deadline) return -1;
                return a.deadline.localeCompare(b.deadline);
            case 'deadline-desc':
                if (!a.deadline) return 1;
                if (!b.deadline) return -1;
                return b.deadline.localeCompare(a.deadline);
            case 'priority-high':
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            case 'priority-low':
                return priorityOrder[b.priority] - priorityOrder[a.priority];
            default:
                return 0;
        }
    });
}

function filterTasks(deadlineFrom, deadlineTo, priority, inProgress) {
    return filterAndSortTasks('', deadlineFrom, deadlineTo, priority, inProgress, '');
}

function applyFilter() {
    const category = elements.filterCategory.value;
    const deadlineFrom = elements.filterDeadlineFrom.value;
    const deadlineTo = elements.filterDeadlineTo.value;
    const priority = elements.filterPriority.value;
    const inProgress = elements.filterInProgress.value;
    const sortOrder = elements.sortOrder.value;

    const filtered = filterAndSortTasks(category, deadlineFrom, deadlineTo, priority, inProgress, sortOrder);

    renderTaskCards(filtered);
}

function clearFilter() {
    elements.filterCategory.value = '';
    elements.filterDeadlineFrom.value = '';
    elements.filterDeadlineTo.value = '';
    elements.filterPriority.value = '';
    elements.filterInProgress.value = '';
    elements.sortOrder.value = '';
    renderTaskCards();
}

// ========================================
// タスクモーダル操作
// ========================================
function openTaskModal(taskId = null) {
    if (taskId) {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            elements.modalTitle.textContent = 'タスク編集';
            elements.taskId.value = task.id;
            elements.taskCategory.value = task.category || 'work';
            elements.taskName.value = task.name;
            elements.taskPriority.value = task.priority;
            elements.taskDeadline.value = task.deadline || '';
            elements.taskProgress.value = task.progress;
            elements.progressValue.textContent = task.progress;
            elements.taskMemo.value = task.memo || '';
            elements.taskInProgress.checked = task.inProgress;
        }
    } else {
        elements.modalTitle.textContent = '新規タスク追加';
        elements.taskForm.reset();
        elements.taskId.value = '';
        elements.taskCategory.value = 'work';
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = (today.getMonth() + 1).toString().padStart(2, '0');
        const dd = today.getDate().toString().padStart(2, '0');
        elements.taskDeadline.value = `${yyyy}-${mm}-${dd}T00:00`;
        elements.taskProgress.value = 0;
        elements.progressValue.textContent = '0';
    }
    elements.taskModal.style.display = 'flex';
}

function closeTaskModal() {
    elements.taskModal.style.display = 'none';
    elements.taskForm.reset();
}

function updateProgressValue() {
    elements.progressValue.textContent = elements.taskProgress.value;
}

async function handleTaskSubmit(e) {
    e.preventDefault();

    const taskData = {
        id: elements.taskId.value || generateId(),
        category: elements.taskCategory.value,
        name: elements.taskName.value.trim(),
        priority: elements.taskPriority.value,
        deadline: elements.taskDeadline.value || null,
        progress: parseInt(elements.taskProgress.value),
        memo: elements.taskMemo.value.trim(),
        inProgress: elements.taskInProgress.checked
    };

    if (isFirebaseMode && currentUser) {
        // Firestoreに保存
        await saveTaskToFirestore(taskData);
    } else {
        // LocalStorageに保存
        if (elements.taskId.value) {
            const index = tasks.findIndex(t => t.id === taskData.id);
            if (index !== -1) {
                tasks[index] = taskData;
            }
        } else {
            tasks.push(taskData);
        }
        saveTasksToLocalStorage();
        renderAll();
    }

    closeTaskModal();
}

// ========================================
// 削除モーダル操作
// ========================================
function openDeleteModal(taskId) {
    deleteTargetId = taskId;
    elements.deleteModal.style.display = 'flex';
}

function closeDeleteModal() {
    elements.deleteModal.style.display = 'none';
    deleteTargetId = null;
}

async function confirmDelete() {
    if (deleteTargetId) {
        if (isFirebaseMode && currentUser) {
            // Firestoreから削除
            await deleteTaskFromFirestore(deleteTargetId);
        } else {
            // LocalStorageから削除
            tasks = tasks.filter(t => t.id !== deleteTargetId);
            saveTasksToLocalStorage();
            renderAll();
        }
    }
    closeDeleteModal();
}

// ========================================
// タスク完了機能
// ========================================
async function completeTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    task.completed = true;
    task.completedAt = new Date().toISOString();
    task.progress = 100;

    if (isFirebaseMode && currentUser) {
        await saveTaskToFirestore(task);
    } else {
        saveTasksToLocalStorage();
        renderAll();
    }
}

async function restoreTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    task.completed = false;
    task.completedAt = null;

    if (isFirebaseMode && currentUser) {
        await saveTaskToFirestore(task);
    } else {
        saveTasksToLocalStorage();
        renderAll();
    }
}

// ========================================
// 完了タスク一覧の表示
// ========================================
function renderCompletedTasks() {
    const completedTasks = tasks.filter(task => task.completed);
    
    if (!elements.completedTasksContainer) return;
    
    elements.completedTasksContainer.innerHTML = '';

    if (completedTasks.length === 0) {
        if (elements.noCompletedTaskMessage) {
            elements.noCompletedTaskMessage.style.display = 'block';
        }
        return;
    }

    if (elements.noCompletedTaskMessage) {
        elements.noCompletedTaskMessage.style.display = 'none';
    }

    // 完了日順（新しい順）でソート
    completedTasks.sort((a, b) => {
        if (!a.completedAt) return 1;
        if (!b.completedAt) return -1;
        return b.completedAt.localeCompare(a.completedAt);
    });

    completedTasks.forEach(task => {
        const card = document.createElement('div');
        const categoryCardClass = task.category === 'private' ? 'category-private-card' : 'category-work-card';
        card.className = `task-card completed-task ${categoryCardClass}`;
        
        const categoryLabel = task.category === 'private' ? 'プライベート' : '仕事';
        const categoryClass = task.category === 'private' ? 'category-private' : 'category-work';
        const completedDate = task.completedAt ? formatDateTime(task.completedAt) : '-';

        card.innerHTML = `
            <div class="task-card-header">
                <div class="task-card-title">${escapeHtml(task.name)}</div>
                <div class="task-card-badges">
                    <span class="category-badge ${categoryClass}">${categoryLabel}</span>
                    <span class="priority-badge priority-${task.priority}">${getPriorityLabel(task.priority)}</span>
                    <span class="status-badge status-completed">完了</span>
                </div>
            </div>
            <div class="task-card-info">
                <div class="task-card-info-item">
                    <span class="task-card-info-label">期限</span>
                    <span class="task-card-info-value">${formatDate(task.deadline)}</span>
                </div>
                <div class="task-card-info-item">
                    <span class="task-card-info-label">完了日時</span>
                    <span class="task-card-info-value">${completedDate}</span>
                </div>
            </div>
            <div class="task-card-actions">
                <button class="btn btn-secondary" onclick="restoreTask('${task.id}')">未完了に戻す</button>
                <button class="btn btn-danger" onclick="openDeleteModal('${task.id}')">削除</button>
            </div>
        `;
        elements.completedTasksContainer.appendChild(card);
    });
}

function formatDateTime(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

// ========================================
// カレンダー機能
// ========================================
function renderCalendar() {
    switch (calendarViewMode) {
        case 'week':
            renderCalendarWeek();
            break;
        case 'day':
            renderCalendarDay();
            break;
        default:
            renderCalendarMonth();
            break;
    }
}

function renderCalendarMonth() {
    const calendarGrid = document.querySelector('.calendar-grid');
    calendarGrid.style.display = 'grid';
    calendarGrid.classList.remove('calendar-week-mode');
    document.getElementById('calendarDayView').style.display = 'none';

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    elements.currentMonthYear.textContent = `${year}年 ${month + 1}月`;

    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    elements.calendarDays.innerHTML = '';

    for (let i = 0; i < 42; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);

        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';

        if (currentDate.getMonth() !== month) {
            dayDiv.classList.add('other-month');
        }

        if (currentDate.getTime() === today.getTime()) {
            dayDiv.classList.add('today');
        }

        const dayNumber = document.createElement('div');
        dayNumber.className = 'calendar-day-number';
        dayNumber.textContent = currentDate.getDate();
        dayDiv.appendChild(dayNumber);

        const dateStr = formatDateForCompare(currentDate);
        const dayTasks = tasks.filter(task => {
            if (!task.deadline || task.completed) return false;
            return task.deadline.substring(0, 10) === dateStr;
        });

        const maxDisplay = 3;
        dayTasks.slice(0, maxDisplay).forEach(task => {
            const taskDiv = document.createElement('div');
            const calendarCategoryClass = task.category === 'private' ? 'calendar-task-private' : 'calendar-task-work';
            taskDiv.className = `calendar-task ${calendarCategoryClass}`;
            taskDiv.textContent = task.name;
            taskDiv.title = `${task.name}\nカテゴリ: ${task.category === 'private' ? 'プライベート' : '仕事'}\n重要度: ${getPriorityLabel(task.priority)}\n進捗: ${task.progress}%`;
            taskDiv.onclick = () => openTaskModal(task.id);
            dayDiv.appendChild(taskDiv);
        });

        if (dayTasks.length > maxDisplay) {
            const moreDiv = document.createElement('div');
            moreDiv.className = 'calendar-task-more';
            moreDiv.textContent = `他${dayTasks.length - maxDisplay}件`;
            dayDiv.appendChild(moreDiv);
        }

        elements.calendarDays.appendChild(dayDiv);
    }
}

function renderCalendarWeek() {
    const calendarGrid = document.querySelector('.calendar-grid');
    calendarGrid.style.display = 'grid';
    calendarGrid.classList.add('calendar-week-mode');
    document.getElementById('calendarDayView').style.display = 'none';

    const current = new Date(currentCalendarDate);
    const dayOfWeek = current.getDay();
    const startOfWeek = new Date(current);
    startOfWeek.setDate(current.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const sy = startOfWeek.getFullYear(), sm = startOfWeek.getMonth() + 1, sd = startOfWeek.getDate();
    const ey = endOfWeek.getFullYear(), em = endOfWeek.getMonth() + 1, ed = endOfWeek.getDate();
    if (sy === ey && sm === em) {
        elements.currentMonthYear.textContent = `${sy}年${sm}月${sd}日 - ${ed}日`;
    } else if (sy === ey) {
        elements.currentMonthYear.textContent = `${sy}年${sm}月${sd}日 - ${em}月${ed}日`;
    } else {
        elements.currentMonthYear.textContent = `${sy}年${sm}月${sd}日 - ${ey}年${em}月${ed}日`;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    elements.calendarDays.innerHTML = '';

    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(startOfWeek);
        currentDate.setDate(startOfWeek.getDate() + i);

        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';

        if (currentDate.getTime() === today.getTime()) {
            dayDiv.classList.add('today');
        }

        const dayNumber = document.createElement('div');
        dayNumber.className = 'calendar-day-number';
        dayNumber.textContent = `${currentDate.getMonth() + 1}/${currentDate.getDate()}`;
        dayDiv.appendChild(dayNumber);

        const dateStr = formatDateForCompare(currentDate);
        const dayTasks = tasks.filter(task => {
            if (!task.deadline || task.completed) return false;
            return task.deadline.substring(0, 10) === dateStr;
        });

        dayTasks.forEach(task => {
            const taskDiv = document.createElement('div');
            const calendarCategoryClass = task.category === 'private' ? 'calendar-task-private' : 'calendar-task-work';
            taskDiv.className = `calendar-task ${calendarCategoryClass}`;
            taskDiv.textContent = task.name;
            taskDiv.title = `${task.name}\nカテゴリ: ${task.category === 'private' ? 'プライベート' : '仕事'}\n重要度: ${getPriorityLabel(task.priority)}\n進捗: ${task.progress}%`;
            taskDiv.onclick = () => openTaskModal(task.id);
            dayDiv.appendChild(taskDiv);
        });

        elements.calendarDays.appendChild(dayDiv);
    }
}

function renderCalendarDay() {
    document.querySelector('.calendar-grid').style.display = 'none';
    const dayView = document.getElementById('calendarDayView');
    dayView.style.display = 'block';

    const current = new Date(currentCalendarDate);
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    elements.currentMonthYear.textContent = `${current.getFullYear()}年${current.getMonth() + 1}月${current.getDate()}日（${dayNames[current.getDay()]}）`;

    const dateStr = formatDateForCompare(current);
    const dayTasks = tasks.filter(task => {
        if (!task.deadline || task.completed) return false;
        return task.deadline.substring(0, 10) === dateStr;
    });

    dayView.innerHTML = '';

    if (dayTasks.length === 0) {
        dayView.innerHTML = '<p class="no-task-message">この日のタスクはありません。</p>';
        return;
    }

    dayTasks.sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));

    dayTasks.forEach(task => {
        const taskEl = document.createElement('div');
        const categoryClass = task.category === 'private' ? 'day-task-private' : 'day-task-work';
        taskEl.className = `calendar-day-task ${categoryClass}`;
        taskEl.style.cursor = 'pointer';
        taskEl.onclick = () => openTaskModal(task.id);

        const timeStr = task.deadline && task.deadline.includes('T') ? task.deadline.substring(11, 16) : '';
        const categoryLabel = task.category === 'private' ? 'プライベート' : '仕事';

        taskEl.innerHTML = `
            <div class="calendar-day-task-name">${escapeHtml(task.name)}</div>
            <div class="calendar-day-task-info">
                ${timeStr ? `<span>🕐 ${timeStr}</span>` : ''}
                <span>📁 ${categoryLabel}</span>
                <span>⚡ ${getPriorityLabel(task.priority)}</span>
                <span>📊 ${task.progress}%</span>
            </div>
        `;
        dayView.appendChild(taskEl);
    });
}

function navigateCalendar(delta) {
    switch (calendarViewMode) {
        case 'week':
            currentCalendarDate.setDate(currentCalendarDate.getDate() + delta * 7);
            break;
        case 'day':
            currentCalendarDate.setDate(currentCalendarDate.getDate() + delta);
            break;
        default:
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
            break;
    }
    renderCalendar();
}

// ========================================
// ユーティリティ関数
// ========================================
function generateId() {
    return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getPriorityLabel(priority) {
    const labels = {
        high: '高',
        medium: '中',
        low: '低'
    };
    return labels[priority] || priority;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    let result = `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
    if (dateStr.includes('T')) {
        result += ` ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    return result;
}

function formatDateForCompare(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getDeadlineClass(dateStr) {
    if (!dateStr) return '';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(dateStr);
    deadline.setHours(0, 0, 0, 0);
    
    const diffDays = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'deadline-overdue';
    if (diffDays === 0) return 'deadline-today';
    if (diffDays <= 3) return 'deadline-soon';
    return '';
}

// グローバル関数として公開（HTMLのonclick用）
window.openTaskModal = openTaskModal;
window.openDeleteModal = openDeleteModal;
window.toggleMemo = toggleMemo;
window.completeTask = completeTask;
window.switchView = switchView;
window.restoreTask = restoreTask;

// カテゴリラベル取得
function getCategoryLabel(category) {
    const labels = {
        work: '仕事',
        private: 'プライベート'
    };
    return labels[category] || category;
}