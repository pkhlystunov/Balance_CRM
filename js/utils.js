/**
 * Общие вспомогательные функции для всех страниц.
 */

/**
 * Экранирует HTML-спецсимволы в строке.
 * Обязательна к использованию при вставке данных из БД или
 * пользовательского ввода через innerHTML / шаблонные строки
 * (защита от XSS, в том числе через HTML-атрибуты).
 *
 * @param {string|null|undefined} value
 * @returns {string} безопасная строка
 */
export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Безопасная подстановка значения с fallback для «пусто».
 *
 * @param {string|null|undefined} value
 * @param {string} [fallback='—']
 * @returns {string}
 */
export function displayValue(value, fallback = '—') {
    const safe = escapeHtml(value);
    return safe === '' ? fallback : safe;
}

/**
 * Короткая ссылка на элемент по id.
 *
 * @param {string} id
 * @returns {HTMLElement}
 */
export function getEl(id) {
    return document.getElementById(id);
}

/**
 * Показывает текст ошибки в элементе на странице
 * (замена alert() для инлайн-сообщений).
 *
 * @param {string} elementId id элемента для вывода
 * @param {string} message текст ошибки
 */
export function showError(elementId, message) {
    const el = getEl(elementId);
    if (el) {
        el.textContent = message;
    }
}

/**
 * Скрывает текст ошибки в элементе.
 *
 * @param {string} elementId
 */
export function clearError(elementId) {
    showError(elementId, '');
}

/**
 * Форматирует дату в русском формате ДД.ММ.ГГГГ.
 *
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDateRu(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('ru-RU');
}

/**
 * Форматирует дату и время в русском формате.
 *
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDateTimeRu(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}
