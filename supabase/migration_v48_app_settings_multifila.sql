-- v48: permitir más de una fila en app_settings (id=1 config empresa, id=2 orden de documentos, etc.)
-- El CHECK (id=1) de v38 impedía guardar el orden de carpetas (id=2). Lo quitamos.
alter table app_settings drop constraint if exists app_settings_single;
