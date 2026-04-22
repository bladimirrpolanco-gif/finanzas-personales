const SUPABASE_URL = 'https://mcdxrduzwxcamvkqzrjy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jZHhyZHV6d3hjYW12a3F6cmp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4Mzk3OTIsImV4cCI6MjA5MjQxNTc5Mn0.uKM8CJfY1LbgAnhzlBvuIxrR7TAgtrCjyiu8BCxwFkw';

// Inicializar el cliente globalmente
window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
