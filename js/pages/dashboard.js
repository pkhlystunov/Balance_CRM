/**
 * Логика рабочего стола (dashboard.html).
 */
import { supabase } from '../supabase.js';
import { requireAuth, getCurrentRole, getCurrentUserName, logout } from '../auth.js';

const getEl = (id) => document.getElementById(id);

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

function applyRoleToUI(role) {
    const menuUsers = getEl('menu-users');
    if (menuUsers && role !== 'admin') menuUsers.style.display = 'none';

    if (role === 'kladovshchik') {
        ['menu-situational', 'menu-control', 'menu-test', 'menu-personnel', 'menu-sout', 'menu-analytics', 'menu-users'].forEach(id => {
            const el = getEl(id);
            if (el) el.style.display = 'none';
        });
    }
}

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

async function init() {
    const session = await requireAuth();
    if (!session) return;

    await updateUserInfo(); // 👈 Исправление "Загрузка..."
    const role = getCurrentRole();
    
    applyRoleToUI(role);
    setupWelcome();
    initSidebar();

    await loadNotificationBadge();
    setInterval(loadNotificationBadge, 60000);

    if (role === 'admin' || role === 'engineer' || role === 'chief_engineer') {
        try {
            const { generateNotifications } = await import('../generate-notifications.js');
            await generateNotifications();
            await loadNotificationBadge();
        } catch (e) { console.error('Ошибка генерации уведомлений:', e); }
    }
    
    const statOverdue = getEl('stat-overdue');
    const statOk = getEl('stat-ok');
    if (statOverdue) statOverdue.textContent = '5'; 
    if (statOk) statOk.textContent = '142'; 
}

window.handleLogout = logout;
init();