/**
 * Генерация уведомлений с учетом роли пользователя.
 */
import { supabase } from './supabase.js';
import { getCurrentRole } from './auth.js';

const WARNING_DAYS_BEFORE_EXPIRY = 60;

// Парсер дат (ДД.ММ.ГГГГ или ММ.ГГГГ)
function parseDate(str) {
    if (!str || str.trim() === '') return null;
    const s = str.trim();
    if (/^\d{2}\.\d{4}$/.test(s)) {
        const [m, y] = s.split('.');
        return new Date(parseInt(y), parseInt(m) - 1, 1);
    }
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
        const [d, m, y] = s.split('.');
        return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    }
    return null;
}

export async function generateNotifications() {
    try {
        const role = getCurrentRole();
        
        // Определяем, какие типы уведомлений нужны этой роли
        const checkSoutOpr = ['admin', 'engineer', 'chief_engineer'].includes(role);
        const checkTraining = ['admin', 'engineer', 'chief_engineer'].includes(role);
        const checkSiz = ['admin', 'engineer', 'chief_engineer', 'kladovshchik'].includes(role);

        let createdCount = 0;
        const yesterday = new Date(Date.now() - 86400000).toISOString();

        // 1. Проверка СОУТ/ОПР (только для admin/engineer/chief_engineer)
        if (checkSoutOpr) {
            const { data: soutData } = await supabase.from('sout_workplaces').select('*');
            if (soutData) {
                for (const wp of soutData) {
                    const validUntil = parseDate(wp.valid_until);
                    if (!validUntil) continue;
                    
                    const now = new Date();
                    const daysLeft = Math.ceil((validUntil - now) / (1000 * 60 * 60 * 24));
                    
                    let severity = null;
                    let message = '';
                    
                    if (daysLeft < 0) {
                        severity = 'danger';
                        message = `⛔ Просрочено на ${Math.abs(daysLeft)} дн.`;
                    } else if (daysLeft <= WARNING_DAYS_BEFORE_EXPIRY) {
                        severity = 'warning';
                        message = `⚠️ Истекает через ${daysLeft} дн.`;
                    }

                    if (severity) {
                        const title = `${severity === 'danger' ? '⛔' : '⚠️'} Срок СОУТ истекает: ${wp.position}`;
                        // Проверка на дубликаты за последние 24 часа
                        const { count } = await supabase
                            .from('notifications')
                            .select('*', { count: 'exact', head: true })
                            .eq('title', title)
                            .gte('created_at', yesterday);

                        if (!count || count === 0) {
                            await supabase.from('notifications').insert({
                                type: 'sout',
                                title: title,
                                message: `${message}\nКомпания: ${wp.company}`,
                                link: 'sout-opr.html',
                                severity: severity
                            });
                            createdCount++;
                        }
                    }
                }
            }
        }

        // 2. Проверка Обучения (только для admin/engineer/chief_engineer)
        if (checkTraining) {
            const { data: trainingData } = await supabase.from('employees_training').select('*');
            if (trainingData) {
                // Группировка проблем по сотрудникам
                const employeeIssues = {};
                
                for (const emp of trainingData) {
                    if (emp.status === 'Уволен') continue;
                    
                    const issues = [];
                    const dateFields = [
                        { key: 'mo_valid', label: 'Медосмотр' },
                        { key: 'ot_a_valid', label: 'ОТ(А)' },
                        { key: 'ot_b_valid', label: 'ОТ(Б)' },
                        { key: 'ptm_valid', label: 'ПТМ' }
                    ];

                    for (const field of dateFields) {
                        const date = parseDate(emp[field.key]);
                        if (!date) continue;
                        
                        const now = new Date();
                        const daysLeft = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
                        
                        if (daysLeft < 0) {
                            issues.push({ type: 'danger', text: `${field.label} просрочен на ${Math.abs(daysLeft)} дн.` });
                        } else if (daysLeft <= WARNING_DAYS_BEFORE_EXPIRY) {
                            issues.push({ type: 'warning', text: `${field.label} истекает через ${daysLeft} дн.` });
                        }
                    }

                    if (issues.length > 0) {
                        if (!employeeIssues[emp.id]) {
                            employeeIssues[emp.id] = { 
                                full_name: emp.full_name, 
                                position: emp.position,
                                organization: emp.organization,
                                _issues: [] 
                            };
                        }
                        employeeIssues[emp.id]._issues.push(...issues);
                    }
                }

                // Создание одного уведомления на сотрудника
                for (const empId in employeeIssues) {
                    const emp = employeeIssues[empId];
                    const hasDanger = emp._issues.some(i => i.type === 'danger');
                    const severity = hasDanger ? 'danger' : 'warning';
                    const issuesList = emp._issues.map(i => `• ${i.text}`).join('\n');
                    
                    const title = `${hasDanger ? '⛔' : '⚠️'} Проблемы с обучением: ${emp.full_name}`;
                    
                    const { count } = await supabase
                        .from('notifications')
                        .select('*', { count: 'exact', head: true })
                        .eq('title', title)
                        .gte('created_at', yesterday);

                    if (!count || count === 0) {
                        await supabase.from('notifications').insert({
                            type: 'training',
                            title: title,
                            message: `${emp.position || ''} (${emp.organization || ''})\n${issuesList}`,
                            link: 'personnel.html',
                            severity: severity
                        });
                        createdCount++;
                    }
                }
            }
        }

        // 3. Проверка СИЗ (для всех, включая кладовщика)
        if (checkSiz) {
            const { data: sizData } = await supabase.from('employees_siz').select('*');
            if (sizData) {
                const employeeSizIssues = {};
                
                for (const siz of sizData) {
                    if (siz.status === 'Уволен') continue;
                    
                    const issues = [];
                    const summerDate = parseDate(siz.summer_issue_date);
                    const winterDate = parseDate(siz.winter_issue_date);
                    const now = new Date();

                    if (summerDate) {
                        const expirySummer = new Date(summerDate);
                        expirySummer.setMonth(expirySummer.getMonth() + 12);
                        const daysLeft = Math.ceil((expirySummer - now) / (1000 * 60 * 60 * 24));
                        
                        if (daysLeft < 0) issues.push({ type: 'danger', text: `Летний комплект просрочен на ${Math.abs(daysLeft)} дн.` });
                        else if (daysLeft <= WARNING_DAYS_BEFORE_EXPIRY) issues.push({ type: 'warning', text: `Летний комплект истекает через ${daysLeft} дн.` });
                    }

                    if (winterDate) {
                        const expiryWinter = new Date(winterDate);
                        expiryWinter.setMonth(expiryWinter.getMonth() + 24);
                        const daysLeft = Math.ceil((expiryWinter - now) / (1000 * 60 * 60 * 24));
                        
                        if (daysLeft < 0) issues.push({ type: 'danger', text: `Зимний комплект просрочен на ${Math.abs(daysLeft)} дн.` });
                        else if (daysLeft <= WARNING_DAYS_BEFORE_EXPIRY) issues.push({ type: 'warning', text: `Зимний комплект истекает через ${daysLeft} дн.` });
                    }

                    if (issues.length > 0) {
                        if (!employeeSizIssues[siz.id]) {
                            employeeSizIssues[siz.id] = { 
                                full_name: siz.full_name, 
                                position: siz.position,
                                organization: siz.organization,
                                _issues: [] 
                            };
                        }
                        employeeSizIssues[siz.id]._issues.push(...issues);
                    }
                }

                for (const empId in employeeSizIssues) {
                    const emp = employeeSizIssues[empId];
                    const hasDanger = emp._issues.some(i => i.type === 'danger');
                    const severity = hasDanger ? 'danger' : 'warning';
                    const issuesList = emp._issues.map(i => `• ${i.text}`).join('\n');
                    
                    const title = `${hasDanger ? '⛔' : '⚠️'} Истекает срок СИЗ: ${emp.full_name}`;
                    
                    const { count } = await supabase
                        .from('notifications')
                        .select('*', { count: 'exact', head: true })
                        .eq('title', title)
                        .gte('created_at', yesterday);

                    if (!count || count === 0) {
                        await supabase.from('notifications').insert({
                            type: 'siz',
                            title: title,
                            message: `${emp.position || ''} (${emp.organization || ''})\n${issuesList}`,
                            link: 'siz-registry.html',
                            severity: severity
                        });
                        createdCount++;
                    }
                }
            }
        }

        // Очистка старых уведомлений (>14 дней)
        try {
            await supabase.rpc('cleanup_old_notifications');
        } catch (e) { console.log('Cleanup skipped:', e.message); }

        return createdCount;
    } catch (e) {
        console.error('Ошибка генерации уведомлений:', e);
        return 0;
    }
}