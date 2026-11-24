/**
 * Логика рабочего стола (dashboard.html).
 * С боковым меню и фильтрацией по ролям.
 */
import { supabase } from '../supabase.js';
import { requireAuth, getCurrentRole, getCurrentUserName, logout } from '../auth.js';
import { getEl } from '../utils.js';

/**
 * Надежное обновление имени и роли в шапке.
 */
async function updateUserInfo() {
    try {
        const userEl = getEl('user-name');
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
        const userEl = getEl('user-name');
        if (userEl) userEl.textContent = 'Ошибка загрузки';
    }
}

/**
 * Обновляет счётчик непрочитанных уведомлений.
 */
async function loadNotificationBadge() {
    try {
        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('is_read', false);

        if (error) throw error;
        const badge = getEl('notif-badge');
        const statNotif = getEl('stat-notifications');
        if (badge) {
            badge.textContent = count || 0;
            badge.classList.toggle('show', !!count && count > 0);
        }
        if (statNotif) statNotif.textContent = count || 0;
    } catch (e) {
        console.log('Ошибка загрузки бейджа уведомлений:', e);
    }
}

/**
 * Скрывает пункты бокового меню согласно роли.
 * ВАЖНО: кладовщик видит ТОЛЬКО «Реестр СИЗ» и «Уведомления».
 */
function applyRoleToUI(role) {
    // Пункт «Пользователи» — только для админа
    const menuUsers = getEl('menu-users');
    if (menuUsers && role !== 'admin') menuUsers.style.display = 'none';

    // Скрываем недоступные модули для кладовщика и обычного пользователя
    // menu-siz и menu-notifications ОСТАЮТСЯ видимыми для кладовщика!
    if (role === 'kladovshchik' || role === 'user') {
        [
            'menu-situational', 'menu-control', 'menu-test',
            'menu-personnel', 'menu-sout', 'menu-tech',
            'menu-analytics', 'menu-users'
        ].forEach(id => {
            const el = getEl(id);
            if (el) el.style.display = 'none';
        });
    }
}

/**
 * Настраивает приветствие и дату.
 */
function setupWelcome() {
    const userName = getCurrentUserName() || 'Пользователь';
    const hour = new Date().getHours();
    let greeting = 'Добро пожаловать';
    if (hour >= 5 && hour < 12) greeting = 'Доброе утро';
    else if (hour >= 12 && hour < 18) greeting = 'Добрый день';
    else if (hour >= 18 && hour < 23) greeting = 'Добрый вечер';
    
    const welcomeEl = getEl('welcome-text');
    if (welcomeEl) welcomeEl.textContent = `${greeting}, ${userName}! 👋`;

    const dateEl = getEl('current-date');
    if (dateEl) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = `Сегодня: ${new Date().toLocaleDateString('ru-RU', options)}`;
    }
}

/**
 * Инициализация сворачивания бокового меню.
 */
function initSidebar() {
    const sidebar = getEl('sidebar');
    const toggleBtn = getEl('toggle-sidebar');
    const mobileToggle = getEl('mobile-toggle');
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

/**
 * Главная функция инициализации.
 */
async function init() {
    const session = await requireAuth();
    if (!session) return;

    // 1. Обновляем имя и роль в шапке
    await updateUserInfo();
    
    const role = getCurrentRole();
    
    // 2. Фильтруем меню по роли
    applyRoleToUI(role);
    
    // 3. Приветствие и дата
    setupWelcome();
    
    // 4. Боковое меню (сворачивание)
    initSidebar();

    // 5. Бейдж уведомлений
    await loadNotificationBadge();
    setInterval(loadNotificationBadge, 60000);

// 6. Генерация уведомлений (admin, engineer, chief_engineer, mechanic)
if (role === 'admin' || role === 'engineer' || role === 'chief_engineer' || role === 'mechanic') {
    try {
        const { generateNotifications } = await import('../generate-notifications.js');
        await generateNotifications();
        await loadNotificationBadge();
    } catch (e) { console.error('Ошибка генерации уведомлений:', e); }
}
    
    // Заглушки для статистики (потом заменим на реальные запросы)
    const statOverdue = getEl('stat-overdue');
    const statOk = getEl('stat-ok');
    if (statOverdue) statOverdue.textContent = '0'; 
    if (statOk) statOk.textContent = '0'; 
}

window.handleLogout = logout;
init();