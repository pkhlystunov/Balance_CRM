/**
 * Логика СОУТ и ОПР (sout-opr.html).
 * Доступ: admin, engineer, chief_engineer (только просмотр).
 */
import { supabase } from '../supabase.js';
import { requireRoles, getCurrentRole, logout } from '../auth.js';
import { escapeHtml, displayValue, getEl } from '../utils.js';

let allWorkplaces = [];
let allOprCards = [];

const companies = ['ООО СК Жилье', 'ООО СтройПодряд', 'ООО СЗ СТИУР-СК', 'АО СЗ Жилье-2000'];
const companyLabels = {
    'ООО СК Жилье': 'ООО "СК Жилье"',
    'ООО СтройПодряд': 'ООО "СтройПодряд"',
    'ООО СЗ СТИУР-СК': 'ООО "СЗ СТИУР-СК"',
    'АО СЗ Жилье-2000': 'АО "СЗ Жилье-2000"'
};

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
    const kladovshchikHiddenIds = [
        'menu-situational', 'menu-control', 'menu-test', 
        'menu-personnel', 'menu-sout', 'menu-analytics', 'menu-users'
    ];

    if (role === 'kladovshchik') {
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

// ===== ВАША ОРИГИНАЛЬНАЯ ЛОГИКА НИЖЕ =====

/**
 * Разбор даты ДД.ММ.ГГГГ с учётом служебных значений.
 */
function parseDate(str) {
    if (!str || str.trim() === '' || str.toLowerCase() === 'н/т' ||
        str.toLowerCase() === 'задекларировано' || str.toLowerCase() === 'декларация') return null;
    const parts = str.trim().split('.');
    if (parts.length === 3) {
        return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    return null;
}

function isExpired(dateStr) {
    const date = parseDate(dateStr);
    if (!date) return false;
    return date < new Date();
}

/**
 * CSS-класс по классу условий труда.
 */
function getClassColor(classValue) {
    if (!classValue) return '';
    const cls = classValue.replace(',', '.');
    if (cls === '2') return 'class-2';
    if (cls === '3.1') return 'class-3-1';
    if (cls === '3.2') return 'class-3-2';
    if (cls === '3.3') return 'class-3-3';
    if (cls === '3.4') return 'class-3-4';
    if (cls === '4') return 'class-4';
    return '';
}

/**
 * Загрузка данных из БД (СОУТ + карты ОПР).
 */
async function loadData() {
    const { data: soutData, error: soutError } = await supabase
        .from('sout_workplaces')
        .select('*')
        .order('company')
        .order('position');

    if (soutError) { console.error(soutError); return; }
    allWorkplaces = soutData || [];

    const { data: oprData, error: oprError } = await supabase
        .from('opr_cards')
        .select('*');

    if (oprError) { console.error(oprError); return; }
    allOprCards = oprData || [];
}

/**
 * Фильтрация рабочих мест по компании.
 */
function getFilteredWorkplaces(company) {
    const position = getEl('filterPosition').value.toLowerCase();
    const classFilter = getEl('filterClass').value;

    return allWorkplaces.filter(wp => {
        if (company && wp.company !== company) return false;
        if (position && !wp.position.toLowerCase().includes(position)) return false;
        if (classFilter && wp.class !== classFilter) return false;
        return true;
    });
}

/**
 * Поиск карты ОПР по должности и компании.
 */
function getOprCard(position, company) {
    return allOprCards.find(opr => opr.position === position && opr.company === company);
}

/**
 * Обновление статистики.
 */
function updateStats(filteredWorkplaces) {
    const total = filteredWorkplaces.length;
    const harmful = filteredWorkplaces.filter(wp => {
        const cls = wp.class?.replace(',', '.');
        return ['3.1', '3.2', '3.3', '3.4', '4'].includes(cls);
    }).length;
    const expired = filteredWorkplaces.filter(wp => isExpired(wp.valid_until)).length;
    const noOpr = filteredWorkplaces.filter(wp => {
        const opr = getOprCard(wp.position, wp.company);
        return !opr || !opr.card_number || opr.card_number.toLowerCase() === 'н/т';
    }).length;

    getEl('statTotal').textContent = total;
    getEl('statHarmful').textContent = harmful;
    getEl('statExpired').textContent = expired;
    getEl('statNoOpr').textContent = noOpr;
}

/**
 * Отрисовка аккордеона по компаниям.
 */
function renderAccordion() {
    const container = getEl('accordionContainer');
    const companyFilter = getEl('filterCompany').value;

    const companiesToShow = companyFilter ? [companyFilter] : companies;

    let allFiltered = [];
    companiesToShow.forEach(company => {
        allFiltered = allFiltered.concat(getFilteredWorkplaces(company));
    });
    updateStats(allFiltered);

    if (allFiltered.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет данных по выбранным фильтрам</div>';
        return;
    }

    container.innerHTML = companiesToShow.map((company, index) => {
        const workplaces = getFilteredWorkplaces(company);
        const isActive = index === 0 ? 'active' : '';

        if (workplaces.length === 0) return '';

        const rows = workplaces.map(wp => {
            const opr = getOprCard(wp.position, wp.company);
            const classColor = getClassColor(wp.class);
            const isDecl = wp.valid_until?.toLowerCase() === 'задекларировано' || wp.valid_until?.toLowerCase() === 'декларация';
            const validClass = isDecl ? 'class-declared' : classColor;
            const expiredClass = isExpired(wp.valid_until) ? 'cell-expired' : '';
            const id = escapeHtml(wp.id);

            return `
                <tr>
                    <td>${displayValue(wp.rm_number)}</td>
                    <td><strong>${displayValue(wp.position)}</strong></td>
                    <td class="${validClass}">${displayValue(wp.class)}</td>
                    <td>${displayValue(wp.sout_date)}</td>
                    <td class="${validClass} ${expiredClass}">${displayValue(wp.valid_until)}</td>
                    <td>${displayValue(opr?.card_number)}</td>
                    <td>${displayValue(opr?.opr_date)}</td>
                    <td>${displayValue(opr?.has_people)}</td>
                    <td>
                        <button class="btn btn-primary btn-sm" onclick="openModal('${id}')">✏️</button>
                    </td>
                </tr>
            `;
        }).join('');

        const tableHtml = `
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>№ РМ</th>
                            <th>Должность</th>
                            <th>Класс</th>
                            <th>Дата СОУТ</th>
                            <th>Срок действия</th>
                            <th>№ карты ОПР</th>
                            <th>Дата ОПР</th>
                            <th>Факт людей</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;

        return `
            <div class="accordion">
                <div class="accordion-header ${isActive}" onclick="toggleAccordion(this)">
                    <span>${escapeHtml(companyLabels[company])} (${workplaces.length})</span>
                    <span class="arrow">▼</span>
                </div>
                <div class="accordion-content ${isActive}">
                    ${tableHtml}
                </div>
            </div>
        `;
    }).filter(html => html !== '').join('');
}

window.toggleAccordion = function(header) {
    header.classList.toggle('active');
    const content = header.nextElementSibling;
    content.classList.toggle('active');
};

/**
 * Открытие модального окна.
 */
window.openModal = function(id) {
    const form = getEl('workplaceForm');
    form.reset();
    getEl('editId').value = '';

    if (id) {
        const wp = allWorkplaces.find(w => w.id === id);
        if (!wp) return;

        getEl('editId').value = id;
        getEl('modalTitle').textContent = 'Редактировать рабочее место';
        getEl('f_company').value = wp.company || '';
        getEl('f_rm_number').value = wp.rm_number || '';
        getEl('f_position').value = wp.position || '';
        getEl('f_class').value = wp.class || '2';
        getEl('f_sout_date').value = wp.sout_date || '';
        getEl('f_valid_until').value = wp.valid_until || '';

        const opr = getOprCard(wp.position, wp.company);
        if (opr) {
            getEl('f_opr_card').value = opr.card_number || '';
            getEl('f_opr_date').value = opr.opr_date || '';
            getEl('f_has_people').value = opr.has_people || 'да';
        }
    } else {
        getEl('modalTitle').textContent = 'Добавить рабочее место';
    }
    getEl('modal').classList.add('active');
};

window.closeModal = function() {
    getEl('modal').classList.remove('active');
};

/**
 * Сохранение рабочего места (+ карты ОПР).
 */
window.saveWorkplace = async function(e) {
    e.preventDefault();
    const id = getEl('editId').value;
    const company = getEl('f_company').value;
    const rm_number = getEl('f_rm_number').value.trim();
    const position = getEl('f_position').value.trim();
    const classValue = getEl('f_class').value;
    const sout_date = getEl('f_sout_date').value.trim();
    const valid_until = getEl('f_valid_until').value.trim();

    const opr_card = getEl('f_opr_card').value.trim();
    const opr_date = getEl('f_opr_date').value.trim();
    const has_people = getEl('f_has_people').value;

    const btn = getEl('saveBtn');
    btn.disabled = true;
    btn.textContent = 'Сохранение...';

    try {
        if (id) {
            const { error: soutError } = await supabase
                .from('sout_workplaces')
                .update({ company, rm_number, position, class: classValue, sout_date, valid_until })
                .eq('id', id);
            if (soutError) throw soutError;

            const existingOpr = getOprCard(position, company);
            if (existingOpr) {
                const { error: oprError } = await supabase
                    .from('opr_cards')
                    .update({ card_number: opr_card, opr_date, has_people })
                    .eq('id', existingOpr.id);
                if (oprError) throw oprError;
            } else if (opr_card || opr_date) {
                const { error: oprError } = await supabase
                    .from('opr_cards')
                    .insert({ company, position, card_number: opr_card, opr_date, has_people });
                if (oprError) throw oprError;
            }
        } else {
            const { error: soutError } = await supabase
                .from('sout_workplaces')
                .insert({ company, rm_number, position, class: classValue, sout_date, valid_until });
            if (soutError) throw soutError;

            if (opr_card || opr_date) {
                const { error: oprError } = await supabase
                    .from('opr_cards')
                    .insert({ company, position, card_number: opr_card, opr_date, has_people });
                if (oprError) throw oprError;
            }
        }

        closeModal();
        await loadData();
        renderAccordion();
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }

    btn.disabled = false;
    btn.textContent = '💾 Сохранить';
};

/**
 * Экспорт в Excel.
 */
window.exportToExcel = function() {
    const companyFilter = getEl('filterCompany').value;
    const companiesToExport = companyFilter ? [companyFilter] : companies;

    const data = [];
    companiesToExport.forEach(company => {
        const workplaces = getFilteredWorkplaces(company);
        workplaces.forEach(wp => {
            const opr = getOprCard(wp.position, wp.company);
            data.push({
                'Компания': companyLabels[company],
                '№ РМ': wp.rm_number || '',
                'Должность': wp.position,
                'Класс условий труда': wp.class || '',
                'Дата проведения СОУТ': wp.sout_date || '',
                'Срок действия': wp.valid_until || '',
                '№ карты ОПР': opr?.card_number || '',
                'Дата проведения ОПР': opr?.opr_date || '',
                'Факт людей': opr?.has_people || ''
            });
        });
    });

    if (data.length === 0) {
        alert('Нет данных для экспорта');
        return;
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'СОУТ и ОПР');

    ws['!cols'] = [
        { wch: 20 }, { wch: 12 }, { wch: 50 }, { wch: 8 },
        { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 12 }
    ];

    const fileName = `СОУТ_ОПР_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
};

async function init() {
    const session = await requireRoles(['admin', 'engineer', 'chief_engineer']);
    if (!session) return;

    // 1. Обновляем имя и роль
    await updateUserInfo();

    const role = getCurrentRole();

    // 2. Управление правами доступа
    if (role === 'admin' || role === 'engineer') {
        const btnAdd = getEl('btnAddWorkplace');
        if (btnAdd) btnAdd.style.display = 'inline-block';
    }

    if (role === 'chief_engineer') {
        document.body.classList.add('read-only-mode');
    }

    // 3. Настраиваем боковое меню
    applyRoleToSidebar();
    initSidebar();

    // 4. Загрузка данных
    await loadData();
    renderAccordion();
}

['filterCompany', 'filterPosition', 'filterClass'].forEach(id => {
    getEl(id).addEventListener('input', renderAccordion);
    getEl(id).addEventListener('change', renderAccordion);
});

window.handleLogout = logout;

init();