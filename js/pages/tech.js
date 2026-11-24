/**
 * Логика реестра техники (tech.html).
 * Доступ: admin, engineer, chief_engineer, mechanic.
 */
import { supabase } from '../supabase.js';
import { requireRoles, getCurrentRole, logout } from '../auth.js';
import { escapeHtml, displayValue, getEl } from '../utils.js';

let allData = [];

// ===== ФУНКЦИИ НАВИГАЦИИ =====
async function updateUserInfo() {
    try {
        const userEl = document.getElementById('user-name');
        if (!userEl) return;
        let userName = localStorage.getItem('user_name');
        let role = localStorage.getItem('user_role');
        if (!userName || !role) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                const { data: profile } = await supabase.from('profiles').select('full_name, name, role').eq('id', session.user.id).single();
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

function applyRoleToSidebar() {
    const role = localStorage.getItem('user_role');
    const adminOnlyIds = ['menu-users'];
    const hiddenForRestricted = ['menu-situational', 'menu-control', 'menu-test', 'menu-personnel', 'menu-siz', 'menu-sout', 'menu-analytics', 'menu-users'];
    
    if (role === 'kladovshchik' || role === 'user') {
        hiddenForRestricted.forEach(id => {
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
        if (icon) icon.className = isCollapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
    });
    mobileToggle?.addEventListener('click', () => sidebar.classList.toggle('mobile-open'));
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && !sidebar.contains(e.target) && !mobileToggle.contains(e.target) && sidebar.classList.contains('mobile-open')) {
            sidebar.classList.remove('mobile-open');
        }
    });
}

// ===== ЛОГИКА ПОДСВЕТКИ ДАТ =====
function parseDate(str) {
    if (!str || str.trim() === '' || str.toLowerCase() === 'н/т') return null;
    const parts = str.trim().split('.');
    if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]);
    return null;
}

function getDateStatus(dateStr) {
    if (!dateStr) return { class: 'cell-empty', text: '—' };
    const val = dateStr.trim().toLowerCase();
    if (val === 'н/т') return { class: 'cell-nt', text: 'н/т' };

    const date = parseDate(dateStr);
    if (!date) return { class: 'cell-empty', text: dateStr };

    const now = new Date();
    const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { class: 'cell-expired', text: dateStr, title: `Просрочено на ${Math.abs(diffDays)} дн.` };
    if (diffDays <= 60) return { class: 'cell-warning', text: dateStr, title: `Истекает через ${diffDays} дн.` };
    return { class: 'cell-ok', text: dateStr };
}

// ===== ОСНОВНАЯ ЛОГИКА =====
async function loadData() {
    const { data, error } = await supabase.from('tech_registry').select('*').order('brand_model');
    if (error) {
        console.error('Ошибка:', error);
        getEl('tableBody').innerHTML = '<tr><td colspan="16" class="empty-state">Ошибка загрузки данных</td></tr>';
        return;
    }
    allData = data || [];
}

function getFilteredData() {
    const search = getEl('filterSearch').value.toLowerCase();
    const owner = getEl('filterOwner').value;
    return allData.filter(row => {
        if (search && !row.brand_model.toLowerCase().includes(search) && !(row.license_plate && row.license_plate.toLowerCase().includes(search))) return false;
        if (owner && row.owner !== owner) return false;
        return true;
    });
}

function renderTable() {
    const filtered = getFilteredData();
    const tbody = getEl('tableBody');

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="16" class="empty-state">Нет данных по выбранным фильтрам</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(row => {
        const id = escapeHtml(row.id);
        
        const cto = getDateStatus(row.cto_date);
        const pto = getDateStatus(row.pto_date);
        const epb = getDateStatus(row.epb_date);
        const diagDate = getDateStatus(row.diagnostic_card_date);
        const insDate = getDateStatus(row.insurance_date);

        // ВАЖНО: добавлен onclick на всю строку <tr>
        return `
            <tr onclick="openModal('${id}')" style="cursor: pointer;">
                <td><strong>${displayValue(row.brand_model)}</strong></td>
                <td>${displayValue(row.license_plate)}</td>
                <td>${displayValue(row.owner)}</td>
                <td>${displayValue(row.sout)}</td>
                <td>${displayValue(row.driver)}</td>
                <td>${displayValue(row.city)}</td>
                <td>${displayValue(row.factory_number)}</td>
                <td class="${cto.class}" title="${cto.title || ''}">${cto.text}</td>
                <td class="${pto.class}" title="${pto.title || ''}">${pto.text}</td>
                <td class="${epb.class}" title="${epb.title || ''}">${epb.text}</td>
                <td>${displayValue(row.epb_certificate_date)}</td>
                <td>${displayValue(row.diagnostic_card_number)}</td>
                <td class="${diagDate.class}" title="${diagDate.title || ''}">${diagDate.text}</td>
                <td>${displayValue(row.insurance)}</td>
                <td class="${insDate.class}" title="${insDate.title || ''}">${insDate.text}</td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); openModal('${id}')">✏️</button>
                </td>
            </tr>
        `;
    }).join('');
}

// ===== ОТКРЫТИЕ МОДАЛЬНОГО ОКНА =====
window.openModal = function(id) {
    const modal = getEl('modal');
    const form = getEl('techForm');
    const editIdField = getEl('editId');
    
    if (!modal || !form) {
        console.error('Модальное окно или форма не найдены');
        return;
    }
    
    form.reset();
    if (editIdField) editIdField.value = '';

    if (id) {
        const row = allData.find(r => r.id === id);
        if (!row) return;
        
        if (editIdField) editIdField.value = id;
        
        const titleEl = getEl('modalTitle');
        if (titleEl) titleEl.textContent = 'Редактировать: ' + row.brand_model;
        
        // Заполняем все поля
        const fields = [
            'f_brand_model', 'f_license_plate', 'f_owner', 'f_sout',
            'f_driver', 'f_city', 'f_factory_number', 'f_status',
            'f_cto_date', 'f_pto_date', 'f_epb_date', 'f_epb_certificate_date',
            'f_diagnostic_card_number', 'f_diagnostic_card_date',
            'f_insurance', 'f_insurance_date'
        ];
        
        fields.forEach(fieldId => {
            const el = getEl(fieldId);
            if (el) {
                el.value = row[fieldId.replace('f_', '')] || '';
            }
        });
    } else {
        const titleEl = getEl('modalTitle');
        if (titleEl) titleEl.textContent = 'Добавить технику';
    }
    
    modal.classList.add('active');
};

window.closeModal = function() { 
    const modal = getEl('modal');
    if (modal) modal.classList.remove('active');
};

window.saveTech = async function(e) {
    e.preventDefault();
    const saveBtn = getEl('saveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Сохранение...';

    const id = getEl('editId').value;
    const payload = {
        brand_model: getEl('f_brand_model').value.trim(),
        license_plate: getEl('f_license_plate').value.trim(),
        owner: getEl('f_owner').value,
        sout: getEl('f_sout').value,
        driver: getEl('f_driver').value.trim(),
        city: getEl('f_city').value,
        factory_number: getEl('f_factory_number').value.trim(),
        status: getEl('f_status').value,
        cto_date: getEl('f_cto_date').value.trim(),
        pto_date: getEl('f_pto_date').value.trim(),
        epb_date: getEl('f_epb_date').value.trim(),
        epb_certificate_date: getEl('f_epb_certificate_date').value.trim(),
        diagnostic_card_number: getEl('f_diagnostic_card_number').value.trim(),
        diagnostic_card_date: getEl('f_diagnostic_card_date').value.trim(),
        insurance: getEl('f_insurance').value.trim(),
        insurance_date: getEl('f_insurance_date').value.trim()
    };

    let error;
    if (id) {
        const res = await supabase.from('tech_registry').update(payload).eq('id', id);
        error = res.error;
    } else {
        const res = await supabase.from('tech_registry').insert(payload);
        error = res.error;
    }

    if (error) {
        alert('Ошибка сохранения: ' + error.message);
    } else {
        closeModal();
        await loadData();
        renderTable();
    }

    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Сохранить';
};

window.exportToExcel = function() {
    const filtered = getFilteredData();
    if (filtered.length === 0) { alert('Нет данных для экспорта'); return; }

    const data = filtered.map(row => ({
        'Марка, модель': row.brand_model || '', 'г/н': row.license_plate || '', 'Владелец': row.owner || '',
        'СОУТ': row.sout || '', 'Водитель': row.driver || '', 'Город': row.city || '', 'Заводской №': row.factory_number || '',
        'ЧТО': row.cto_date || '', 'ПТО': row.pto_date || '', 'ЭПБ': row.epb_date || '', 'Статус': row.status || '',
        'ЭПБ на сертификат от': row.epb_certificate_date || '', '№ Диагностической карты': row.diagnostic_card_number || '',
        'Дата ДК': row.diagnostic_card_date || '', 'Страховка': row.insurance || '', 'Дата страховки': row.insurance_date || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Реестр техники');
    ws['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 20 }, { wch: 6 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 12 }];
    XLSX.writeFile(wb, `Реестр_техники_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

async function init() {
    const session = await requireRoles(['admin', 'engineer', 'chief_engineer', 'mechanic']);
    if (!session) return;

    await updateUserInfo();
    const role = getCurrentRole();

    if (role === 'admin' || role === 'engineer' || role === 'chief_engineer' || role === 'mechanic') {
        const btnAdd = getEl('btnAddTech');
        if (btnAdd) btnAdd.style.display = 'inline-block';
    }

    applyRoleToSidebar();
    initSidebar();
    await loadData();
    renderTable();
}

['filterSearch', 'filterOwner'].forEach(id => {
    getEl(id).addEventListener('input', renderTable);
    getEl(id).addEventListener('change', renderTable);
});

getEl('modal').addEventListener('click', function(e) { if (e.target === this) closeModal(); });
window.handleLogout = logout;
init();