/**
 * Единый клиент Supabase для всего приложения.
 * Все страницы импортируют отсюда, чтобы не создавать дубликаты клиента.
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
