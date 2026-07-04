-- ============================================================
-- migration_v50_reset_password.sql
-- Recuperación de contraseña por correo (para admins), usando el OTP nativo de Supabase.
--   - user_profiles.email_recuperacion: correo REAL del admin (los logins son sintéticos @mumi.internal).
-- El código lo envía y verifica Supabase Auth (signInWithOtp / verifyOtp). La Edge Function
-- 'password-reset-confirm' solo cambia la contraseña cuando el correo verificado por OTP coincide
-- con el email_recuperacion guardado del admin.
-- ============================================================

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email_recuperacion text;
