// ========================================
// タスク管理アプリ - メインJavaScript（Firebase対応版）
// ========================================

// グローバル変数
let tasks = [];
let deleteTargetId = null;
let currentCalendarDate = new Date();
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
    calendarDays: document.getElementById('calendarDays')
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
    elements.prevMonthBtn.addEventListener('click', () => navigateMonth(-1));
    elements.nextMonthBtn.addEventListener('click', () => navigateMonth(1));

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
}

// ========================================
// ビュー切り替え
// ========================================
function switchView(view) {
    if (view === 'list') {
        elements.listView.style.display = 'block';
        elements.calendarView.style.display = 'none';
        elements.showListBtn.classList.add('active');
        elements.showCalendarBtn.classList.remove('active');
    } else {
        elements.listView.style.display = 'none';
        elements.calendarView.style.display = 'block';
        elements.showListBtn.classList.remove('active');
        elements.showCalendarBtn.classList.add('active');
        renderCalendar();
    }
}

// ========================================
// タスクカードの表示
// ========================================
function renderTaskCards(filteredTasks = null) {
    const displayTasks = filteredTasks || tasks;
    
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
        card.className = `task-card priority-${task.priority}-border`;
        
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
            return task.deadline >= deadlineFrom;
        });
    }

    if (deadlineTo) {
        filtered = filtered.filter(task => {
            if (!task.deadline) return false;
            return task.deadline <= deadlineTo;
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
// カレンダー機能
// ========================================
function renderCalendar() {
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
        const dayTasks = tasks.filter(task => task.deadline === dateStr);

        const maxDisplay = 3;
        dayTasks.slice(0, maxDisplay).forEach(task => {
            const taskDiv = document.createElement('div');
            taskDiv.className = `calendar-task priority-${task.priority}-bg`;
            taskDiv.textContent = task.name;
            taskDiv.title = `${task.name}\n重要度: ${getPriorityLabel(task.priority)}\n進捗: ${task.progress}%`;
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

function navigateMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
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
    return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
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

// カテゴリラベル取得
function getCategoryLabel(category) {
    const labels = {
        work: '仕事',
        private: 'プライベート'
    };
    return labels[category] || category;
}