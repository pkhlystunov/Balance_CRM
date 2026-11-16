/**
 * Логика реестра выдачи СИЗ (siz-registry.html).
 * Доступ: admin, engineer, chief_engineer (просмотр), kladovshchik (полный).
 */
import { supabase } from '../supabase.js';
import { requireRoles, getCurrentRole, logout } from '../auth.js';
import { escapeHtml, displayValue, getEl } from '../utils.js';

let allData = [];
const WARNING_DAYS_BEFORE_EXPIRY = 60;

// ===== НОВЫЕ ФУНКЦИИ ДЛЯ НАВИГАЦИИ И АВТОРИЗАЦИИ =====

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
    
    // Пункты, видимые ТОЛЬКО админу
    const adminOnlyIds = ['menu-users'];
    
    // Пункты, НЕДОСТУПНЫЕ кладовщику (он видит только СИЗ и Уведомления)
    const kladovshchikHiddenIds = [
        'menu-situational', 
        'menu-control', 
        'menu-test', 
        'menu-personnel', 
        'menu-sout', 
        'menu-analytics', 
        'menu-users'
    ];

    // Сначала скрываем всё для кладовщика
    if (role === 'kladovshchik') {
        kladovshchikHiddenIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    // Затем скрываем админские пункты для всех остальных
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

    // Восстановление состояния ПК
    if (localStorage.getItem('sidebar_collapsed') === 'true') {
        sidebar.classList.add('collapsed');
        if (icon) icon.className = 'fas fa-chevron-right';
    }

    // Сворачивание на ПК
    toggleBtn?.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const isCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('sidebar_collapsed', isCollapsed);
        if (icon) {
            icon.className = isCollapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
        }
    });

    // Мобильное меню
    mobileToggle?.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
    });

    // Закрытие при клике вне меню на мобильных
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && 
            !sidebar.contains(e.target) && 
            !mobileToggle.contains(e.target) && 
            sidebar.classList.contains('mobile-open')) {
            sidebar.classList.remove('mobile-open');
        }
    });
}

// ===== ВАША ОРИГИНАЛЬНАЯ ЛОГИКА НИЖЕ =====

/**
 * Разбор даты в форматах ДД.ММ.ГГГГ и ММ.ГГГГ.
 */
function parseDate(dateStr) {
    if (!dateStr || dateStr.trim() === '') return null;
    dateStr = dateStr.trim();
    if (/^\d{2}\.\d{4}$/.test(dateStr)) {
        const [month, year] = dateStr.split('.');
        return new Date(parseInt(year), parseInt(month) - 1, 1);
    }
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) {
        const [day, month, year] = dateStr.split('.');
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    return null;
}

/**
 * Статус СИЗ: ЗИМА = 24 месяца, ЛЕТО = 12 месяцев.
 */
function getSizStatus(issueDateStr, season) {
    const issueDate = parseDate(issueDateStr);
    if (!issueDate) return { status: 'none', label: '⚪ Не выдано', class: 'status-none' };

    const now = new Date();
    const expiryDate = new Date(issueDate);
    const wearPeriodMonths = season === 'winter' ? 24 : 12;
    expiryDate.setMonth(expiryDate.getMonth() + wearPeriodMonths);

    const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) return { status: 'expired', label: '❌ Просрочено', class: 'status-expired' };
    if (daysUntilExpiry < WARNING_DAYS_BEFORE_EXPIRY) return { status: 'warning', label: '⚠️ Истекает', class: 'status-warning' };
    return { status: 'ok', label: '✅ Актуально', class: 'status-ok' };
}

/**
 * Загрузка данных из БД.
 */
async function loadData() {
    const { data, error } = await supabase.from('employees_siz').select('*').order('full_name');
    if (error) {
        console.error('Ошибка:', error);
        getEl('tableBody').innerHTML = '<tr><td colspan="14" class="empty-state">Ошибка загрузки данных</td></tr>';
        return;
    }
    allData = data || [];
}

/**
 * Заполнение фильтров по организациям и категориям.
 */
function populateFilters() {
    const orgs = new Set(), cats = new Set();
    allData.forEach(row => {
        if (row.organization) orgs.add(row.organization);
        if (row.category) cats.add(row.category);
    });

    const orgSelect = getEl('filterOrg');
    orgs.forEach(org => { const opt = document.createElement('option'); opt.value = org; opt.textContent = org; orgSelect.appendChild(opt); });

    const catSelect = getEl('filterCategory');
    cats.forEach(cat => { const opt = document.createElement('option'); opt.value = cat; opt.textContent = cat; catSelect.appendChild(opt); });
}

/**
 * Фильтрация данных по условиям.
 */
function getFilteredData() {
    const name = getEl('filterName').value.toLowerCase();
    const org = getEl('filterOrg').value;
    const cat = getEl('filterCategory').value;
    const status = getEl('filterStatus').value;

    const filtered = allData.filter(row => {
        if (name && !row.full_name.toLowerCase().includes(name)) return false;
        if (org && row.organization !== org) return false;
        if (cat && row.category !== cat) return false;
        if (status) {
            const s1 = getSizStatus(row.summer_issue_date, 'summer').status;
            const s2 = getSizStatus(row.winter_issue_date, 'winter').status;
            if (status === 'none' && s1 !== 'none' && s2 !== 'none') return false;
            if (status !== 'none' && s1 !== status && s2 !== status) return false;
        }
        return true;
    });

    // Уволенные всегда в конце, остальные по алфавиту
    filtered.sort((a, b) => {
        const isAFired = a.status === 'Уволен';
        const isBFired = b.status === 'Уволен';
        if (isAFired && !isBFired) return 1;
        if (!isAFired && isBFired) return -1;
        return a.full_name.localeCompare(b.full_name);
    });

    return filtered;
}

/**
 * Обновление статистики.
 */
function updateStats(filtered) {
    let ok = 0, warn = 0, exp = 0, activeCount = 0;

    filtered.forEach(row => {
        if (row.status === 'Уволен') return;

        activeCount++;
        const s1 = getSizStatus(row.summer_issue_date, 'summer').status;
        const s2 = getSizStatus(row.winter_issue_date, 'winter').status;
        const worst = [s1, s2].includes('expired') ? 'expired' : [s1, s2].includes('warning') ? 'warning' : [s1, s2].includes('ok') ? 'ok' : 'none';

        if (worst === 'ok') ok++;
        else if (worst === 'warning') warn++;
        else if (worst === 'expired') exp++;
    });

    getEl('statTotal').textContent = activeCount;
    getEl('statOk').textContent = ok;
    getEl('statWarning').textContent = warn;
    getEl('statExpired').textContent = exp;
}

/**
 * Отрисовка таблицы.
 */
function renderTable() {
    const filtered = getFilteredData();
    updateStats(filtered);
    const tbody = getEl('tableBody');

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="14" class="empty-state">Нет данных по выбранным фильтрам</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(row => {
        const sSummer = getSizStatus(row.summer_issue_date, 'summer');
        const sWinter = getSizStatus(row.winter_issue_date, 'winter');
        let rowClass = '';
        if (row.status !== 'Уволен') {
            if (sSummer.status === 'expired' || sWinter.status === 'expired') rowClass = 'row-expired';
            else if (sSummer.status === 'warning' || sWinter.status === 'warning') rowClass = 'row-warning';
        }

        const employeeStatusClass = row.status === 'Уволен' ? 'status-fired' : 'status-active';
        const employeeStatusLabel = row.status === 'Уволен' ? '❌ Уволен' : '✅ Активен';
        const comments = row.comments || '';
        const commentsShort = comments.length > 50 ? comments.substring(0, 50) + '...' : comments;
        const id = escapeHtml(row.id);

        return `
            <tr class="${rowClass}" style="${row.status === 'Уволен' ? 'opacity: 0.6; background: #f9f9f9;' : ''}">
                <td>${displayValue(row.category)}</td>
                <td><strong>${displayValue(row.full_name)}</strong></td>
                <td>${displayValue(row.position)}</td>
                <td>${displayValue(row.organization)}</td>
                <td>${displayValue(row.clothing_size)}</td>
                <td>${displayValue(row.height)}</td>
                <td>${displayValue(row.shoe_size)}</td>
                <td>${displayValue(row.summer_issue_date)}</td>
                <td><span class="status-badge ${sSummer.class}">${sSummer.label}</span></td>
                <td>${displayValue(row.winter_issue_date)}</td>
                <td><span class="status-badge ${sWinter.class}">${sWinter.label}</span></td>
                <td><span class="status-badge ${employeeStatusClass}">${employeeStatusLabel}</span></td>
                <td title="${escapeHtml(comments)}" style="max-width: 250px; font-size: 12px; color: #666; overflow: hidden; text-overflow: ellipsis;">
                    ${comments ? escapeHtml(commentsShort) : '—'}
                </td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="openModal('edit', '${id}')">✏️</button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Экспорт в Excel.
 */
window.exportToExcel = function() {
    const filtered = getFilteredData();

    if (filtered.length === 0) {
        alert('Нет данных для экспорта');
        return;
    }

    const data = filtered.map(row => {
        const sSummer = getSizStatus(row.summer_issue_date, 'summer');
        const sWinter = getSizStatus(row.winter_issue_date, 'winter');

        return {
            'Категория': row.category || '',
            'ФИО': row.full_name || '',
            'Должность': row.position || '',
            'Организация': row.organization || '',
            'Дата приема': row.hire_date || '',
            'Размер одежды': row.clothing_size || '',
            'Рост': row.height || '',
            'Размер обуви': row.shoe_size || '',
            'Получение Лето': row.summer_issue_date || '',
            'Статус Лето': sSummer.label,
            'Получение Зима': row.winter_issue_date || '',
            'Статус Зима': sWinter.label,
            'Статус сотрудника': row.status || '',
            'Комментарии': row.comments || ''
        };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Реестр СИЗ');

    ws['!cols'] = [
        { wch: 12 }, { wch: 35 }, { wch: 30 }, { wch: 20 }, { wch: 14 },
        { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 15 },
        { wch: 14 }, { wch: 15 }, { wch: 12 }, { wch: 40 }
    ];

    const fileName = `Реестр_СИЗ_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
};

/**
 * Открытие модального окна.
 */
window.openModal = function(mode, id = null) {
    const form = getEl('sizForm');
    form.reset();
    getEl('editId').value = '';

    if (mode === 'edit' && id) {
        getEl('modalTitle').textContent = 'Редактировать запись';
        getEl('saveBtn').textContent = '💾 Обновить';
        getEl('editId').value = id;

        const row = allData.find(r => r.id === id);
        if (row) {
            getEl('f_category').value = row.category || '';
            getEl('f_full_name').value = row.full_name || '';
            getEl('f_position').value = row.position || '';
            getEl('f_organization').value = row.organization || '';
            getEl('f_hire_date').value = row.hire_date || '';
            getEl('f_clothing_size').value = row.clothing_size || '';
            getEl('f_height').value = row.height || '';
            getEl('f_shoe_size').value = row.shoe_size || '';
            getEl('f_summer_issue_date').value = row.summer_issue_date || '';
            getEl('f_winter_issue_date').value = row.winter_issue_date || '';
            getEl('f_status').value = row.status || 'Активен';
            getEl('f_comments').value = row.comments || '';
        }
    } else {
        getEl('modalTitle').textContent = 'Добавить сотрудника';
        getEl('saveBtn').textContent = '💾 Добавить';
    }
    getEl('modal').classList.add('active');
};

window.closeModal = function() {
    getEl('modal').classList.remove('active');
};

/**
 * Сохранение записи.
 */
window.saveEmployee = async function(e) {
    e.preventDefault();
    const saveBtn = getEl('saveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Сохранение...';

    const id = getEl('editId').value;
    const payload = {
        category: getEl('f_category').value.trim(),
        full_name: getEl('f_full_name').value.trim(),
        position: getEl('f_position').value.trim(),
        organization: getEl('f_organization').value.trim(),
        hire_date: getEl('f_hire_date').value.trim(),
        clothing_size: getEl('f_clothing_size').value.trim(),
        height: getEl('f_height').value.trim(),
        shoe_size: getEl('f_shoe_size').value.trim(),
        summer_issue_date: getEl('f_summer_issue_date').value.trim(),
        winter_issue_date: getEl('f_winter_issue_date').value.trim(),
        status: getEl('f_status').value,
        comments: getEl('f_comments').value.trim()
    };

    let error;
    if (id) {
        const res = await supabase.from('employees_siz').update(payload).eq('id', id);
        error = res.error;
    } else {
        const res = await supabase.from('employees_siz').insert(payload);
        error = res.error;
    }

    if (error) {
        alert('Ошибка сохранения: ' + error.message);
    } else {
        closeModal();
        await loadData();
        populateFilters();
        renderTable();
    }

    saveBtn.disabled = false;
    saveBtn.textContent = id ? '💾 Обновить' : '💾 Добавить';
};

async function init() {
    // ✅ РАЗРЕШЕН ДОСТУП ДЛЯ KLADOVSHCHIK
    const session = await requireRoles(['admin', 'engineer', 'chief_engineer', 'kladovshchik']);
    if (!session) return;

    // 1. Обновляем имя и роль
    await updateUserInfo();

    const role = getCurrentRole();

    // 2. Управление правами доступа
    // Кнопка добавления видна всем, кроме chief_engineer
    if (role === 'admin' || role === 'engineer' || role === 'kladovshchik') {
        const btnAdd = getEl('btnAddEmployee');
        if (btnAdd) btnAdd.style.display = 'inline-block';
    }

    if (role === 'chief_engineer') {
        document.body.classList.add('read-only-mode');
    }

    // 3. Настраиваем боковое меню под роль
    applyRoleToSidebar();
    initSidebar();

    // 4. Загрузка данных
    await loadData();
    populateFilters();
    renderTable();
}

['filterName', 'filterOrg', 'filterCategory', 'filterStatus'].forEach(id => {
    getEl(id).addEventListener('input', renderTable);
    getEl(id).addEventListener('change', renderTable);
});

getEl('modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
});

window.handleLogout = logout;

init();