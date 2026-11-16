/**
 * Логика страницы входа (index.html).
 *
 * Безопасность:
 * - Не логируем email/пароль и результат входа в консоль.
 * - Не показываем пользователю детали ошибки от Supabase
 *   (текст может раскрыть, существует ли аккаунт), только общие сообщения.
 * - При уже активной сессии — сразу редирект на dashboard.
 */
import { supabase } from '../supabase.js';
import { redirectIfLoggedIn } from '../auth.js';
import { getEl, showError, clearError } from '../utils.js';

const errorMessages = {
    'Invalid login credentials': 'Неверный email или пароль.',
    'Email not confirmed': 'Email не подтверждён. Проверьте почту.',
    'Too many requests': 'Слишком много попыток. Попробуйте позже.'
};

/**
 * Возвращает безопасное сообщение об ошибке входа.
 * Текст ошибки от Supabase не показывается напрямую.
 */
function friendlyAuthError(error) {
    if (error && errorMessages[error.message]) {
        return errorMessages[error.message];
    }
    return 'Не удалось выполнить вход. Проверьте данные и попробуйте ещё раз.';
}

/**
 * Загружает роль и имя пользователя из профиля в БД (не из localStorage).
 * @returns {{ role: string, fullName: string } | null}
 */
async function loadProfile(userId) {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', userId)
        .single();

    if (error || !profile) return null;

    localStorage.setItem('user_role', profile.role);
    localStorage.setItem('user_name', profile.full_name || 'Пользователь');
    localStorage.setItem('user_id', userId);

    return { role: profile.role, fullName: profile.full_name || 'Пользователь' };
}

/**
 * Обработчик входа. Экспортируется в window, так как вызывается из onclick в HTML.
 */
async function handleLogin() {
    const email = getEl('email').value.trim();
    const password = getEl('password').value;
    const btn = document.querySelector('.login-box button');

    clearError('error');

    if (!email || !password) {
        showError('error', 'Заполните email и пароль.');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Вход...';

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            showError('error', friendlyAuthError(error));
            return;
        }

        const profile = await loadProfile(data.user.id);
        if (!profile) {
            showError('error', 'Профиль не найден. Обратитесь к администратору.');
            await supabase.auth.signOut();
            return;
        }

        window.location.href = 'dashboard.html';
    } catch (e) {
        showError('error', 'Ошибка соединения. Попробуйте позже.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Войти';
    }
}

// Инициализация страницы
async function init() {
    // Если сессия уже активна — сразу на dashboard
    await redirectIfLoggedIn();

    getEl('email').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
    getEl('password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
}

window.handleLogin = handleLogin;

init();
