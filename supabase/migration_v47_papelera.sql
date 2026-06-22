-- v47: papelera de documentos (borrado suave, recuperable hasta 90 días)
alter table documentos add column if not exists eliminado_at timestamptz;
