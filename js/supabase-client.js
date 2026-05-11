const SUPABASE_URL = 'https://uwkmrkllvplmjkiiozso.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3a21ya2xsdnBsbWpraWlvenNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NTIyOTQsImV4cCI6MjA5NDAyODI5NH0.6RNZmbXh96scP-UkYinRTpwRgjABSnSP9Vr9185yiaI';

// Inicializar el cliente globalmente
window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
