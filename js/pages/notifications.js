/**
 * Логика центра уведомлений (notifications.html).
 */
import { supabase } from '../supabase.js';
import { requireAuth, getCurrentRole, logout } from '../auth.js';
import { escapeHtml, getEl, formatDateTimeRu } from '../utils.js';

let notifications = [];

const typeIcons = {
    'sout': '📋',
    'training': '🎓',
    'siz': '🦺',
    'tech': '🔧'  // ← НОВАЯ ИКОНКА
};

const typeLabels = {
    'sout': 'СОУТ/ОПР',
    'training': 'Обучение',
    'siz': 'СИЗ',
    'tech': 'Техника'  // ← НОВАЯ МЕТКА
};

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

// ===== ЛОГИКА УВЕДОМЛЕНИЙ =====

async function loadNotifications() {
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

    if (error) {
        console.error(error);
        return;
    }
    notifications = data || [];
}

function renderNotifications() {
    const container = getEl('notificationList');

    if (notifications.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">✅</div>
                <p>Нет активных уведомлений</p>
                <p style="font-size:13px;margin-top:8px;">Все сроки в порядке!</p>
            </div>`;
        return;
    }

    container.innerHTML = notifications.map(n => {
        const icon = typeIcons[n.type] || '🔔';
        const label = escapeHtml(typeLabels[n.type] || n.type);
        const title = escapeHtml(n.title);
        const message = escapeHtml(n.message);
        const link = escapeHtml(n.link || '');
        const date = formatDateTimeRu(n.created_at);
        const id = escapeHtml(n.id);

        return `
            <div class="notification-card ${n.is_read ? '' : 'unread'} severity-${escapeHtml(n.severity)}"
                 onclick="handleClick('${id}', '${link}')">
                <div class="notif-icon">${icon}</div>
                <div class="notif-content">
                    <div class="notif-title">${title}</div>
                    <div class="notif-message">${message}</div>
                    <div class="notif-meta">${label} • ${date}${n.is_read ? '' : ' • 🆕 Новое'}</div>
                </div>
                <button class="btn-delete-notif" onclick="event.stopPropagation(); deleteNotification('${id}')" title="Удалить уведомление">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
    }).join('');
}

window.deleteNotification = async function(id) {
    if (confirm('Удалить это уведомление?')) {
        await supabase.from('notifications').delete().eq('id', id);
        await loadNotifications();
        renderNotifications();
        updateBadge();
    }
};

window.markAllRead = async function() {
    if (notifications.length === 0) return;
    
    if (confirm('Вы уверены, что хотите удалить все уведомления из списка?')) {
        const ids = notifications.map(n => n.id);
        await supabase.from('notifications').delete().in('id', ids);
        notifications = [];
        renderNotifications();
        updateBadge();
    }
};

window.handleClick = async function(id, link) {
    // Добавлен tech.html в список разрешённых ссылок
    const allowedLinks = ['personnel.html', 'siz-registry.html', 'sout-opr.html', 'tech.html', 'test-analytics.html', 'users.html'];
    
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    
    if (link && allowedLinks.includes(link)) {
        window.location.href = link;
    } else {
        await loadNotifications();
        renderNotifications();
    }
};

function updateBadge() {
    const unreadCount = notifications.filter(n => !n.is_read).length;
    try {
        const parentDoc = window.opener?.document || window.parent?.document;
        if (parentDoc) {
            const badge = parentDoc.getElementById('notif-badge');
            if (badge) {
                badge.textContent = unreadCount;
                badge.style.display = unreadCount > 0 ? 'flex' : 'none';
            }
        }
    } catch (e) {}
}

async function init() {
    const session = await requireAuth();
    if (!session) return;

    await updateUserInfo();
    applyRoleToSidebar();
    initSidebar();

    await loadNotifications();
    renderNotifications();
}

init();