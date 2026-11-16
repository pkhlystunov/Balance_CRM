/**
 * Конфигурация Supabase.
 *
 * ВНИМАНИЕ: это ЕДИНСТВЕННОЕ место в проекте, где хранятся ключи.
 * Новые страницы обязаны импортировать клиент из js/supabase.js,
 * а не создавать свой экземпляр createClient().
 *
 * Примечание по безопасности: SUPABASE_ANON_KEY — публичный ключ,
 * он предназначен для использования в клиентском коде.
 * Реальную защиту данных обеспечивают RLS-политики на стороне Supabase.
 */
export const SUPABASE_URL = 'https://xtvfliynzoqscbfsdejj.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dmZsaXluem9xc2NiZnNkZWpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNjAzODYsImV4cCI6MjEwODgzNjM4Nn0._fslUCBVos6btO819t_GYQfdPiuWRbczR7AfhpJXZ8E';
