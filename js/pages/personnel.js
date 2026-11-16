/**
 * Логика учёта обучения и медосмотров (personnel.html).
 * Доступ: admin, engineer, chief_engineer (только просмотр).
 */
import { supabase } from '../supabase.js';
import { requireRoles, getCurrentRole, logout } from '../auth.js';
import { escapeHtml, getEl } from '../utils.js';

let allData = [];

// Все поля записи
const DATA_FIELDS = [
    'category','full_name','position','organization','hire_date','status',
    'mo_date','mo_valid','opo_date','opo_valid',
    'ot_a_date','ot_a_valid','ot_ruk_date','ot_ruk_valid','ot_b_date','ot_b_valid','ot_v_date','ot_v_valid',
    'rpo_ot_v_date','rpo_ot_v_valid','udost_prof_date','udost_prof_valid','pp_date','pp_valid',
    'siz_ot_date','siz_ot_valid','ptm_date','ptm_valid','pozhbez_date','pozhbez_valid','pozhbez_journal',
    'a1_date','a1_valid','b931_date','b931_valid','eb_g1_date','eb_g1_valid','gaz_b7_date','gaz_b7_valid',
    'teplo_g2_date','teplo_g2_valid'
];

// Поля-даты для статистики «истекает»
const DATE_FIELDS = [
    'mo_valid','opo_valid','ot_a_valid','ot_ruk_valid','ot_b_valid','ot_v_valid','rpo_ot_v_valid',
    'udost_prof_valid','pp_valid','siz_ot_valid','ptm_valid','pozhbez_valid','a1_valid','b931_valid',
    'eb_g1_valid','gaz_b7_valid','teplo_g2_valid'
];

/**
 * Надежное обновление имени и роли в шапке.
 * Берет из localStorage или запрашивает напрямую из БД.
 */
async function updateUserInfo() {
    try {
        const userEl = document.getElementById('user-name');
        if (!userEl) return;

        let userName = localStorage.getItem('user_name');
        let role = localStorage.getItem('user_role');

        // Если в хранилище пусто — идем в БД
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
 * Инициализация бокового меню.
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

    // Скрытие админских пунктов
    const role = getCurrentRole();
    if (role !== 'admin') {
        const menuUsers = document.getElementById('menu-users');
        if (menuUsers) menuUsers.style.display = 'none';
    }
}

/**
 * Разбор даты ДД.ММ.ГГГГ с учётом служебных значений.
 */
function parseDate(str) {
    if (!str || str.trim() === '' || str.toLowerCase() === 'н/т' || str.toLowerCase() === 'продлить' || str.toLowerCase() === 'бессрочно') return null;
    const parts = str.trim().split('.');
    if (parts.length === 3) {
        return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    return null;
}

/**
 * Статус ячейки с датой.
 */
function getStatus(dateStr) {
    if (!dateStr) return { class: 'cell-empty', text: '' };
    const val = dateStr.trim().toLowerCase();
    if (val === 'н/т') return { class: 'cell-nt', text: 'н/т' };
    if (val === 'продлить' || val === 'бессрочно') return { class: 'cell-ok', text: dateStr };

    const date = parseDate(dateStr);
    if (!date) return { class: 'cell-empty', text: dateStr };

    const now = new Date();
    const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { class: 'cell-expired', text: dateStr, title: `Просрочено на ${Math.abs(diffDays)} дн.` };
    if (diffDays <= 60) return { class: 'cell-warning', text: dateStr, title: `Истекает через ${diffDays} дн.` };
    return { class: 'cell-ok', text: dateStr };
}

/**
 * Загрузка данных из БД.
 */
async function loadData() {
    const { data, error } = await supabase.from('employees_training').select('*').order('organization').order('full_name');
    if (error) { console.error(error); return; }
    allData = data || [];
}

/**
 * Заполнение фильтров.
 */
function populateFilters() {
    const orgs = new Set(), cats = new Set();
    allData.forEach(row => {
        if (row.organization) orgs.add(row.organization);
        if (row.category) cats.add(row.category);
    });

    const orgSelect = getEl('filterOrg');
    orgSelect.innerHTML = '<option value="">Все организации</option>';
    Array.from(orgs).sort().forEach(org => {
        const opt = document.createElement('option');
        opt.value = org;
        opt.textContent = org;
        orgSelect.appendChild(opt);
    });

    const catSelect = getEl('filterCategory');
    catSelect.innerHTML = '<option value="">Все категории</option><option value="РАБОЧИЕ">Рабочие</option><option value="ИТР">ИТР</option>';
    Array.from(cats).sort().forEach(cat => {
        if (cat !== 'РАБОЧИЕ' && cat !== 'ИТР') {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            catSelect.appendChild(opt);
        }
    });
}

/**
 * Фильтрация данных.
 */
function getFilteredData() {
    const name = getEl('filterName').value.toLowerCase();
    const org = getEl('filterOrg').value;
    const cat = getEl('filterCategory').value;
    const showFired = getEl('showFired').checked;

    return allData.filter(row => {
        if (name && !row.full_name.toLowerCase().includes(name)) return false;
        if (org && row.organization !== org) return false;
        if (cat && row.category !== cat) return false;
        if (!showFired && row.status === 'Уволен') return false;
        return true;
    });
}

/**
 * Обновление статистики.
 */
function updateStats(filtered) {
    let active = 0, fired = 0, warning = 0;

    filtered.forEach(row => {
        if (row.status === 'Работает') active++;
        else if (row.status === 'Уволен') fired++;

        if (row.status === 'Работает') {
            DATE_FIELDS.forEach(field => {
                const status = getStatus(row[field]);
                if (status.class === 'cell-warning') warning++;
            });
        }
    });
    getEl('statTotal').textContent = filtered.length;
    getEl('statActive').textContent = active;
    getEl('statFired').textContent = fired;
    getEl('statWarning').textContent = warning;
}

/**
 * Отрисовка таблицы.
 */
function renderTable() {
    const filtered = getFilteredData();
    updateStats(filtered);
    const tbody = getEl('tableBody');

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="39" class="empty-state">Нет данных</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(row => {
        const cells = DATA_FIELDS.slice(6).map(f => {
            if (f === 'pozhbez_journal' || !f.endsWith('_valid')) {
                return `<td>${escapeHtml(row[f]) || '—'}</td>`;
            }
            const status = getStatus(row[f]);
            return `<td class="${status.class}" title="${escapeHtml(status.title || '')}">${escapeHtml(status.text) || '—'}</td>`;
        }).join('');

        const statusClass = row.status === 'Уволен' ? 'status-fired' : 'status-active';
        const statusLabel = row.status === 'Уволен' ? '❌ Уволен' : '✅ Работает';
        const rowClass = row.status === 'Уволен' ? 'row-fired' : '';
        const id = escapeHtml(row.id);

        return `
            <tr onclick="openModal('${id}')" style="cursor: pointer;" class="${rowClass}">
                <td class="sticky-col">${escapeHtml(row.full_name)}</td>
                <td class="sticky-col-2">${escapeHtml(row.position) || '—'}</td>
                <td class="sticky-col-3">${escapeHtml(row.organization) || '—'}</td>
                <td class="sticky-col-4"><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                ${cells}
            </tr>
        `;
    }).join('');
}

/**
 * Открытие модального окна.
 */
window.openModal = function(id) {
    const form = getEl('editForm');
    form.reset();
    getEl('editId').value = '';

    if (id) {
        const row = allData.find(r => r.id === id);
        if (!row) return;
        getEl('editId').value = id;
        getEl('modalTitle').textContent = `Редактировать: ${row.full_name}`;

        DATA_FIELDS.forEach(f => {
            const el = getEl(`f_${f}`);
            if (el) el.value = row[f] || '';
        });
    } else {
        getEl('modalTitle').textContent = 'Добавить сотрудника';
    }
    getEl('modal').classList.add('active');
};

window.closeModal = function() {
    getEl('modal').classList.remove('active');
};

/**
 * Сохранение записи.
 */
window.saveData = async function(e) {
    e.preventDefault();
    const id = getEl('editId').value;

    const payload = {};
    DATA_FIELDS.forEach(f => { payload[f] = getEl(`f_${f}`).value.trim() || null; });

    const btn = getEl('saveBtn');
    btn.disabled = true; btn.textContent = 'Сохранение...';

    let error;
    if (id) {
        const res = await supabase.from('employees_training').update(payload).eq('id', id);
        error = res.error;
    } else {
        const res = await supabase.from('employees_training').insert(payload);
        error = res.error;
    }

    if (error) { alert('Ошибка: ' + error.message); }
    else { closeModal(); await loadData(); populateFilters(); renderTable(); }

    btn.disabled = false; btn.textContent = '💾 Сохранить';
};

/**
 * Экспорт в Excel.
 */
window.exportToExcel = function() {
    const filtered = getFilteredData();

    if (filtered.length === 0) {
        alert('Нет данных для экспорта');
        return;
    }

    const data = filtered.map(row => ({
        'Категория': row.category || '',
        'ФИО': row.full_name || '',
        'Должность': row.position || '',
        'Организация': row.organization || '',
        'Дата приёма': row.hire_date || '',
        'Статус': row.status || '',
        'МО дата': row.mo_date || '',
        'МО до': row.mo_valid || '',
        'ОПО дата': row.opo_date || '',
        'ОПО до': row.opo_valid || '',
        'ОТ(А) дата': row.ot_a_date || '',
        'ОТ(А) до': row.ot_a_valid || '',
        'ОТ(рук) дата': row.ot_ruk_date || '',
        'ОТ(рук) до': row.ot_ruk_valid || '',
        'ОТ(Б) дата': row.ot_b_date || '',
        'ОТ(Б) до': row.ot_b_valid || '',
        'ОТ(В) дата': row.ot_v_date || '',
        'ОТ(В) до': row.ot_v_valid || '',
        'РПО ОТ(В) дата': row.rpo_ot_v_date || '',
        'РПО ОТ(В) до': row.rpo_ot_v_valid || '',
        'Удост. проф. дата': row.udost_prof_date || '',
        'Удост. проф. до': row.udost_prof_valid || '',
        'ПП дата': row.pp_date || '',
        'ПП до': row.pp_valid || '',
        'СИЗ ОТ дата': row.siz_ot_date || '',
        'СИЗ ОТ до': row.siz_ot_valid || '',
        'ПТМ дата': row.ptm_date || '',
        'ПТМ до': row.ptm_valid || '',
        'ПожБез дата': row.pozhbez_date || '',
        'ПожБез до': row.pozhbez_valid || '',
        'ПожБез журнал': row.pozhbez_journal || '',
        'А1 дата': row.a1_date || '',
        'А1 до': row.a1_valid || '',
        'Б.9.31 дата': row.b931_date || '',
        'Б.9.31 до': row.b931_valid || '',
        'ЭБ Г.1 дата': row.eb_g1_date || '',
        'ЭБ Г.1 до': row.eb_g1_valid || '',
        'ГАЗ Б.7 дата': row.gaz_b7_date || '',
        'ГАЗ Б.7 до': row.gaz_b7_valid || '',
        'ТЕПЛО Г.2 дата': row.teplo_g2_date || '',
        'ТЕПЛО Г.2 до': row.teplo_g2_valid || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Сотрудники');

    ws['!cols'] = [
        { wch: 12 }, { wch: 35 }, { wch: 45 }, { wch: 25 }, { wch: 12 }, { wch: 10 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }
    ];

    const fileName = `Обучение_сотрудников_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
};

/**
 * Главная функция инициализации.
 */
async function init() {
    const session = await requireRoles(['admin', 'engineer', 'chief_engineer']);
    if (!session) return;

    // 1. Обновляем имя и роль в шапке
    await updateUserInfo();

    const role = getCurrentRole();

    // 2. Управление правами доступа
    if (role === 'admin' || role === 'engineer') {
        const btnAdd = getEl('btnAddEmployee');
        if (btnAdd) btnAdd.style.display = 'inline-block';
    }

    if (role === 'chief_engineer') {
        document.body.classList.add('read-only-mode');
    }

    // 3. Инициализация бокового меню
    initSidebar();

    // 4. Загрузка данных
    await loadData();
    populateFilters();
    renderTable();
}

// Слушатели событий фильтров
['filterName', 'filterOrg', 'filterCategory'].forEach(id => {
    getEl(id).addEventListener('input', renderTable);
    getEl(id).addEventListener('change', renderTable);
});
getEl('showFired').addEventListener('change', renderTable);

// Глобальный выход
window.handleLogout = logout;

// Запуск
init();