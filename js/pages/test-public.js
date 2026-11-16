/**
 * Логика публичного тестирования по охране труда (test-public.html).
 * Страница без авторизации — доступна сотрудникам для прохождения тестов.
 *
 * Безопасность:
 * - Ключи берутся из js/config.js (ранее были захардкожены в HTML
 *   с ДРУГИМ значением ключа — несоответствие устранено).
 * - Тексты вопросов/вариантов из БД экранируются (escapeHtml) при отрисовке.
 * - Список вопросов никогда не отправляется в сохраняемый результат
 *   (сохраняются только индексы ответов, а не копии вопросов).
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { escapeHtml, getEl } from '../utils.js';

// Публичная страница — собственный клиент (нет сессии пользователя)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Состояние
let programs = [];
let selectedQuestions = [];
let userAnswers = [];
let testFinished = false;
let currentProgramId = null;
let currentProgramName = '';

// Элементы
const programSelect = getEl('programSelect');
const startBtn = getEl('startBtn');
const resetBtn = getEl('resetBtn');
const finishBtn = getEl('finishBtn');
const finishHint = getEl('finishHint');
const questionsArea = getEl('questionsArea');
const finishArea = getEl('finishArea');
const resultArea = getEl('resultArea');
const personFields = getEl('personFields');
const fioInput = getEl('fioInput');
const positionInput = getEl('positionInput');

/**
 * Загрузка программ тестирования.
 */
async function loadPrograms() {
    const { data, error } = await supabase
        .from('test_programs')
        .select('*')
        .order('name');

    if (error) {
        console.error('Ошибка загрузки программ:', error);
        alert('Ошибка загрузки программ');
        return;
    }

    programs = data;
    programSelect.innerHTML = '';
    programs.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        programSelect.appendChild(opt);
    });
}

/**
 * Загрузка вопросов для выбранной программы.
 */
async function loadQuestions(programId) {
    const { data, error } = await supabase
        .from('test_questions')
        .select('*')
        .eq('program_id', programId);

    if (error) {
        console.error('Ошибка загрузки вопросов:', error);
        return [];
    }

    return data;
}

/**
 * Перемешивание массива (Fisher–Yates).
 */
function shuffleArray(arr) {
    const shuffled = arr.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Перемешивает варианты ответов для каждого вопроса,
 * возвращая новый массив вариантов и карту соответствия
 * нового индекса -> исходный индекс (для проверки правильности).
 */
function shuffleOptions(question) {
    const options = question.options || [];
    const order = shuffleArray(options.map((_, i) => i));
    return {
        options: order.map(i => options[i]),
        // correct_index из БД — исходный индекс; находим его новую позицию
        correctIndex: order.indexOf(question.correct_index)
    };
}

/**
 * Сброс теста.
 */
function resetTest() {
    currentProgramId = null;
    currentProgramName = '';
    selectedQuestions = [];
    userAnswers = [];
    testFinished = false;
    questionsArea.innerHTML = '';
    questionsArea.classList.add('hidden');
    finishArea.classList.add('hidden');
    resultArea.classList.add('hidden');
    resultArea.innerHTML = '';
    personFields.classList.add('hidden');
    fioInput.value = '';
    positionInput.value = '';
    finishBtn.disabled = true;
    finishHint.textContent = '';
}

/**
 * Начало теста.
 */
async function startTest() {
    resetTest();

    const programId = programSelect.value;
    if (!programId) {
        alert('Выберите программу.');
        return;
    }

    const program = programs.find(p => p.id === programId);
    if (!program) {
        alert('Программа не найдена.');
        return;
    }

    currentProgramId = program.id;
    currentProgramName = program.name;

    const allQuestions = await loadQuestions(programId);
    if (allQuestions.length === 0) {
        alert('Вопросы не найдены.');
        return;
    }

    const shuffled = shuffleArray(allQuestions);
    // Перемешиваем и порядок вопросов, и варианты ответов в каждом вопросе
    selectedQuestions = shuffled.slice(0, 5).map(q => {
        const { options, correctIndex } = shuffleOptions(q);
        return { ...q, options, correct_index: correctIndex };
    });
    userAnswers = new Array(selectedQuestions.length).fill(-1);

    personFields.classList.remove('hidden');
    renderQuestions();
    questionsArea.classList.remove('hidden');
    finishArea.classList.remove('hidden');
    resultArea.classList.add('hidden');
    finishBtn.disabled = true;
    finishHint.textContent = 'Заполните ФИО, должность и ответьте на все вопросы';
    checkCompletion();
}

/**
 * Отрисовка вопросов (тексты из БД экранируются).
 */
function renderQuestions() {
    if (!selectedQuestions.length) {
        questionsArea.innerHTML = '<p>Нет вопросов.</p>';
        return;
    }

    let html = '';
    selectedQuestions.forEach((q, idx) => {
        html += `<div class="question-block" data-qidx="${idx}">`;
        html += `<p>${idx + 1}. ${escapeHtml(q.question_text)}</p>`;
        const options = q.options || [];
        options.forEach((opt, optIdx) => {
            const checked = (userAnswers[idx] === optIdx) ? 'checked' : '';
            html += `<label>
                <input type="radio" name="q${idx}" value="${optIdx}" ${checked} data-qidx="${idx}" data-optidx="${optIdx}">
                ${escapeHtml(opt)}
            </label>`;
        });
        html += `</div>`;
    });

    questionsArea.innerHTML = html;

    const radios = questionsArea.querySelectorAll('input[type="radio"]');
    radios.forEach(radio => {
        radio.addEventListener('change', function(e) {
            const qIdx = parseInt(this.dataset.qidx);
            const optIdx = parseInt(this.dataset.optidx);
            if (!isNaN(qIdx) && !isNaN(optIdx)) {
                userAnswers[qIdx] = optIdx;
                checkCompletion();
            }
        });
    });
}

/**
 * Проверка готовности к завершению.
 */
function checkCompletion() {
    if (testFinished) {
        finishBtn.disabled = true;
        finishHint.textContent = 'Тест завершён';
        return;
    }

    const fio = fioInput.value.trim();
    const position = positionInput.value.trim();
    const allAnswered = userAnswers.every(ans => ans !== -1);
    const fieldsFilled = fio.length > 0 && position.length > 0;

    if (fieldsFilled && allAnswered) {
        finishBtn.disabled = false;
        finishHint.textContent = '';
    } else {
        finishBtn.disabled = true;
        let hint = '';
        if (!fieldsFilled) hint += 'Заполните ФИО и должность. ';
        if (!allAnswered) hint += 'Ответьте на все вопросы.';
        finishHint.textContent = hint;
    }
}

fioInput.addEventListener('input', checkCompletion);
positionInput.addEventListener('input', checkCompletion);

/**
 * Завершение теста: подсчёт результата, сохранение в БД и отображение.
 */
async function finishTest() {
    if (testFinished) return;

    const fio = fioInput.value.trim();
    const position = positionInput.value.trim();

    if (!fio || !position) {
        alert('Заполните ФИО и должность.');
        return;
    }

    const unanswered = userAnswers.some(ans => ans === -1);
    if (unanswered) {
        if (!confirm('Вы ответили не на все вопросы. Завершить тест всё равно?')) {
            return;
        }
    }

    testFinished = true;
    finishBtn.disabled = true;
    finishHint.textContent = 'Тест завершён';

    const organization = 'ООО "СК "Жилье"';
    // Дата сдачи теста фиксируется в момент завершения (дата без времени)
    const testDateStr = new Date().toLocaleDateString('ru-RU');

    const results = [];
    let correctCount = 0;

    selectedQuestions.forEach((q, idx) => {
        const userAns = userAnswers[idx];
        const isCorrect = (userAns === q.correct_index);
        if (isCorrect) correctCount++;
        results.push({
            question: q.question_text,
            options: q.options,
            userIndex: userAns,
            correctIndex: q.correct_index,
            isCorrect: isCorrect
        });
    });

    const total = results.length;
    const percent = Math.round((correctCount / total) * 100);
    const passed = percent >= 70;

    // Сохранение результата в БД (состав полей — исходная схема таблицы,
    // без поля organization, которого нет в test_results)
    const { error: saveError } = await supabase
        .from('test_results')
        .insert({
            employee_name: fio,
            employee_position: position,
            program_id: currentProgramId,
            score: correctCount,
            total_questions: total,
            percentage: percent,
            passed: passed,
            answers: results
        });

    if (saveError) {
        console.error('Ошибка сохранения результата:', saveError);
        alert('Ошибка сохранения результата. Обратитесь к администратору.');
        return;
    }

    // Отображение результата (тексты экранируются).
    // Шапка: название организации + вид теста, далее реквизиты и дата сдачи
    let resultHtml = `<div class="result-summary">
        <strong>${escapeHtml(organization)}. Тестирование по ОТ</strong><br>
        <strong>Программа:</strong> ${escapeHtml(currentProgramName)}<br>
        <strong>ФИО:</strong> ${escapeHtml(fio)}<br>
        <strong>Должность:</strong> ${escapeHtml(position)}<br>
        <strong>Дата сдачи теста:</strong> ${escapeHtml(testDateStr)}<br>
        <strong>Правильных ответов:</strong> ${correctCount} из ${total} (${percent}%)<br>
        <strong>Результат:</strong> ${passed ? '✅ ЗАЧТЕНО' : '❌ НЕ ЗАЧТЕНО'}
    </div>`;

    resultHtml += `<div style="margin-bottom:10px; font-weight:600;">Детали ответов:</div>`;
    resultHtml += `<div id="resultList">`;

    results.forEach((r, idx) => {
        const userText = (r.userIndex !== -1) ? r.options[r.userIndex] : '— (не выбран)';
        const correctText = r.options[r.correctIndex];
        const statusClass = r.isCorrect ? 'correct' : 'wrong';
        const statusText = r.isCorrect ? '✔ Верно' : '✘ Неверно';

        resultHtml += `<div class="result-item">
            <span class="q">${idx + 1}. ${escapeHtml(r.question)}</span>
            <span class="user-answer">Ваш ответ: ${escapeHtml(userText)}</span>
            <span class="correct-answer">Правильный: ${escapeHtml(correctText)}</span>
            <span class="status ${statusClass}">${statusText}</span>
        </div>`;
    });

    resultHtml += `</div>`;
    resultHtml += `<div style="margin-top:15px;">
        <button class="btn print-btn" onclick="window.print()">🖨️ Сохранить как PDF</button>
    </div>`;

    resultArea.innerHTML = resultHtml;
    resultArea.classList.remove('hidden');

    const radios = questionsArea.querySelectorAll('input[type="radio"]');
    radios.forEach(r => r.disabled = true);
}

// Обработчики
startBtn.addEventListener('click', startTest);
resetBtn.addEventListener('click', resetTest);
finishBtn.addEventListener('click', finishTest);
programSelect.addEventListener('change', resetTest);

// Инициализация
loadPrograms();
resetTest();
