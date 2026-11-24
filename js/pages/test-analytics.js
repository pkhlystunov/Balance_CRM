/**
 * Логика аналитики тестирования (test-analytics.html).
 * Доступ: admin, engineer (проверка роли по БД через js/auth.js).
 */
import { supabase } from '../supabase.js';
import { requireRoles, getCurrentRole, logout } from '../auth.js';
import { escapeHtml, getEl } from '../utils.js';

let allResults = [];
let programs = [];

// ===== НОВЫЕ ФУНКЦИИ ДЛЯ НАВИГАЦИИ =====
/**
 * Надежное обновление имени и роли в шапке.
 */
async function updateUserInfo() {
    try {
        const userEl = document.getElementById('user-name');
        if (!userEl) return;
        let userName = localStorage.getItem('user_name');
        let role = localStorage.getItem('user_role');
        if (!userName || !role) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('full_name, name, role')
                    .eq('id', session.user.id)
                    .single();
                if (profile) {
                    userName = profile.full_name || profile.name || 'Пользователь';
                    role = profile.role || 'user';
                    localStorage.setItem('user_name', userName);
                    localStorage.setItem('user_role', role);
                } else {
                    userName = session.user.email?.split('@')[0] || 'Пользователь';
                    role = 'user';
                }
            }
        }
        userEl.textContent = `${userName} (${role})`;
    } catch (error) {
        console.error('Ошибка загрузки данных пользователя:', error);
        const userEl = document.getElementById('user-name');
        if (userEl) userEl.textContent = 'Ошибка загрузки';
    }
}

/**
 * Скрывает пункты бокового меню, недоступные для текущей роли.
 */
function applyRoleToSidebar() {
    const role = localStorage.getItem('user_role');
    const adminOnlyIds = ['menu-users'];
    
    // ВАЖНО: 'menu-siz' НЕ в этом списке (кладовщик его видит).
    // 'menu-tech' добавлен, чтобы скрыть новый модуль.
    const kladovshchikHiddenIds = [
        'menu-situational', 'menu-control', 'menu-test',
        'menu-personnel', 'menu-sout', 'menu-tech', 'menu-analytics', 'menu-users'
    ];
    
    if (role === 'kladovshchik' || role === 'user') {
        kladovshchikHiddenIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }
    if (role !== 'admin') {
        adminOnlyIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }
}

/**
 * Инициализация сворачивания меню.
 */
function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggle-sidebar');
    const mobileToggle = document.getElementById('mobile-toggle');
    const icon = toggleBtn?.querySelector('i');
    if (localStorage.getItem('sidebar_collapsed') === 'true') {
        sidebar.classList.add('collapsed');
        if (icon) icon.className = 'fas fa-chevron-right';
    }
    toggleBtn?.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const isCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('sidebar_collapsed', isCollapsed);
        if (icon) {
            icon.className = isCollapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
        }
    });
    mobileToggle?.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
    });
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 &&
            !sidebar.contains(e.target) &&
            !mobileToggle.contains(e.target) &&
            sidebar.classList.contains('mobile-open')) {
            sidebar.classList.remove('mobile-open');
        }
    });
}
// ===== КОНЕЦ НОВЫХ ФУНКЦИЙ =====

/**
 * Загрузка программ тестирования.
 */
async function loadPrograms() {
    const { data, error } = await supabase
        .from('test_programs')
        .select('*')
        .order('name');

    if (error) {
        console.error('Ошибка загрузки программ:', error);
        return;
    }

    programs = data;
    const select = getEl('filterProgram');
    programs.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
}

/**
 * Загрузка результатов тестов.
 */
async function loadResults() {
    const { data, error } = await supabase
        .from('test_results')
        .select(`
            *,
            test_programs(name)
        `)
        .order('test_date', { ascending: false });

    if (error) {
        console.error('Ошибка загрузки результатов:', error);
        getEl('employeeList').innerHTML = '<div class="empty-state">Ошибка загрузки данных</div>';
        return;
    }

    allResults = data;
    updateStats();
    renderEmployees();
}

/**
 * Обновление сводной статистики.
 */
function updateStats() {
    const total = allResults.length;
    const passed = allResults.filter(r => r.passed).length;
    const failed = total - passed;
    const employees = new Set(allResults.map(r => r.employee_name)).size;

    getEl('statTotal').textContent = total;
    getEl('statPassed').textContent = passed;
    getEl('statFailed').textContent = failed;
    getEl('statEmployees').textContent = employees;
}

/**
 * Фильтрация результатов.
 */
function getFilteredResults() {
    const nameFilter = getEl('filterName').value.toLowerCase();
    const programFilter = getEl('filterProgram').value;
    const statusFilter = getEl('filterStatus').value;
    const dateFrom = getEl('filterDateFrom').value;
    const dateTo = getEl('filterDateTo').value;

    return allResults.filter(r => {
        if (nameFilter && !r.employee_name.toLowerCase().includes(nameFilter)) return false;
        if (programFilter && r.program_id !== programFilter) return false;
        if (statusFilter === 'passed' && !r.passed) return false;
        if (statusFilter === 'failed' && r.passed) return false;
        if (dateFrom) {
            const testDate = new Date(r.test_date);
            const fromDate = new Date(dateFrom);
            if (testDate < fromDate) return false;
        }
        if (dateTo) {
            const testDate = new Date(r.test_date);
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59);
            if (testDate > toDate) return false;
        }
        return true;
    });
}

/**
 * Отрисовка списка сотрудников с раскрытием деталей (данные экранируются).
 */
function renderEmployees() {
    const filtered = getFilteredResults();

    if (filtered.length === 0) {
        getEl('employeeList').innerHTML = '<div class="empty-state">Нет данных по выбранным фильтрам</div>';
        return;
    }

    // Группировка по ФИО
    const grouped = {};
    filtered.forEach(r => {
        if (!grouped[r.employee_name]) {
            grouped[r.employee_name] = [];
        }
        grouped[r.employee_name].push(r);
    });

    const list = getEl('employeeList');
    list.innerHTML = '';

    Object.keys(grouped).sort().forEach(name => {
        const records = grouped[name];
        const passedCount = records.filter(r => r.passed).length;
        const failedCount = records.length - passedCount;

        const item = document.createElement('div');
        item.className = 'employee-item';

        const header = document.createElement('div');
        header.className = 'employee-header';
        header.innerHTML = `
            <span class="name">${escapeHtml(name)}</span>
            <div class="stats">
                <span class="stat total">${records.length} тестов</span>
                <span class="stat passed">${passedCount} прошли</span>
                <span class="stat failed">${failedCount} не прошли</span>
                <span class="toggle-icon">▼</span>
            </div>
        `;

        const details = document.createElement('div');
        details.className = 'employee-details';

        records.forEach(r => {
            const record = document.createElement('div');
            record.className = `test-record ${r.passed ? 'passed' : 'failed'}`;
            const date = new Date(r.test_date).toLocaleString('ru-RU');
            record.innerHTML = `
                <div class="date">${escapeHtml(date)}</div>
                <div class="program">${escapeHtml(r.test_programs?.name || 'Неизвестная программа')}</div>
                <div class="result">
                    <span class="score">${r.score}/${r.total_questions} (${r.percentage}%)</span>
                    <span class="status ${r.passed ? 'passed' : 'failed'}">
                        ${r.passed ? '✅ Прошёл' : '❌ Не прошёл'}
                    </span>
                </div>
            `;
            details.appendChild(record);
        });

        header.addEventListener('click', () => {
            header.classList.toggle('active');
            details.classList.toggle('active');
        });

        item.appendChild(header);
        item.appendChild(details);
        list.appendChild(item);
    });
}

/**
 * Экспорт в Excel.
 */
window.exportToExcel = function() {
    const filtered = getFilteredResults();

    if (filtered.length === 0) {
        alert('Нет данных для экспорта. Сначала примените фильтры.');
        return;
    }

    const data = filtered.map(r => ({
        'ФИО': r.employee_name || '',
        'Название теста': r.test_programs?.name || '',
        'Дата прохождения': new Date(r.test_date).toLocaleDateString('ru-RU'),
        'Баллы': `${r.score}/${r.total_questions}`,
        'Процент': `${r.percentage}%`,
        'Результат': r.passed ? 'Прошёл' : 'Не прошёл'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Результаты тестов');

    ws['!cols'] = [
        { wch: 35 }, { wch: 40 }, { wch: 18 },
        { wch: 12 }, { wch: 10 }, { wch: 15 }
    ];

    const fileName = `Аналитика_тестирования_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
};

/**
 * Подключение обработчиков фильтров.
 */
function setupFilters() {
    const inputs = ['filterName', 'filterProgram', 'filterStatus', 'filterDateFrom', 'filterDateTo'];
    inputs.forEach(id => {
        getEl(id).addEventListener('input', renderEmployees);
        getEl(id).addEventListener('change', renderEmployees);
    });
}

async function init() {
    const session = await requireRoles(['admin', 'engineer']);
    if (!session) return;

    // 1. Обновляем имя и роль
    await updateUserInfo();
    // 2. Настраиваем боковое меню
    applyRoleToSidebar();
    initSidebar();

    // 3. Загружаем данные
    await loadPrograms();
    await loadResults();
    setupFilters();
}

window.handleLogout = logout;
init();