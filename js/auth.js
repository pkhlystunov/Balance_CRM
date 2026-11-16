/**
 * Центральный модуль авторизации и контроля доступа.
 *
 * КЛЮЧЕВОЕ ПРАВИЛО БЕЗОПАСНОСТИ:
 * роль пользователя ВСЕГДА берётся из таблицы profiles в БД
 * по id активной сессии. Значение localStorage.user_role не
 * является источником истины и используется только для
 * отображения/кэша — оно может быть подделано пользователем.
 */
import { supabase } from './supabase.js';

/**
 * Загружает актуальный профиль пользователя из БД по сессии.
 * Обновляет кэш в localStorage актуальными значениями.
 *
 * @param {string} userId
 * @returns {{ role: string, fullName: string } | null} null — профиль не найден
 */
async function loadProfile(userId) {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', userId)
        .single();

    if (error || !profile) return null;

    // Обновляем кэш актуальными данными из БД
    localStorage.setItem('user_role', profile.role);
    localStorage.setItem('user_name', profile.full_name || 'Пользователь');
    localStorage.setItem('user_id', userId);

    return { role: profile.role, fullName: profile.full_name || 'Пользователь' };
}

/**
 * Гарантирует наличие активной сессии.
 * Если сессии нет — редирект на страницу входа.
 *
 * @returns {Promise<object|null>} сессия или null (страница уже редиректит)
 */
export async function requireAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = 'index.html';
        return null;
    }

    const profile = await loadProfile(session.user.id);
    if (!profile) {
        // Пользователь с сессией, но без профиля — выходим
        await supabase.auth.signOut();
        localStorage.clear();
        window.location.href = 'index.html';
        return null;
    }

    return session;
}

/**
 * Гарантирует наличие сессии и одну из разрешённых ролей.
 * Роль проверяется по БД, а не по localStorage.
 * Если роль не входит в список — редирект на dashboard с уведомлением.
 *
 * @param {string[]} allowedRoles список разрешённых ролей
 * @returns {Promise<object|null>} сессия или null
 */
export async function requireRoles(allowedRoles) {
    const session = await requireAuth();
    if (!session) return null;

    const role = localStorage.getItem('user_role');
    if (!allowedRoles.includes(role)) {
        alert('У вас нет доступа к этому разделу');
        window.location.href = 'dashboard.html';
        return null;
    }

    return session;
}

/**
 * Возвращает актуальную роль пользователя (только после requireAuth/requireRoles).
 *
 * @returns {string|null}
 */
export function getCurrentRole() {
    return localStorage.getItem('user_role');
}

/**
 * Возвращает отображаемое имя пользователя (после requireAuth).
 *
 * @returns {string|null}
 */
export function getCurrentUserName() {
    return localStorage.getItem('user_name');
}

/**
 * Единая процедура выхода: signOut + очистка localStorage + редирект.
 */
export async function logout() {
    await supabase.auth.signOut();
    localStorage.clear();
    window.location.href = 'index.html';
}

/**
 * Для страницы входа: если сессия уже активна —
 * сразу редирект на dashboard (не позволяем повторно логиниться).
 *
 * @returns {Promise<boolean>} true — сессия была активна (произошёл редирект)
 */
export async function redirectIfLoggedIn() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        const profile = await loadProfile(session.user.id);
        if (profile) {
            window.location.href = 'dashboard.html';
            return true;
        }
        // Сессия есть, профиля нет — сбрасываем сессию, чтобы не было подвешенного состояния
        await supabase.auth.signOut();
        localStorage.clear();
    }
    return false;
}
