/**
 * Логика управления пользователями (users.html).
 * Доступ: только роль admin.
 */
// ВАЖНО: Пути ведут на уровень вверх, так как файл лежит в js/pages/
import { supabase } from '../supabase.js';
import { requireRoles, getCurrentRole, logout } from '../auth.js';
import { escapeHtml, displayValue, getEl, showError, clearError } from '../utils.js';

let allUsers = [];

const roleLabels = {
    'admin': { text: 'Администратор', class: 'role-admin' },
    'engineer': { text: 'Специалист по ОТ', class: 'role-engineer' },
    'chief_engineer': { text: 'Директор/Гл. инженер', class: 'role-chief' },
    'kladovshchik': { text: 'Кладовщик', class: 'role-kladovshchik' },
    'mechanic': { text: 'Механик', class: 'role-mechanic' },  // ← НОВАЯ РОЛЬ
    'user': { text: 'Пользователь', class: 'role-user' }
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ===== НОВЫЕ ФУНКЦИИ ДЛЯ НАВИГАЦИИ И UI =====

/**
 * Надежное обновление имени и роли в шапке.
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
                    // Сохраняем для ускорения
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
 * На этой странице доступен только admin, поэтому меню показывается полностью.
 * Но функция нужна для единообразия и защиты от ручного открытия URL.
 */
function applyRoleToSidebar() {
    const role = localStorage.getItem('user_role');
    const adminOnlyIds = ['menu-users'];
    const kladovshchikHiddenIds = [
        'menu-situational', 'menu-control', 'menu-test',
        'menu-personnel', 'menu-sout', 'menu-tech',
        'menu-analytics', 'menu-users'
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
}

// ===== ОРИГИНАЛЬНАЯ ЛОГИКА ПОЛЬЗОВАТЕЛЕЙ =====

/**
 * Загрузка списка пользователей.
 */
async function loadUsers() {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('name');
        
    if (error) {
        console.error('Ошибка загрузки:', error);
        getEl('userTableBody').innerHTML = 
            '<tr><td colspan="4" class="empty-state">Ошибка загрузки пользователей</td></tr>';
        return;
    }
    allUsers = data || [];
}

/**
 * Отрисовка таблицы.
 */
function renderUsers() {
    const tbody = getEl('userTableBody');
    if (allUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Нет пользователей. Сначала создайте их в Supabase Dashboard.</td></tr>';
        return;
    }

    tbody.innerHTML = allUsers.map(user => {
        const roleInfo = roleLabels[user.role] || { text: user.role, class: 'role-user' };
        const id = escapeHtml(user.id);
        return `
        <tr>
            <td><strong>${displayValue(user.name)}</strong></td>
            <td>${displayValue(user.email)}</td>
            <td><span class="role-badge ${roleInfo.class}">${escapeHtml(roleInfo.text)}</span></td>
            <td>
                <button class="btn btn-primary" onclick="openModal('${id}')">✏️</button>
            </td>
        </tr>
        `;
    }).join('');
}

/**
 * Открытие модального окна.
 */
window.openModal = function(userId) {
    const form = getEl('userForm');
    form.reset();
    getEl('editUserId').value = '';
    getEl('uuidGroup').style.display = 'none';
    clearError('formError');

    if (userId) {
        // Режим редактирования
        const user = allUsers.find(u => u.id === userId);
        if (!user) return;
        getEl('editUserId').value = userId;
        getEl('modalTitle').textContent = 'Редактировать пользователя';
        getEl('f_name').value = user.name || '';
        getEl('f_email').value = user.email || '';
        getEl('f_role').value = user.role || 'user';
    } else {
        // Режим создания
        getEl('modalTitle').textContent = 'Добавить пользователя';
        getEl('uuidGroup').style.display = 'block';
        getEl('f_uuid').required = true;
        getEl('f_email').value = '';
    }
    getEl('modal').classList.add('active');
};

window.closeModal = function() {
    getEl('modal').classList.remove('active');
};

/**
 * Сохранение пользователя.
 */
window.saveUser = async function(e) {
    e.preventDefault();
    clearError('formError');
    
    const userId = getEl('editUserId').value;
    const name = getEl('f_name').value.trim();
    const role = getEl('f_role').value;
    const uuidInput = getEl('f_uuid');
    
    const btn = getEl('saveBtn');
    btn.disabled = true;
    btn.textContent = 'Сохранение...';

    try {
        if (userId) {
            // Обновление
            const { data: currentUser, error: fetchError } = await supabase
                .from('profiles')
                .select('email')
                .eq('id', userId)
                .single();
            
            if (fetchError) throw new Error('Не удалось загрузить текущие данные');

            const { error } = await supabase.from('profiles').update({
                name,
                role,
                email: currentUser.email // Email менять нельзя через этот интерфейс обычно
            }).eq('id', userId);
            
            if (error) throw error;
        } else {
            // Создание
            const uuid = uuidInput.value.trim();
            if (!UUID_RE.test(uuid)) {
                throw new Error('Некорректный UUID. Скопируйте ID из Supabase → Authentication → Users.');
            }
            
            const { error } = await supabase.from('profiles').insert({
                id: uuid,
                name,
                role
            });
            
            if (error) throw error;
        }
        
        closeModal();
        await loadUsers();
        renderUsers();
    } catch (error) {
        showError('formError', 'Ошибка: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '💾 Сохранить';
    }
};

async function init() {
    // Проверка прав (только админ)
    const session = await requireRoles(['admin']);
    if (!session) return; 

    // 1. Обновляем имя и роль в шапке
    await updateUserInfo();
    
    // 2. Инициализируем меню
    applyRoleToSidebar();
    initSidebar();
    
    // 3. Загружаем данные
    await loadUsers();
    renderUsers();
}

window.handleLogout = logout;
init();